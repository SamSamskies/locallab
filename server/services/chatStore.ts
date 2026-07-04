import { and, asc, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { chatConversations, chatMessages } from "../db/schema";
import type * as schema from "../db/schema";
import type {
  ChatContextType,
  ChatConversation,
  ChatMessage,
} from "../shared/schema";

type Database = BetterSQLite3Database<typeof schema>;

function toConversation(row: typeof chatConversations.$inferSelect): ChatConversation {
  return {
    id: row.id,
    contextType: row.contextType as ChatContextType,
    contextKey: row.contextKey,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessage(row: typeof chatMessages.$inferSelect): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as "user" | "assistant",
    content: row.content,
    createdAt: row.createdAt,
  };
}

export function normalizeContextKey(contextType: ChatContextType, contextKey: string): string {
  return contextType === "trend" ? contextKey.toLowerCase() : contextKey;
}

export function titleFromMessage(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}

export function listConversations(
  database: Database,
  contextType: ChatContextType,
  contextKey: string,
): ChatConversation[] {
  const key = normalizeContextKey(contextType, contextKey);
  return database
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.contextType, contextType), eq(chatConversations.contextKey, key)))
    .orderBy(desc(chatConversations.updatedAt))
    .all()
    .map(toConversation);
}

export function createConversation(
  database: Database,
  contextType: ChatContextType,
  contextKey: string,
  title: string | null,
): ChatConversation {
  const now = new Date().toISOString();
  const key = normalizeContextKey(contextType, contextKey);
  const insert = database
    .insert(chatConversations)
    .values({
      contextType,
      contextKey: key,
      title,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const row = database
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, Number(insert.lastInsertRowid)))
    .get();

  if (!row) {
    throw new Error("Failed to create conversation");
  }

  return toConversation(row);
}

export function getConversation(database: Database, id: number): ChatConversation | null {
  const row = database.select().from(chatConversations).where(eq(chatConversations.id, id)).get();
  return row ? toConversation(row) : null;
}

export function deleteConversation(database: Database, id: number): boolean {
  const result = database.delete(chatConversations).where(eq(chatConversations.id, id)).run();
  return result.changes > 0;
}

export function deleteConversationsForPanel(database: Database, panelId: number): void {
  database
    .delete(chatConversations)
    .where(and(eq(chatConversations.contextType, "panel"), eq(chatConversations.contextKey, String(panelId))))
    .run();
}

export function getConversationMessages(database: Database, conversationId: number): ChatMessage[] {
  return database
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt))
    .all()
    .map(toMessage);
}

export function appendMessages(
  database: Database,
  conversationId: number,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): ChatMessage[] {
  const now = new Date().toISOString();

  for (const message of messages) {
    database
      .insert(chatMessages)
      .values({
        conversationId,
        role: message.role,
        content: message.content,
        createdAt: now,
      })
      .run();
  }

  database
    .update(chatConversations)
    .set({ updatedAt: now })
    .where(eq(chatConversations.id, conversationId))
    .run();

  return getConversationMessages(database, conversationId);
}
