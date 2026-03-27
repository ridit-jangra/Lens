import type { CoreMessage } from "ai";

export interface Session {
  id: string;
  cwd: string;
  messages: CoreMessage[];
  createdAt: Date;
}

export function createSession(cwd: string): Session {
  return {
    cwd: cwd,
    id: crypto.randomUUID(),
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

export function getMessages(session: Session): CoreMessage[] {
  return session.messages;
}
