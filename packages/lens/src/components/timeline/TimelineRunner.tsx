import React, { useState, useEffect, useRef } from "react";
import { Box, Text, Static, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { execSync } from "child_process";
import {
  fetchCommits,
  fetchDiff,
  isGitRepo,
  summarizeTimeline,
} from "../../utils/git";
import type { Commit, DiffFile } from "../../utils/git";
import { TypewriterText, InputBox } from "../chat/ChatOverlays";
import { ACCENT } from "../../colors";
import {
  chat,
  createSession,
  addMessage,
  getMessages,
} from "@ridit/lens-core";

// ── git runner (for revert) ───────────────────────────────────────────────────

function gitRun(cmd: string, cwd: string): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
    }).trim();
    return { ok: true, out: out || "(done)" };
  } catch (e: any) {
    const msg =
      [e.stdout, e.stderr].filter(Boolean).join("\n").trim() || e.message;
    return { ok: false, out: msg };
  }
}

// ── thinking phrases ──────────────────────────────────────────────────────────

const THINKING_PHRASES = [
  "thinking…",
  "reading the repo…",
  "consulting the log…",
  "grepping the history…",
  "diffing the vibes…",
  "sniffing the diff...",
  "reading your crimes...",
  "crafting the perfect commit message...",
  "pretending this was intentional all along...",
  "making it sound like a feature...",
  "turning chaos into conventional commits...",
  "72 chars or bust...",
  "git log will remember this...",
  "committing to the bit. and also the repo...",
  "staging your changes (and your career)...",
  "making main proud...",
  "git blame: not it...",
];

function randomPhrase() {
  return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]!;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function shortDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  } catch {
    return d.slice(0, 10);
  }
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function bar(ins: number, del: number): string {
  const total = ins + del;
  if (!total) return "";
  const w = 10;
  const addW = Math.round((ins / total) * w);
  return "+" + "█".repeat(addW) + "░".repeat(w - addW) + "-";
}

function getToolLabel(tool: string, args: unknown): string {
  if (!args || typeof args !== "object") return tool;
  const a = args as Record<string, unknown>;
  switch (tool) {
    case "read": return String(a.path ?? a.file_path ?? "");
    case "write": return String(a.path ?? a.file_path ?? a.filename ?? "");
    case "bash": return String(a.command ?? a.cmd ?? "");
    case "grep": {
      const p = String(a.pattern ?? "");
      const g = String(a.glob ?? "");
      return g ? `${p}  ${g}` : p;
    }
    case "ls": return String(a.path ?? ".");
    default: return tool;
  }
}

const W = () => process.stdout.columns ?? 100;

// ── CommitRow ─────────────────────────────────────────────────────────────────

function CommitRow({
  commit,
  index,
  isSelected,
  showDiff,
  diff,
  diffScroll,
  onRevert,
}: {
  commit: Commit;
  index: number;
  isSelected: boolean;
  showDiff: boolean;
  diff: DiffFile[];
  diffScroll: number;
  onRevert: () => void;
}) {
  const w = W();
  const isMerge = commit.parents.length > 1;
  const node = isMerge ? "⎇" : index === 0 ? "◉" : "●";

  const refLabels = commit.refs
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) =>
      r.startsWith("HEAD -> ")
        ? r.slice(8)
        : r.startsWith("tag: ")
          ? `v${r.slice(5)}`
          : r,
    )
    .slice(0, 2);

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text color={isSelected ? ACCENT : "gray"}>
          {isSelected ? "▶" : " "}
        </Text>
        <Text color={isSelected ? ACCENT : isMerge ? "magenta" : "gray"}>
          {node}
        </Text>
        <Text color="gray" dimColor={!isSelected}>
          {commit.shortHash}
        </Text>
        <Text color="cyan" dimColor={!isSelected}>
          {shortDate(commit.date)}
        </Text>
        {refLabels.map((r) => (
          <Text key={r} color="yellow">
            [{r}]
          </Text>
        ))}
        <Text
          color={isSelected ? "white" : "gray"}
          bold={isSelected}
          wrap="truncate"
        >
          {trunc(commit.message, w - 36)}
        </Text>
      </Box>

      {isSelected && !showDiff && (
        <Box flexDirection="column" marginLeft={4} marginBottom={1}>
          <Box gap={2}>
            <Text color="gray" dimColor>
              {commit.author}
            </Text>
            <Text color="gray" dimColor>
              {commit.relativeDate}
            </Text>
            {commit.filesChanged > 0 && (
              <>
                <Text color="green">+{commit.insertions}</Text>
                <Text color="red">-{commit.deletions}</Text>
                <Text color="gray" dimColor>
                  {commit.filesChanged} file{commit.filesChanged !== 1 ? "s" : ""}
                </Text>
                <Text color="gray" dimColor>
                  {bar(commit.insertions, commit.deletions)}
                </Text>
              </>
            )}
          </Box>
          {commit.body ? (
            <Text color="gray" dimColor wrap="wrap">
              {trunc(commit.body, w - 8)}
            </Text>
          ) : null}
          <Box gap={3} marginTop={1}>
            <Text color="gray" dimColor>enter diff</Text>
            <Text color="red" dimColor>x revert</Text>
          </Box>
        </Box>
      )}

      {isSelected && showDiff && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          <Box gap={3} marginBottom={1}>
            <Text color={ACCENT} bold>DIFF</Text>
            <Text color="gray" dimColor>
              {commit.shortHash} — {trunc(commit.message, 50)}
            </Text>
            <Text color="red" dimColor>x revert</Text>
            <Text color="gray" dimColor>esc close</Text>
          </Box>
          <DiffPanel
            files={diff}
            scrollOffset={diffScroll}
            maxLines={Math.max(8, (process.stdout.rows ?? 30) - 12)}
          />
          <Text color="gray" dimColor>↑↓ scroll · esc close</Text>
        </Box>
      )}
    </Box>
  );
}

// ── DiffPanel ─────────────────────────────────────────────────────────────────

function DiffPanel({
  files,
  scrollOffset,
  maxLines,
}: {
  files: DiffFile[];
  scrollOffset: number;
  maxLines: number;
}) {
  const w = W() - 6;

  type RLine =
    | { k: "file"; path: string; ins: number; del: number; status: DiffFile["status"] }
    | { k: "hunk" | "add" | "rem" | "ctx"; content: string };

  const all: RLine[] = [];
  for (const f of files) {
    const icon =
      f.status === "added" ? "+" :
      f.status === "deleted" ? "-" :
      f.status === "renamed" ? "→" : "~";
    all.push({ k: "file", path: `${icon} ${f.path}`, ins: f.insertions, del: f.deletions, status: f.status });
    for (const l of f.lines) {
      if (l.type === "header") all.push({ k: "hunk", content: l.content });
      else if (l.type === "add") all.push({ k: "add", content: l.content });
      else if (l.type === "remove") all.push({ k: "rem", content: l.content });
      else all.push({ k: "ctx", content: l.content });
    }
  }

  if (!all.length)
    return <Text color="gray" dimColor>{" "}no diff available</Text>;

  const visible = all.slice(scrollOffset, scrollOffset + maxLines);
  const hasMore = all.length > scrollOffset + maxLines;

  return (
    <Box flexDirection="column">
      {visible.map((line, i) => {
        if (line.k === "file") {
          const color =
            line.status === "added" ? "green" :
            line.status === "deleted" ? "red" :
            line.status === "renamed" ? "yellow" : "cyan";
          return (
            <Box key={i} gap={2} marginTop={i > 0 ? 1 : 0}>
              <Text color={color} bold>{trunc(line.path, w)}</Text>
              <Text color="green">+{line.ins}</Text>
              <Text color="red">-{line.del}</Text>
            </Box>
          );
        }
        if (line.k === "hunk")
          return <Text key={i} color="cyan" dimColor>{trunc(line.content, w)}</Text>;
        if (line.k === "add")
          return <Text key={i} color="green">{"+"}{trunc(line.content, w - 1)}</Text>;
        if (line.k === "rem")
          return <Text key={i} color="red">{"-"}{trunc(line.content, w - 1)}</Text>;
        return <Text key={i} color="gray" dimColor>{" "}{trunc(line.content, w - 1)}</Text>;
      })}
      {hasMore && (
        <Text color="gray" dimColor>
          {" "}… {all.length - scrollOffset - maxLines} more lines
        </Text>
      )}
    </Box>
  );
}

// ── RevertConfirm ─────────────────────────────────────────────────────────────

function RevertConfirm({
  commit,
  repoPath,
  onDone,
}: {
  commit: Commit;
  repoPath: string;
  onDone: (msg: string | null) => void;
}) {
  const [status, setStatus] = useState<"confirm" | "running" | "done">("confirm");
  const [result, setResult] = useState("");

  useInput((input, key) => {
    if (status !== "confirm") return;
    if (input === "y" || input === "Y" || key.return) {
      setStatus("running");
      const r = gitRun(`git revert --no-edit "${commit.hash}"`, repoPath);
      setResult(r.out);
      setStatus("done");
      setTimeout(() => onDone(r.ok ? `Reverted ${commit.shortHash}` : null), 1200);
    }
    if (input === "n" || input === "N" || key.escape) onDone(null);
  });

  const w = W();
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>{"─".repeat(w)}</Text>
      {status === "confirm" && (
        <Box flexDirection="column" paddingX={1} gap={1}>
          <Box gap={1}>
            <Text color="red">!</Text>
            <Text color="white">revert </Text>
            <Text color={ACCENT}>{commit.shortHash}</Text>
            <Text color="gray" dimColor>— {trunc(commit.message, 50)}</Text>
          </Box>
          <Text color="gray" dimColor>  this creates a new "revert" commit — git history is preserved</Text>
          <Box gap={2} marginTop={1}>
            <Text color="green">y/enter confirm</Text>
            <Text color="gray" dimColor>n/esc cancel</Text>
          </Box>
        </Box>
      )}
      {status === "running" && (
        <Box paddingX={1} gap={1}>
          <Text color={ACCENT}>*</Text>
          <Text color="gray" dimColor>reverting…</Text>
        </Box>
      )}
      {status === "done" && (
        <Box paddingX={1} gap={1}>
          <Text color={result.startsWith("Error") ? "red" : "green"}>
            {result.startsWith("Error") ? "✗" : "✓"}
          </Text>
          <Text color="white" wrap="wrap">{trunc(result, W() - 6)}</Text>
        </Box>
      )}
    </Box>
  );
}

// ── AskPanel (powered by chat() from core) ────────────────────────────────────

type AskMsg =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string }
  | { kind: "tool"; toolName: string; label: string; result?: string; approved?: boolean };

function AskPanel({
  commits,
  repoPath,
  onReload,
}: {
  commits: Commit[];
  repoPath: string;
  onReload: () => void;
}) {
  const [messages, setMessages] = useState<AskMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [currentChunk, setCurrentChunk] = useState("");
  const [phrase, setPhrase] = useState(randomPhrase);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(createSession(repoPath));
  const pendingToolRef = useRef<{ tool: string; args: unknown } | null>(null);
  const { stdout } = useStdout();

  useEffect(() => {
    if (!thinking) return;
    setPhrase(randomPhrase());
    const id = setInterval(() => setPhrase(randomPhrase()), 3200);
    return () => clearInterval(id);
  }, [thinking]);

  const systemPrompt = `You are a git assistant embedded in a terminal timeline viewer.
Repository: ${repoPath}

You have access to tools to answer questions and perform git operations.
Use the bash tool to run git commands when you need live data.

Rules:
- Use read tools freely to answer questions requiring live data
- For write operations briefly explain what you are about to do
- Be concise, plain text only

Timeline summary (last 300 commits):
${summarizeTimeline(commits)}`;

  const ask = async (q: string) => {
    if (!q.trim() || thinking) return;

    setThinking(true);
    setCurrentChunk("");
    setMessages((prev) => [...prev, { kind: "user", content: q }]);
    sessionRef.current = addMessage(sessionRef.current, "user", q);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await chat({
        messages: getMessages(sessionRef.current),
        system: systemPrompt,
        onChunk: (chunk) => {
          if (!abort.signal.aborted) {
            setCurrentChunk((prev) => prev + chunk);
          }
        },
        onToolCall: (tool, args) => {
          if (!abort.signal.aborted) {
            pendingToolRef.current = { tool, args };
          }
        },
        onToolResult: (tool, result) => {
          if (!abort.signal.aborted && pendingToolRef.current) {
            const { tool: t, args } = pendingToolRef.current;
            const label = getToolLabel(t, args);
            const resultStr = typeof result === "string" ? result : JSON.stringify(result);
            setMessages((prev) => [
              ...prev,
              { kind: "tool", toolName: t, label, result: resultStr, approved: true },
            ]);
            pendingToolRef.current = null;
            onReload();
          }
        },
        onFinish: (text) => {
          if (!abort.signal.aborted) {
            setMessages((prev) => [...prev, { kind: "assistant", content: text }]);
            sessionRef.current = addMessage(sessionRef.current, "assistant", text);
          }
          setCurrentChunk("");
          setThinking(false);
        },
      });
    } catch (err) {
      if (!abort.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [...prev, { kind: "assistant", content: `Error: ${msg}` }]);
      }
      setCurrentChunk("");
      setThinking(false);
    }
  };

  useInput((inp, key) => {
    if (key.escape && thinking) {
      abortRef.current?.abort();
      setCurrentChunk("");
      setThinking(false);
    }
  });

  const w = W();
  const isBusy = thinking;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>{"─".repeat(w)}</Text>

      <Box paddingX={1} marginBottom={1} gap={2}>
        <Text color={ACCENT} bold>ASK</Text>
        <Text color="gray" dimColor>git tools available · esc cancel</Text>
      </Box>

      {messages.map((msg, i) => {
        if (msg.kind === "tool") {
          const isError = msg.result?.startsWith("Error");
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Box gap={1}>
                <Text color={ACCENT}>$</Text>
                <Text color="gray" dimColor>{trunc(msg.label, w - 4)}</Text>
              </Box>
              {msg.result && (
                <Box marginLeft={2}>
                  <Text color={isError ? "red" : "gray"} dimColor={!isError}>
                    {trunc(msg.result.split("\n")[0]!, w - 6)}
                  </Text>
                </Box>
              )}
            </Box>
          );
        }

        if (msg.kind === "user") {
          return (
            <Box key={i} marginBottom={1} gap={1} paddingLeft={1} paddingRight={2}>
              <Text color="gray">{">"}</Text>
              <Text color="white" bold>{msg.content}</Text>
            </Box>
          );
        }

        return (
          <Box key={i} marginBottom={1} gap={1}>
            <Text color={ACCENT}>●</Text>
            <Text color="white" wrap="wrap">{msg.content}</Text>
          </Box>
        );
      })}

      {thinking && (
        <Box gap={1} marginBottom={1}>
          <Text color={ACCENT}>●</Text>
          {currentChunk ? (
            <Text color="white" wrap="wrap">{currentChunk}</Text>
          ) : (
            <TypewriterText key={phrase} text={phrase} />
          )}
        </Box>
      )}

      <InputBox
        value={input}
        onChange={setInput}
        onSubmit={(v) => {
          if (v.trim()) ask(v.trim());
          setInput("");
        }}
        inputKey={isBusy ? 1 : 0}
      />
    </Box>
  );
}

// ── TimelineRunner ────────────────────────────────────────────────────────────

type UIMode =
  | { type: "browse" }
  | { type: "search"; query: string }
  | { type: "ask" }
  | { type: "revert"; commit: Commit };

type StatusMsg = { id: number; text: string; ok: boolean };
let sid = 0;

export function TimelineRunner({
  repoPath,
  onExit,
}: {
  repoPath: string;
  onExit?: () => void;
}) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [filtered, setFiltered] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showDiff, setShowDiff] = useState(false);
  const [diff, setDiff] = useState<DiffFile[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffScroll, setDiffScroll] = useState(0);
  const [lastDiffHash, setLastDiffHash] = useState<string | null>(null);

  const [mode, setMode] = useState<UIMode>({ type: "browse" });
  const [statusMsgs, setStatusMsgs] = useState<StatusMsg[]>([]);

  const termHeight = process.stdout.rows ?? 30;
  const visibleCount = Math.max(4, termHeight - 6);

  const addStatus = (text: string, ok: boolean) =>
    setStatusMsgs((prev) => [...prev, { id: ++sid, text, ok }]);

  const reloadCommits = () => {
    const loaded = fetchCommits(repoPath, 300);
    setCommits(loaded);
    setFiltered(loaded);
    setSelectedIdx(0);
    setScrollOffset(0);
    setShowDiff(false);
  };

  useEffect(() => {
    if (!isGitRepo(repoPath)) {
      setError("Not a git repository.");
      setLoading(false);
      return;
    }
    const loaded = fetchCommits(repoPath, 300);
    if (!loaded.length) {
      setError("No commits found.");
      setLoading(false);
      return;
    }
    setCommits(loaded);
    setFiltered(loaded);
    setLoading(false);
  }, [repoPath]);

  useEffect(() => {
    if (mode.type !== "search" || !mode.query) {
      setFiltered(commits);
    } else {
      const q = mode.query.toLowerCase();
      setFiltered(
        commits.filter(
          (c) =>
            c.message.toLowerCase().includes(q) ||
            c.author.toLowerCase().includes(q) ||
            c.shortHash.includes(q),
        ),
      );
    }
    setSelectedIdx(0);
    setScrollOffset(0);
  }, [mode, commits]);

  const selected = filtered[selectedIdx] ?? null;

  useEffect(() => {
    if (!selected || selected.hash === lastDiffHash) return;
    setDiff([]);
    setDiffScroll(0);
    setLastDiffHash(selected.hash);
    if (showDiff) {
      setDiffLoading(true);
      setTimeout(() => {
        setDiff(fetchDiff(repoPath, selected.hash));
        setDiffLoading(false);
      }, 0);
    }
  }, [selected?.hash]);

  useEffect(() => {
    if (!showDiff || !selected) return;
    if (selected.hash === lastDiffHash && diff.length) return;
    setDiffLoading(true);
    setLastDiffHash(selected.hash);
    setTimeout(() => {
      setDiff(fetchDiff(repoPath, selected.hash));
      setDiffLoading(false);
    }, 0);
  }, [showDiff]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (onExit) onExit();
      else process.exit(0);
    }

    if (mode.type === "ask" || mode.type === "revert") {
      if (key.escape) setMode({ type: "browse" });
      return;
    }

    if (mode.type === "search") {
      if (key.escape) setMode({ type: "browse" });
      return;
    }

    if (showDiff) {
      if (key.escape || input === "d") { setShowDiff(false); return; }
      if (key.upArrow) { setDiffScroll((o) => Math.max(0, o - 1)); return; }
      if (key.downArrow) { setDiffScroll((o) => o + 1); return; }
      if (input === "x" || input === "X") {
        if (selected) setMode({ type: "revert", commit: selected });
        return;
      }
      return;
    }

    if (key.escape) { setShowDiff(false); return; }
    if ((input === "q" || input === "Q") && onExit) { onExit(); return; }
    if (input === "/") { setMode({ type: "search", query: "" }); return; }
    if (input === "?" || input === "a" || input === "A") { setMode({ type: "ask" }); return; }
    if (key.return && selected) { setShowDiff(true); return; }
    if (input === "x" || input === "X") {
      if (selected) setMode({ type: "revert", commit: selected });
      return;
    }
    if (key.upArrow) {
      const next = Math.max(0, selectedIdx - 1);
      setSelectedIdx(next);
      setShowDiff(false);
      if (next < scrollOffset) setScrollOffset(next);
      return;
    }
    if (key.downArrow) {
      const next = Math.min(filtered.length - 1, selectedIdx + 1);
      setSelectedIdx(next);
      setShowDiff(false);
      if (next >= scrollOffset + visibleCount) setScrollOffset(next - visibleCount + 1);
      return;
    }
  });

  if (loading)
    return (
      <Box gap={1} marginTop={1}>
        <Text color={ACCENT}>*</Text>
        <Text color="gray">loading commits…</Text>
      </Box>
    );

  if (error)
    return (
      <Box gap={1} marginTop={1}>
        <Text color="red">✗</Text>
        <Text color="white">{error}</Text>
      </Box>
    );

  const w = W();
  const isSearching = mode.type === "search";
  const isAsking = mode.type === "ask";
  const isReverting = mode.type === "revert";
  const searchQuery = isSearching ? (mode as { type: "search"; query: string }).query : "";
  const visible = filtered.slice(scrollOffset, scrollOffset + visibleCount);

  const shortcutHint = showDiff
    ? "↑↓ scroll · x revert · esc/d close"
    : isSearching
      ? "type to filter · enter confirm · esc cancel"
      : isAsking
        ? "ask anything · git tools available · esc back"
        : isReverting
          ? "y confirm · n/esc cancel"
          : `↑↓ navigate · enter diff · x revert · a ask · / search${onExit ? " · q back" : " · ^C exit"}`;

  return (
    <Box flexDirection="column">
      <Box gap={2} marginBottom={1}>
        <Text color={ACCENT} bold>◈ TIMELINE</Text>
        <Text color="gray" dimColor>{repoPath}</Text>
        {isSearching && <Text color="yellow">/ {searchQuery || "…"}</Text>}
        {isSearching && filtered.length !== commits.length && (
          <Text color="gray" dimColor>{filtered.length} matches</Text>
        )}
      </Box>

      <Static items={statusMsgs}>
        {(msg) => (
          <Box key={msg.id} paddingX={1} gap={1}>
            <Text color={msg.ok ? "green" : "red"}>{msg.ok ? "✓" : "✗"}</Text>
            <Text color={msg.ok ? "white" : "red"}>{msg.text}</Text>
          </Box>
        )}
      </Static>

      {isSearching && (
        <Box gap={1} marginBottom={1}>
          <Text color={ACCENT}>{"/"}</Text>
          <TextInput
            value={searchQuery}
            onChange={(q) => setMode({ type: "search", query: q })}
            onSubmit={() => setMode({ type: "browse" })}
            placeholder="filter commits…"
          />
        </Box>
      )}

      {visible.map((commit, i) => {
        const absIdx = scrollOffset + i;
        const isSel = absIdx === selectedIdx;
        return (
          <CommitRow
            key={commit.hash}
            commit={commit}
            index={absIdx}
            isSelected={isSel}
            showDiff={isSel && showDiff}
            diff={isSel ? diff : []}
            diffScroll={diffScroll}
            onRevert={() => setMode({ type: "revert", commit })}
          />
        );
      })}

      {(scrollOffset > 0 || scrollOffset + visibleCount < filtered.length) && (
        <Box gap={3} marginTop={1}>
          {scrollOffset > 0 && (
            <Text color="gray" dimColor>↑ {scrollOffset} above</Text>
          )}
          {scrollOffset + visibleCount < filtered.length && (
            <Text color="gray" dimColor>
              ↓ {filtered.length - scrollOffset - visibleCount} below
            </Text>
          )}
        </Box>
      )}

      {isReverting && mode.type === "revert" && (
        <RevertConfirm
          commit={mode.commit}
          repoPath={repoPath}
          onDone={(msg) => {
            setMode({ type: "browse" });
            if (msg) {
              addStatus(msg, true);
              reloadCommits();
            } else {
              addStatus("revert cancelled", false);
            }
          }}
        />
      )}

      {isAsking && (
        <AskPanel
          commits={commits}
          repoPath={repoPath}
          onReload={() => {
            reloadCommits();
            addStatus("commits reloaded", true);
          }}
        />
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>{shortcutHint}</Text>
      </Box>
    </Box>
  );
}
