import type { Message } from "../../../types/chat";
import {
  saveChat,
  loadChat,
  listChats,
  deleteChat,
} from "../../../utils/chatHistory";
import {
  clearRepoMemory,
  addMemory,
  deleteMemory,
  listMemories,
} from "../../../utils/memory";

export const COMMANDS = [
  { cmd: "/timeline", desc: "browse commit history" },
  { cmd: "/clear history", desc: "wipe session memory for this repo" },
  { cmd: "/review", desc: "review current codebase" },
  { cmd: "/auto", desc: "toggle auto-approve for read/search tools" },
  {
    cmd: "/auto --force-all",
    desc: "auto-approve ALL tools including shell and writes (⚠ dangerous)",
  },
  { cmd: "/chat", desc: "chat history commands" },
  { cmd: "/chat list", desc: "list saved chats for this repo" },
  { cmd: "/chat load", desc: "load a saved chat by name" },
  { cmd: "/chat rename", desc: "rename the current chat" },
  { cmd: "/chat delete", desc: "delete a saved chat by name" },
  { cmd: "/memory", desc: "memory commands" },
  { cmd: "/memory list", desc: "list all memories for this repo" },
  { cmd: "/memory add", desc: "add a memory" },
  { cmd: "/memory delete", desc: "delete a memory by id" },
  { cmd: "/memory clear", desc: "clear all memories for this repo" },
];

type CommandContext = {
  repoPath: string;
  allMessages: Message[];
  autoApprove: boolean;
  forceApprove: boolean;
  chatName: string | null;
  chatNameRef: React.MutableRefObject<string | null>;
  setShowTimeline: (v: boolean) => void;
  setShowReview: (v: boolean) => void;
  setShowForceWarning: (v: boolean) => void;
  setForceApprove: (v: boolean) => void;
  setAutoApprove: (v: boolean) => void;
  setAllMessages: (fn: (prev: Message[]) => Message[]) => void;
  setCommitted: (fn: (prev: Message[]) => Message[]) => void;
  setRecentChats: (fn: (prev: string[]) => string[]) => void;
  updateChatName: (name: string) => void;
};

import React from "react";

function pushMsg(
  msg: Message,
  setCommitted: CommandContext["setCommitted"],
  setAllMessages: CommandContext["setAllMessages"],
) {
  setCommitted((prev) => [...prev, msg]);
  setAllMessages((prev) => [...prev, msg]);
}

function makeMsg(content: string): Message {
  return { role: "assistant", content, type: "text" };
}

export function handleCommand(text: string, ctx: CommandContext): boolean {
  const t = text.trim().toLowerCase();

  if (t === "/timeline") {
    ctx.setShowTimeline(true);
    return true;
  }

  if (t === "/review") {
    ctx.setShowReview(true);
    return true;
  }

  if (t === "/auto --force-all") {
    if (ctx.forceApprove) {
      ctx.setForceApprove(false);
      ctx.setAutoApprove(false);
      pushMsg(
        makeMsg("Force-all mode OFF — tools will ask for permission again."),
        ctx.setCommitted,
        ctx.setAllMessages,
      );
    } else {
      ctx.setShowForceWarning(true);
    }
    return true;
  }

  if (t === "/auto") {
    if (ctx.forceApprove) {
      ctx.setForceApprove(false);
      ctx.setAutoApprove(true);
      pushMsg(
        makeMsg(
          "Force-all mode OFF — switched to normal auto-approve (safe tools only).",
        ),
        ctx.setCommitted,
        ctx.setAllMessages,
      );
      return true;
    }
    const next = !ctx.autoApprove;
    ctx.setAutoApprove(next);
    pushMsg(
      makeMsg(
        next
          ? "Auto-approve ON — safe tools (read, search, fetch) will run without asking."
          : "Auto-approve OFF — all tools will ask for permission.",
      ),
      ctx.setCommitted,
      ctx.setAllMessages,
    );
    return true;
  }

  if (t === "/clear history") {
    clearRepoMemory(ctx.repoPath);
    pushMsg(
      makeMsg("History cleared for this repo."),
      ctx.setCommitted,
      ctx.setAllMessages,
    );
    return true;
  }

  if (t === "/chat") {
    pushMsg(
      makeMsg(
        "Chat commands: `/chat list` · `/chat load <n>` · `/chat rename <n>` · `/chat delete <n>`",
      ),
      ctx.setCommitted,
      ctx.setAllMessages,
    );
    return true;
  }

  if (t.startsWith("/chat rename")) {
    const parts = text.trim().split(/\s+/);
    const newName = parts.slice(2).join("-");
    if (!newName) {
      pushMsg(
        makeMsg("Usage: `/chat rename <new-name>`"),
        ctx.setCommitted,
        ctx.setAllMessages,
      );
      return true;
    }
    const oldName = ctx.chatNameRef.current;
    if (oldName) deleteChat(oldName);
    ctx.updateChatName(newName);
    saveChat(newName, ctx.repoPath, ctx.allMessages);
    ctx.setRecentChats((prev) =>
      [newName, ...prev.filter((n) => n !== newName && n !== oldName)].slice(
        0,
        10,
      ),
    );
    pushMsg(
      makeMsg(`Chat renamed to **${newName}**.`),
      ctx.setCommitted,
      ctx.setAllMessages,
    );
    return true;
  }

  if (t.startsWith("/chat delete")) {
    const parts = text.trim().split(/\s+/);
    const name = parts.slice(2).join("-");
    if (!name) {
      pushMsg(
        makeMsg("Usage: `/chat delete <n>`"),
        ctx.setCommitted,
        ctx.setAllMessages,
      );
      return true;
    }
    const deleted = deleteChat(name);
    if (!deleted) {
      pushMsg(
        makeMsg(`Chat **${name}** not found.`),
        ctx.setCommitted,
        ctx.setAllMessages,
      );
      return true;
    }
    if (ctx.chatNameRef.current === name) {
      ctx.chatNameRef.current = null;
      ctx.updateChatName("");
    }
    ctx.setRecentChats((prev) => prev.filter((n) => n !== name));
    pushMsg(
      makeMsg(`Chat **${name}** deleted.`),
      ctx.setCommitted,
      ctx.setAllMessages,
    );
    return true;
  }

  if (t === "/chat list") {
    const chats = listChats(ctx.repoPath);
    const content =
      chats.length === 0
        ? "No saved chats for this repo yet."
        : `Saved chats:\n\n${chats
            .map(
              (c) =>
                `- **${c.name}** · ${c.userMessageCount} messages · ${new Date(c.savedAt).toLocaleString()}`,
            )
            .join("\n")}`;
    pushMsg(makeMsg(content), ctx.setCommitted, ctx.setAllMessages);
    return true;
  }

  if (t.startsWith("/chat load")) {
    const parts = text.trim().split(/\s+/);
    const name = parts.slice(2).join("-");
    if (!name) {
      const chats = listChats(ctx.repoPath);
      const content =
        chats.length === 0
          ? "No saved chats found."
          : `Specify a chat name. Recent chats:\n\n${chats
              .slice(0, 10)
              .map((c) => `- **${c.name}**`)
              .join("\n")}`;
      pushMsg(makeMsg(content), ctx.setCommitted, ctx.setAllMessages);
      return true;
    }
    const saved = loadChat(name);
    if (!saved) {
      pushMsg(
        makeMsg(
          `Chat **${name}** not found. Use \`/chat list\` to see saved chats.`,
        ),
        ctx.setCommitted,
        ctx.setAllMessages,
      );
      return true;
    }
    ctx.updateChatName(name);

    ctx.setAllMessages(() => saved.messages);
    ctx.setCommitted(() => saved.messages);
    const notice = makeMsg(
      `Loaded chat **${name}** · ${saved.userMessageCount} messages · saved ${new Date(saved.savedAt).toLocaleString()}`,
    );
    ctx.setCommitted((prev) => [...prev, notice]);
    ctx.setAllMessages((prev) => [...prev, notice]);
    return true;
  }

  if (t === "/memory list" || t === "/memory") {
    const mems = listMemories(ctx.repoPath);
    const content =
      mems.length === 0
        ? "No memories stored for this repo yet."
        : `Memories for this repo:\n\n${mems.map((m) => `- [${m.id}] ${m.content}`).join("\n")}`;
    pushMsg(makeMsg(content), ctx.setCommitted, ctx.setAllMessages);
    return true;
  }

  if (t.startsWith("/memory add")) {
    const content = text.trim().slice("/memory add".length).trim();
    if (!content) {
      pushMsg(
        makeMsg("Usage: `/memory add <content>`"),
        ctx.setCommitted,
        ctx.setAllMessages,
      );
      return true;
    }
    const mem = addMemory(content, ctx.repoPath);
    pushMsg(
      makeMsg(`Memory saved **[${mem.id}]**: ${mem.content}`),
      ctx.setCommitted,
      ctx.setAllMessages,
    );
    return true;
  }

  if (t.startsWith("/memory delete")) {
    const id = text.trim().split(/\s+/)[2];
    if (!id) {
      pushMsg(
        makeMsg("Usage: `/memory delete <id>`"),
        ctx.setCommitted,
        ctx.setAllMessages,
      );
      return true;
    }
    const deleted = deleteMemory(id, ctx.repoPath);
    pushMsg(
      makeMsg(
        deleted
          ? `Memory **[${id}]** deleted.`
          : `Memory **[${id}]** not found.`,
      ),
      ctx.setCommitted,
      ctx.setAllMessages,
    );
    return true;
  }

  if (t === "/memory clear") {
    clearRepoMemory(ctx.repoPath);
    pushMsg(
      makeMsg("All memories cleared for this repo."),
      ctx.setCommitted,
      ctx.setAllMessages,
    );
    return true;
  }

  return false;
}
