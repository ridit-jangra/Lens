import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from "fs";
import path from "path";
import os from "os";
import type { Message } from "../types/chat";

const LENS_DIR = path.join(os.homedir(), ".lens");
const CHATS_DIR = path.join(LENS_DIR, "chats");

export type SavedChat = {
  name: string;
  repoPath: string;
  messages: Message[];
  savedAt: string;
  userMessageCount: number;
};

function ensureChatsDir(): void {
  if (!existsSync(CHATS_DIR)) mkdirSync(CHATS_DIR, { recursive: true });
}

function chatFilePath(name: string): string {
  const safe = name.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  return path.join(CHATS_DIR, `${safe}.json`);
}

export function saveChat(
  name: string,
  repoPath: string,
  messages: Message[],
): void {
  ensureChatsDir();
  const data: SavedChat = {
    name,
    repoPath,
    messages,
    savedAt: new Date().toISOString(),
    userMessageCount: messages.filter((m) => m.role === "user").length,
  };
  writeFileSync(chatFilePath(name), JSON.stringify(data, null, 2), "utf-8");
}

export function loadChat(name: string): SavedChat | null {
  const filePath = chatFilePath(name);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as SavedChat;
  } catch {
    return null;
  }
}

export function listChats(repoPath?: string): SavedChat[] {
  ensureChatsDir();
  const files = readdirSync(CHATS_DIR).filter((f) => f.endsWith(".json"));
  const chats: SavedChat[] = [];
  for (const file of files) {
    try {
      const data = JSON.parse(
        readFileSync(path.join(CHATS_DIR, file), "utf-8"),
      ) as SavedChat;
      if (!repoPath || data.repoPath === repoPath) chats.push(data);
    } catch {
      // skip corrupt files
    }
  }
  return chats.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export function deleteChat(name: string): boolean {
  const filePath = chatFilePath(name);
  if (!existsSync(filePath)) return false;
  try {
    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getChatNameSuggestions(messages: Message[]): string[] {
  const userMsgs = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase().trim());

  const date = new Date().toISOString().slice(0, 10);

  if (userMsgs.length === 0) {
    return [`chat-${date}`, `session-${date}`, `new-chat`];
  }

  const suggestions: string[] = [];

  const toSlug = (s: string) =>
    s
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .join("-");

  const firstSlug = toSlug(userMsgs[0]!);
  if (firstSlug) suggestions.push(firstSlug);

  if (userMsgs.length > 1) {
    const lastSlug = toSlug(userMsgs[userMsgs.length - 1]!);
    if (lastSlug && lastSlug !== firstSlug) suggestions.push(lastSlug);
  }

  suggestions.push(`session-${date}`);

  return suggestions.slice(0, 3);
}
