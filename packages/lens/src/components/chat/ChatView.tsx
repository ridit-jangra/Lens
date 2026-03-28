import React, { useState, useRef } from "react";
import { Box, Text, Static, useInput } from "ink";
import { ACCENT, GREEN, RED } from "../../colors";
import { AppHeader, InputBox, ShortcutBar, TypewriterText } from "./StatusBar";
import { StaticMessage } from "./Message";
import type { UIMessage } from "./Message";
import { ProviderSetup } from "../provider/ProviderSetup";
import {
  useThinkingPhrase,
  useThinkingTip,
  useThinkingTimer,
} from "../../utils/thinking";
import {
  chat,
  createSession,
  createSessionWithId,
  addMessage,
  appendMessages,
  getMessages,
  getSystemPrompt,
  saveSession,
  loadSession,
  getLatestSession,
  getActiveModelName,
} from "@ridit/lens-core";
import { useChatInput } from "../../hooks/useChatInput";
import { handleCommand } from "../../hooks/useCommandHandler";
import Spinner from "ink-spinner";

// ── Static header (renders once, stays pinned) ────────────────────────────────

const HEADER_ITEMS = [{ type: "header" as const }];

// ── Commands ──────────────────────────────────────────────────────────────────

export const COMMANDS = [
  { cmd: "/auto", desc: "toggle auto-approve for read/search tools" },
  {
    cmd: "/auto --force-all",
    desc: "auto-approve ALL tools including shell and writes (⚠ dangerous)",
  },
  { cmd: "/clear history", desc: "wipe session memory for this repo" },
  { cmd: "/memory", desc: "memory commands" },
  { cmd: "/memory list", desc: "list all memories for this repo" },
  { cmd: "/memory add", desc: "add a memory" },
  { cmd: "/memory delete", desc: "delete a memory by id" },
  { cmd: "/memory clear", desc: "clear all memories" },
  { cmd: "/provider", desc: "configure AI provider" },
];

// ── Tool helpers ──────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  bash: "$",
  read: "r",
  write: "w",
  grep: "/",
  ls: "d",
  remember: "·",
  search: "?",
  scrape: "↓",
};

const SAFE_TOOLS = new Set(["read", "grep", "ls", "remember", "search", "scrape"]);

function getToolLabel(tool: string, args: unknown): string {
  if (!args || typeof args !== "object") return tool;
  const a = args as Record<string, unknown>;
  switch (tool) {
    case "read":
      return String(a.path ?? a.file_path ?? "");
    case "write":
      return String(a.path ?? a.file_path ?? a.filename ?? "");
    case "bash":
      return String(a.command ?? a.cmd ?? "");
    case "grep": {
      const p = String(a.pattern ?? "");
      const g = String(a.glob ?? "");
      return g ? `${p}  ${g}` : p;
    }
    case "ls":
      return String(a.path ?? ".");
    case "remember": {
      const c = String(a.content ?? "");
      return c.length > 80 ? c.slice(0, 80) + "…" : c;
    }
    default:
      return "";
  }
}

function summarizeResult(result: string): string {
  const first = result.split("\n")[0] ?? "";
  return first.length > 120 ? first.slice(0, 120) + "…" : first;
}

// ── Command palette ───────────────────────────────────────────────────────────

function CommandPalette({ query }: { query: string }) {
  const q = query.toLowerCase();
  const matches = COMMANDS.filter((c) => c.cmd.startsWith(q));
  if (!matches.length) return null;
  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={2}>
      {matches.map((c, i) => (
        <Box key={i} gap={2}>
          <Text
            color={c.cmd === query ? ACCENT : "white"}
            bold={c.cmd === query}
          >
            {c.cmd}
          </Text>
          <Text color="gray" dimColor>
            {c.desc}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

// ── Main runner ───────────────────────────────────────────────────────────────

export function ChatRunner({
  repoPath,
  autoForce = false,
  initialMessage,
  dev = false,
  single = false,
  sessionId,
}: {
  repoPath: string;
  autoForce?: boolean;
  initialMessage?: string;
  dev?: boolean;
  single?: boolean;
  sessionId?: string;
}) {
  const [stage, setStage] = useState<"idle" | "thinking">("idle");
  const [showProvider, setShowProvider] = useState(false);
  const [committed, setCommitted] = useState<UIMessage[]>([]);
  const [currentChunk, setCurrentChunk] = useState("");
  const [autoApprove, setAutoApprove] = useState(autoForce);
  const [forceApprove, setForceApprove] = useState(autoForce);
  const forceApproveRef = useRef(autoForce);
  const [approvalRequest, setApprovalRequest] = useState<{
    tool: string;
    args: unknown;
    label: string;
  } | null>(null);
  const approvalResolveRef = useRef<((approved: boolean) => void) | null>(null);

  // session:
  //   --session <id>  → resume if exists, else create with that exact id
  //   --single        → resume latest session for repo (or fresh)
  //   default         → fresh session
  const sessionRef = useRef(
    sessionId
      ? (loadSession(sessionId) ?? createSessionWithId(sessionId, repoPath))
      : single
        ? (getLatestSession(repoPath) ?? createSession(repoPath))
        : createSession(repoPath),
  );

  const abortRef = useRef<AbortController | null>(null);
  const pendingToolRef = useRef<{ tool: string; args: unknown } | null>(null);

  const isThinking = stage === "thinking";
  const thinkingPhrase = useThinkingPhrase(isThinking);
  const thinkingTip = useThinkingTip(isThinking);
  const thinkingTimer = useThinkingTimer(isThinking);

  const {
    inputValue,
    setInputValue,
    inputKey,
    pushHistory,
    historyUp,
    historyDown,
    clear,
  } = useChatInput(initialMessage);

  const pushMsg = (msg: UIMessage) => setCommitted((prev) => [...prev, msg]);

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (key.ctrl && input === "c") process.exit(0);

    if (approvalRequest) {
      if (input === "y") {
        approvalResolveRef.current?.(true);
        approvalResolveRef.current = null;
        setApprovalRequest(null);
      } else if (input === "n") {
        approvalResolveRef.current?.(false);
        approvalResolveRef.current = null;
        setApprovalRequest(null);
      } else if (input === "a") {
        forceApproveRef.current = true;
        setForceApprove(true);
        setAutoApprove(true);
        approvalResolveRef.current?.(true);
        approvalResolveRef.current = null;
        setApprovalRequest(null);
      }
      return;
    }

    if (key.ctrl && input === "f" && stage === "idle") {
      if (forceApprove) {
        forceApproveRef.current = false;
        setForceApprove(false);
        setAutoApprove(false);
        pushMsg({
          role: "assistant",
          type: "text",
          content: "Force-all mode OFF — tools will ask for permission again.",
        });
      } else {
        forceApproveRef.current = true;
        setForceApprove(true);
        setAutoApprove(true);
        pushMsg({
          role: "assistant",
          type: "text",
          content:
            "⚡⚡ Force-all mode ON (dangerous) — ALL tools auto-approved including shell and writes. Type /auto --force-all again to disable.",
        });
      }
      return;
    }

    if (stage === "thinking" && key.escape) {
      abortRef.current?.abort();
      abortRef.current = null;
      setCurrentChunk("");
      setStage("idle");
      return;
    }

    if (stage === "idle") {
      if (key.upArrow) {
        historyUp();
        return;
      }
      if (key.downArrow) {
        historyDown();
        return;
      }
      if (key.tab && inputValue.startsWith("/")) {
        const match = COMMANDS.find((c) =>
          c.cmd.startsWith(inputValue.toLowerCase()),
        );
        if (match) setInputValue(match.cmd);
        return;
      }
    }
  });

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = async (text: string) => {
    if (!text.trim() || stage !== "idle") return;

    pushHistory(text);

    if (text.startsWith("/")) {
      if (
        handleCommand(text, {
          repoPath,
          autoApprove,
          forceApprove,
          setAutoApprove,
          setForceApprove,
          pushMsg,
          resetSession: () => {
            sessionRef.current = createSession(repoPath);
          },
          openProvider: () => setShowProvider(true),
        })
      )
        return;
    }

    // dev mode — output structured JSON to stdout and exit
    if (dev) {
      sessionRef.current = addMessage(sessionRef.current, "user", text);

      const devTools: { tool: string; args: unknown; result: unknown }[] = [];
      try {
        await chat({
          messages: getMessages(sessionRef.current),
          system: getSystemPrompt(repoPath),
          onChunk: () => {},
          onToolCall: (tool, args) => {
            devTools.push({ tool, args, result: null });
          },
          onToolResult: (tool, result) => {
            const entry = [...devTools]
              .reverse()
              .find((t) => t.tool === tool && t.result === null);
            if (entry) entry.result = result;
          },
          onFinish: (fullText, responseMessages, model) => {
            if (!single) {
              sessionRef.current = appendMessages(
                sessionRef.current,
                responseMessages,
              );
              saveSession(sessionRef.current);
            }
            process.stdout.write(
              JSON.stringify({
                message: fullText,
                model,
                sessionId: sessionRef.current.id,
                tools: devTools,
              }) + "\n",
            );
            process.exit(0);
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(JSON.stringify({ error: msg }) + "\n");
        process.exit(1);
      }
      return;
    }

    pushMsg({ role: "user", type: "text", content: text });
    sessionRef.current = addMessage(sessionRef.current, "user", text);

    setStage("thinking");
    setCurrentChunk("");

    const abort = new AbortController();
    abortRef.current = abort;

    abort.signal.addEventListener("abort", () => {
      if (approvalResolveRef.current) {
        approvalResolveRef.current(false);
        approvalResolveRef.current = null;
        setApprovalRequest(null);
      }
    });

    try {
      await chat({
        messages: getMessages(sessionRef.current),
        system: getSystemPrompt(repoPath),
        onBeforeToolCall: (tool, args) => {
          if (forceApproveRef.current || SAFE_TOOLS.has(tool))
            return Promise.resolve(true);
          const label = getToolLabel(tool, args);
          return new Promise((resolve) => {
            setApprovalRequest({ tool, args, label });
            approvalResolveRef.current = resolve;
          });
        },
        onChunk: (chunk) => {
          if (!abort.signal.aborted) setCurrentChunk((prev) => prev + chunk);
        },
        onToolCall: (tool, args) => {
          if (!abort.signal.aborted) pendingToolRef.current = { tool, args };
        },
        onToolResult: (tool, result) => {
          if (!abort.signal.aborted && pendingToolRef.current) {
            const { tool: t, args } = pendingToolRef.current;
            const label = (getToolLabel(t, args) || TOOL_ICONS[t]) ?? "·";
            const a = args as Record<string, unknown>;

            let resultStr: string;
            let diff: { prev: string; next: string } | undefined;

            if (t === "write" && result && typeof result === "object") {
              const r = result as { ok: boolean; prevContent: string | null };
              resultStr = r.ok ? "ok" : "error";
              if (r.ok && typeof a.content === "string") {
                diff = { prev: r.prevContent ?? "", next: a.content };
              }
            } else {
              resultStr = summarizeResult(
                typeof result === "string" ? result : JSON.stringify(result),
              );
            }

            pushMsg({
              role: "assistant",
              type: "tool",
              toolName: t,
              content: label,
              result: resultStr,
              approved: true,
              diff,
            });
            pendingToolRef.current = null;
          }
        },
        onFinish: (fullText, responseMessages) => {
          if (!abort.signal.aborted) {
            // always save full response messages (includes tool calls) for context
            sessionRef.current = appendMessages(
              sessionRef.current,
              responseMessages,
            );
            if (!single) saveSession(sessionRef.current);

            if (fullText.trim()) {
              pushMsg({ role: "assistant", type: "text", content: fullText });
            }
            if (single) process.exit(0);
          }
          setCurrentChunk("");
          setStage("idle");
        },
      });
    } catch (err) {
      if (!abort.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        pushMsg({ role: "assistant", type: "text", content: `Error: ${msg}` });
      }
      setCurrentChunk("");
      setStage("idle");
    }
  };

  // ── Auto-send initial message ──────────────────────────────────────────────

  const didAutoSend = useRef(false);
  React.useEffect(() => {
    if (initialMessage && !didAutoSend.current) {
      didAutoSend.current = true;
      sendMessage(initialMessage);
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column">
      <Static items={HEADER_ITEMS}>
        {(_, i) => (
          <AppHeader key={i} model={getActiveModelName()} repoPath={repoPath} />
        )}
      </Static>
      <Static items={committed}>
        {(msg, i) => <StaticMessage key={i} msg={msg} />}
      </Static>

      {stage === "thinking" && (
        <Box flexDirection="column">
          {currentChunk ? (
            <Box gap={1}>
              <Text color={ACCENT}>●</Text>
              <Text wrap="wrap">{currentChunk}</Text>
            </Box>
          ) : (
            <>
              <Box gap={1}>
                <Text color={ACCENT}>
                  <Spinner type="star"></Spinner>
                </Text>
                <Text color={ACCENT}>{thinkingPhrase}</Text>
              </Box>
              <Box marginLeft={2} marginBottom={1}>
                <Text color="gray" dimColor>
                  └ tip: {thinkingTip}
                </Text>
              </Box>
            </>
          )}
        </Box>
      )}

      {approvalRequest && (
        <Box flexDirection="column" marginTop={1} marginLeft={2} gap={0}>
          <Box gap={1}>
            <Text color="yellow">?</Text>
            <Text color={ACCENT}>
              {TOOL_ICONS[approvalRequest.tool] ?? "·"}
            </Text>
            <Text color="white">
              {approvalRequest.label || approvalRequest.tool}
            </Text>
          </Box>
          <Box gap={1} marginLeft={2}>
            <Text color="gray" dimColor>
              allow?
            </Text>
            <Text color={GREEN}>y</Text>
            <Text color="gray" dimColor>
              {" "}
              yes ·{" "}
            </Text>
            <Text color={RED}>n</Text>
            <Text color="gray" dimColor>
              {" "}
              no ·{" "}
            </Text>
            <Text color={ACCENT}>a</Text>
            <Text color="gray" dimColor>
              {" "}
              allow all
            </Text>
          </Box>
        </Box>
      )}

      {showProvider && (
        <Box flexDirection="column" paddingX={1} paddingY={1}>
          <ProviderSetup
            onDone={() => {
              setShowProvider(false);
              pushMsg({
                role: "assistant",
                type: "text",
                content: `Provider updated. Now using **${getActiveModelName()}**.`,
              });
            }}
          />
        </Box>
      )}

      {stage === "idle" && !showProvider && (
        <Box flexDirection="column">
          {inputValue.startsWith("/") && <CommandPalette query={inputValue} />}
          <InputBox
            value={inputValue}
            onChange={(v) => setInputValue(v)}
            onSubmit={(val) => {
              if (val.trim()) sendMessage(val.trim());
              clear();
            }}
            inputKey={inputKey}
          />
        </Box>
      )}

      <ShortcutBar
        autoApprove={autoApprove}
        forceApprove={forceApprove}
        isThinking={isThinking}
        model={getActiveModelName()}
      />
    </Box>
  );
}
