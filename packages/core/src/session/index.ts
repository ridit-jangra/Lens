import type { CoreMessage } from "ai";

export interface Session {
  id: string;
  cwd: string;
  messages: CoreMessage[];
  createdAt: Date;
}

export function createSession(cwd: string): Session {
  return {
    cwd,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    messages: [],
  };
}

export function createSessionWithId(id: string, cwd: string): Session {
  return {
    cwd,
    id,
    createdAt: new Date(),
    messages: [],
  };
}

export function addMessage(
  session: Session,
  role: "user" | "assistant",
  content: string,
): Session {
  return { ...session, messages: [...session.messages, { content, role }] };
}

// Appends the full response messages from a chat turn (includes tool calls/results).
// Use this instead of addMessage for assistant turns to preserve tool context.
export function appendMessages(session: Session, messages: CoreMessage[]): Session {
  return { ...session, messages: [...session.messages, ...messages] };
}

export function getMessages(session: Session): CoreMessage[] {
  return session.messages;
}
