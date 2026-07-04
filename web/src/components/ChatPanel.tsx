import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatContextType, ChatConversation, ChatMessage } from "@shared/schema";
import {
  deleteConversation,
  fetchConversationMessages,
  fetchConversations,
  sendChatMessage,
} from "../api";
import { MarkdownContent } from "./MarkdownContent";

const DRAFT_ID = "draft";

interface ChatPanelProps {
  contextType: ChatContextType;
  contextKey: string;
  model: string;
}

function conversationLabel(conversation: ChatConversation): string {
  return conversation.title?.trim() || `Chat ${conversation.id}`;
}

export function ChatPanel({ contextType, contextKey, model }: ChatPanelProps) {
  const [open, setOpen] = useState(true);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | typeof DRAFT_ID>(DRAFT_ID);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [thinkingText, setThinkingText] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const title =
    contextType === "panel" ? "Chat about this panel" : "Chat about this trend";

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    streamRef.current?.abort();
    streamRef.current = null;
    setSending(false);
    setThinkingText("");
    setStreamingContent("");
    setInput("");
    setError(null);
  }, [contextKey, selectedId]);

  useEffect(() => {
    if (!open || !contextKey) return;

    let cancelled = false;
    setLoadingConversations(true);
    setError(null);

    fetchConversations(contextType, contextKey)
      .then((list) => {
        if (cancelled) return;
        setConversations(list);
        if (list.length > 0) {
          setSelectedId(list[0]!.id);
        } else {
          setSelectedId(DRAFT_ID);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load conversations");
        setConversations([]);
        setSelectedId(DRAFT_ID);
      })
      .finally(() => {
        if (!cancelled) setLoadingConversations(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contextType, contextKey, open]);

  useEffect(() => {
    if (!open || selectedId === DRAFT_ID) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);
    setError(null);

    fetchConversationMessages(selectedId)
      .then((list) => {
        if (cancelled) return;
        setMessages(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load messages");
        setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, thinkingText, scrollToBottom]);

  const handleNewChat = () => {
    streamRef.current?.abort();
    streamRef.current = null;
    setSelectedId(DRAFT_ID);
    setMessages([]);
    setThinkingText("");
    setStreamingContent("");
    setInput("");
    setError(null);
    setSending(false);
  };

  const handleDeleteConversation = async (id: number) => {
    setError(null);
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) {
        handleNewChat();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete conversation");
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !model || sending) return;

    streamRef.current?.abort();
    const controller = new AbortController();
    streamRef.current = controller;

    const optimisticUser: ChatMessage = {
      id: -1,
      conversationId: typeof selectedId === "number" ? selectedId : -1,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");
    setSending(true);
    setStatus("Thinking…");
    setThinkingText("");
    setStreamingContent("");
    setError(null);

    try {
      const result = await sendChatMessage(
        {
          conversationId: selectedId === DRAFT_ID ? undefined : selectedId,
          contextType,
          contextKey,
          model,
          message: trimmed,
        },
        (event) => {
          if (controller.signal.aborted) return;

          if (event.type === "status") {
            setStatus(event.message);
          } else if (event.type === "token") {
            if (event.phase === "thinking") {
              setThinkingText((prev) => prev + event.content);
            } else {
              setStreamingContent((prev) => prev + event.content);
            }
          }
        },
        controller.signal,
      );

      if (controller.signal.aborted) return;

      setConversations((prev) => {
        const without = prev.filter((c) => c.id !== result.conversation.id);
        return [result.conversation, ...without];
      });
      setSelectedId(result.conversation.id);
      setMessages(result.messages);
      setThinkingText("");
      setStreamingContent("");
    } catch (e) {
      if (controller.signal.aborted) return;
      setMessages((prev) => prev.filter((m) => m.id !== -1));
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      if (streamRef.current === controller) {
        streamRef.current = null;
      }
      if (!controller.signal.aborted) {
        setSending(false);
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="chat-panel">
      <button
        type="button"
        className="chat-panel-toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{title}</span>
        <span className="chat-panel-toggle-icon">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="chat-panel-body">
          <div className="chat-toolbar">
            <select
              className="model-select chat-conversation-select"
              value={selectedId === DRAFT_ID ? DRAFT_ID : String(selectedId)}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedId(value === DRAFT_ID ? DRAFT_ID : Number(value));
              }}
              disabled={loadingConversations || sending}
            >
              {selectedId === DRAFT_ID && (
                <option value={DRAFT_ID}>New chat</option>
              )}
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversationLabel(conversation)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleNewChat}
              disabled={sending}
            >
              New chat
            </button>
            {typeof selectedId === "number" && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void handleDeleteConversation(selectedId)}
                disabled={sending}
              >
                Delete
              </button>
            )}
          </div>

          {error && <div className="error-banner">{error}</div>}

          <div className="chat-messages">
            {loadingConversations || loadingMessages ? (
              <div className="loading chat-loading">
                <div className="spinner" />
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id >= 0 ? message.id : `draft-${message.createdAt}`}
                  className={`chat-message chat-message-${message.role}`}
                >
                  {message.role === "assistant" ? (
                    <MarkdownContent content={message.content} />
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              ))
            )}

            {sending && (
              <div className="chat-message chat-message-assistant chat-message-streaming">
                {thinkingText ? (
                  <details className="trend-insights-thinking" open>
                    <summary>Model reasoning</summary>
                    <pre>{thinkingText}</pre>
                  </details>
                ) : null}
                {streamingContent ? (
                  <MarkdownContent content={streamingContent} />
                ) : (
                  <p className="chat-status">{status}</p>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-row">
            <textarea
              className="chat-input"
              rows={2}
              placeholder={model ? "Ask a question…" : "Select a model to chat"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!model || sending}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSend()}
              disabled={!model || sending || !input.trim()}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
