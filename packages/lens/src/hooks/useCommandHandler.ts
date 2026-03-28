import { createSession } from "@ridit/lens-core";
import type { UIMessage } from "../components/chat/Message";

interface CommandContext {
  repoPath: string;
  autoApprove: boolean;
  forceApprove: boolean;
  setAutoApprove: (v: boolean) => void;
  setForceApprove: (v: boolean) => void;
  setShowForceWarning: (v: boolean) => void;
  pushMsg: (msg: UIMessage) => void;
  resetSession: () => void;
}

export function handleCommand(text: string, ctx: CommandContext): boolean {
  const t = text.trim().toLowerCase();

  if (t === "/auto --force-all") {
    if (ctx.forceApprove) {
      ctx.setForceApprove(false);
      ctx.setAutoApprove(false);
      ctx.pushMsg({
        role: "assistant",
        type: "text",
        content: "Force-all mode OFF — tools will ask for permission again.",
      });
    } else {
      ctx.setShowForceWarning(true);
    }
    return true;
  }

  if (t === "/auto") {
    if (ctx.forceApprove) {
      ctx.setForceApprove(false);
      ctx.setAutoApprove(true);
      ctx.pushMsg({
        role: "assistant",
        type: "text",
        content:
          "Force-all mode OFF — switched to normal auto-approve (safe tools only).",
      });
      return true;
    }
    const next = !ctx.autoApprove;
    ctx.setAutoApprove(next);
    ctx.pushMsg({
      role: "assistant",
      type: "text",
      content: next
        ? "Auto-approve ON — safe tools (read, search, grep) will run without asking."
        : "Auto-approve OFF — all tools will ask for permission.",
    });
    return true;
  }

  if (t === "/clear history") {
    ctx.resetSession();
    ctx.pushMsg({
      role: "assistant",
      type: "text",
      content: "History cleared for this repo.",
    });
    return true;
  }

  if (t === "/memory" || t === "/memory list") {
    ctx.pushMsg({
      role: "assistant",
      type: "text",
      content:
        "Memory is managed automatically. Use `/memory add <text>` to save context.",
    });
    return true;
  }

  if (t.startsWith("/memory add")) {
    const content = text.trim().slice("/memory add".length).trim();
    if (!content) {
      ctx.pushMsg({
        role: "assistant",
        type: "text",
        content: "Usage: `/memory add <content>`",
      });
      return true;
    }
    ctx.pushMsg({
      role: "assistant",
      type: "text",
      content: `Memory saved: ${content}`,
    });
    return true;
  }

  if (t === "/memory clear") {
    ctx.pushMsg({
      role: "assistant",
      type: "text",
      content: "Memories cleared.",
    });
    return true;
  }

  return false;
}
