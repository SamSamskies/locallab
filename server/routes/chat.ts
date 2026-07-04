import { Router, type Response } from "express";
import { db } from "../db/client";
import { buildChatSystemPrompt, generateChatReply, loadChatContext } from "../services/chat";
import {
  appendMessages,
  createConversation,
  deleteConversation,
  getConversation,
  getConversationMessages,
  listConversations,
  titleFromMessage,
} from "../services/chatStore";
import type { ChatContextType, ChatStreamEvent } from "../shared/schema";

export const chatRouter = Router();

function writeStreamEvent(res: Response, event: ChatStreamEvent): void {
  res.write(`${JSON.stringify(event)}\n`);
  const flush = (res as Response & { flush?: () => void }).flush;
  flush?.();
}

function parseContextType(value: unknown): ChatContextType | null {
  return value === "panel" || value === "trend" ? value : null;
}

chatRouter.get("/conversations", (req, res) => {
  const contextType = parseContextType(req.query.contextType);
  const contextKey = typeof req.query.contextKey === "string" ? req.query.contextKey.trim() : "";

  if (!contextType || !contextKey) {
    res.status(400).json({ error: "contextType and contextKey are required" });
    return;
  }

  res.json(listConversations(db, contextType, contextKey));
});

chatRouter.post("/conversations", (req, res) => {
  const contextType = parseContextType(req.body?.contextType);
  const contextKey = typeof req.body?.contextKey === "string" ? req.body.contextKey.trim() : "";

  if (!contextType || !contextKey) {
    res.status(400).json({ error: "contextType and contextKey are required" });
    return;
  }

  const context = loadChatContext(contextType, contextKey);
  if (!context) {
    res.status(404).json({ error: "Context not found" });
    return;
  }

  const conversation = createConversation(db, contextType, contextKey, null);
  res.status(201).json(conversation);
});

chatRouter.delete("/conversations/:id", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  if (!deleteConversation(db, id)) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.status(204).end();
});

chatRouter.get("/conversations/:id/messages", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  const conversation = getConversation(db, id);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(getConversationMessages(db, id));
});

chatRouter.post("/conversations/messages", async (req, res) => {
  const model = typeof req.body?.model === "string" ? req.body.model.trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const conversationIdRaw = req.body?.conversationId;
  const conversationId =
    conversationIdRaw == null || conversationIdRaw === ""
      ? null
      : Number(conversationIdRaw);
  const contextType = parseContextType(req.body?.contextType);
  const contextKey = typeof req.body?.contextKey === "string" ? req.body.contextKey.trim() : "";

  if (!model) {
    res.status(400).json({ error: "model is required" });
    return;
  }

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (conversationId != null && Number.isNaN(conversationId)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  let conversation = conversationId != null ? getConversation(db, conversationId) : null;

  if (conversationId != null && !conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (!conversation) {
    if (!contextType || !contextKey) {
      res.status(400).json({ error: "contextType and contextKey are required for a new conversation" });
      return;
    }

    const context = loadChatContext(contextType, contextKey);
    if (!context) {
      res.status(404).json({ error: "Context not found" });
      return;
    }

    conversation = createConversation(db, contextType, contextKey, titleFromMessage(message));
  }

  const context = loadChatContext(conversation.contextType, conversation.contextKey);
  if (!context) {
    res.status(404).json({ error: "Context not found" });
    return;
  }

  const history = getConversationMessages(db, conversation.id);
  const systemPrompt = buildChatSystemPrompt(context);

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: ChatStreamEvent) => writeStreamEvent(res, event);

  try {
    send({ type: "status", message: "Thinking…" });
    let contentText = "";
    await generateChatReply(systemPrompt, history, message, (content, phase) => {
      if (phase === "content") {
        contentText += content;
      }
      send({ type: "token", content, phase });
    }, model);

    const messages = appendMessages(db, conversation.id, [
      { role: "user", content: message },
      { role: "assistant", content: contentText },
    ]);

    const updatedConversation = getConversation(db, conversation.id);
    if (!updatedConversation) {
      throw new Error("Failed to load saved conversation");
    }

    send({ type: "done", conversation: updatedConversation, messages });
    res.end();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to generate chat reply";
    send({ type: "error", error: errorMessage });
    res.end();
  }
});
