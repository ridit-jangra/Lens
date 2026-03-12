import React, { useState, useEffect } from "react";
import { Box, Text, Static, useInput } from "ink";
import TextInput from "ink-text-input";
import { execSync } from "child_process";
import { ProviderPicker } from "../repo/ProviderPicker";
import {
  fetchCommits,
  fetchDiff,
  isGitRepo,
  summarizeTimeline,
} from "../../utils/git";
import { callChat } from "../../utils/chat";
import type { Commit, DiffFile } from "../../utils/git";
import type { Provider } from "../../types/config";

const ACCENT = "#FF8C00";
const W = () => process.stdout.columns ?? 100;

function gitRun(cmd: string, cwd: string): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return { ok: true, out: out || "(done)" };
  } catch (e: any) {
    const msg =
      [e.stdout, e.stderr].filter(Boolean).join("\n").trim() || e.message;
    return { ok: false, out: msg };
  }
}

function getUnstagedDiff(cwd: string): string {
  const tracked = gitRun("git diff HEAD", cwd).out;
  const untracked = gitRun(`git ls-files --others --exclude-standard`, cwd).out;

  const untrackedContent = untracked
    .split("\n")
    .filter(Boolean)
    .slice(0, 10)
    .map((f) => {
      try {
        const content = execSync(
          `git show :0 "${f}" 2>/dev/null || type "${f}"`,
          {
            cwd,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          },
        )
          .trim()
          .slice(0, 500);
        return `=== new file: ${f} ===\n${content}`;
      } catch {
        return `=== new file: ${f} ===`;
      }
    })
    .join("\n\n");

  return [tracked.slice(0, 4000), untrackedContent]
    .filter(Boolean)
    .join("\n\n");
}

async function generateCommitMessage(
  provider: Provider,
  diff: string,
): Promise<string> {
  const system = `You are a commit message generator. Given a git diff, write a concise, imperative commit message.
Rules:
- First line: short summary, max 72 chars, imperative mood ("add", "fix", "update", not "added")
- If needed, one blank line then a short body (2-3 lines max)
- No markdown, no bullet points, no code blocks
- Output ONLY the commit message, nothing else`;

  const msgs = [
    {
      role: "user" as const,
      content: `Write a commit message for this diff:\n\n${diff}`,
      type: "text" as const,
    },
  ];
  const raw = await callChat(provider, system, msgs as any);
  return typeof raw === "string" ? raw.trim() : "update files";
}

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
                  {commit.filesChanged} file
                  {commit.filesChanged !== 1 ? "s" : ""}
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
            <Text color="gray" dimColor>
              enter diff
            </Text>
            <Text color="red" dimColor>
              x revert
            </Text>
          </Box>
        </Box>
      )}

      {isSelected && showDiff && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          <Box gap={3} marginBottom={1}>
            <Text color={ACCENT} bold>
              DIFF
            </Text>
            <Text color="gray" dimColor>
              {commit.shortHash} — {trunc(commit.message, 50)}
            </Text>
            <Text color="red" dimColor>
              x revert
            </Text>
            <Text color="gray" dimColor>
              esc close
            </Text>
          </Box>
          <DiffPanel
            files={diff}
            scrollOffset={diffScroll}
            maxLines={Math.max(8, (process.stdout.rows ?? 30) - 12)}
          />
          <Text color="gray" dimColor>
            ↑↓ scroll · esc close
          </Text>
        </Box>
      )}
    </Box>
  );
}

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
    | {
        k: "file";
        path: string;
        ins: number;
        del: number;
        status: DiffFile["status"];
      }
    | { k: "hunk" | "add" | "rem" | "ctx"; content: string };

  const all: RLine[] = [];
  for (const f of files) {
    const icon =
      f.status === "added"
        ? "+"
        : f.status === "deleted"
          ? "-"
          : f.status === "renamed"
            ? "→"
            : "~";
    all.push({
      k: "file",
      path: `${icon} ${f.path}`,
      ins: f.insertions,
      del: f.deletions,
      status: f.status,
    });
    for (const l of f.lines) {
      if (l.type === "header") all.push({ k: "hunk", content: l.content });
      else if (l.type === "add") all.push({ k: "add", content: l.content });
      else if (l.type === "remove") all.push({ k: "rem", content: l.content });
      else all.push({ k: "ctx", content: l.content });
    }
  }

  if (!all.length)
    return (
      <Text color="gray" dimColor>
        {" "}
        no diff available
      </Text>
    );

  const visible = all.slice(scrollOffset, scrollOffset + maxLines);
  const hasMore = all.length > scrollOffset + maxLines;

  return (
    <Box flexDirection="column">
      {visible.map((line, i) => {
        if (line.k === "file") {
          const color =
            line.status === "added"
              ? "green"
              : line.status === "deleted"
                ? "red"
                : line.status === "renamed"
                  ? "yellow"
                  : "cyan";
          return (
            <Box key={i} gap={2} marginTop={i > 0 ? 1 : 0}>
              <Text color={color} bold>
                {trunc(line.path, w)}
              </Text>
              <Text color="green">+{line.ins}</Text>
              <Text color="red">-{line.del}</Text>
            </Box>
          );
        }
        if (line.k === "hunk")
          return (
            <Text key={i} color="cyan" dimColor>
              {trunc(line.content, w)}
            </Text>
          );
        if (line.k === "add")
          return (
            <Text key={i} color="green">
              {"+"}
              {trunc(line.content, w - 1)}
            </Text>
          );
        if (line.k === "rem")
          return (
            <Text key={i} color="red">
              {"-"}
              {trunc(line.content, w - 1)}
            </Text>
          );
        return (
          <Text key={i} color="gray" dimColor>
            {" "}
            {trunc(line.content, w - 1)}
          </Text>
        );
      })}
      {hasMore && (
        <Text color="gray" dimColor>
          {" "}
          … {all.length - scrollOffset - maxLines} more lines
        </Text>
      )}
    </Box>
  );
}

function RevertConfirm({
  commit,
  repoPath,
  onDone,
}: {
  commit: Commit;
  repoPath: string;
  onDone: (msg: string | null) => void;
}) {
  const [status, setStatus] = useState<"confirm" | "running" | "done">(
    "confirm",
  );
  const [result, setResult] = useState("");

  useInput((input, key) => {
    if (status !== "confirm") return;
    if (input === "y" || input === "Y" || key.return) {
      setStatus("running");

      const r = gitRun(`git revert --no-edit "${commit.hash}"`, repoPath);
      setResult(r.out);
      setStatus("done");
      setTimeout(
        () => onDone(r.ok ? `Reverted ${commit.shortHash}` : null),
        1200,
      );
    }
    if (input === "n" || input === "N" || key.escape) onDone(null);
  });

  const w = W();
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>
        {"─".repeat(w)}
      </Text>
      {status === "confirm" && (
        <Box flexDirection="column" paddingX={1} gap={1}>
          <Box gap={1}>
            <Text color="red">!</Text>
            <Text color="white">revert </Text>
            <Text color={ACCENT}>{commit.shortHash}</Text>
            <Text color="gray" dimColor>
              — {trunc(commit.message, 50)}
            </Text>
          </Box>
          <Text color="gray" dimColor>
            {" "}
            this creates a new "revert" commit — git history is preserved
          </Text>
          <Box gap={2} marginTop={1}>
            <Text color="green">y/enter confirm</Text>
            <Text color="gray" dimColor>
              n/esc cancel
            </Text>
          </Box>
        </Box>
      )}
      {status === "running" && (
        <Box paddingX={1} gap={1}>
          <Text color={ACCENT}>*</Text>
          <Text color="gray" dimColor>
            reverting…
          </Text>
        </Box>
      )}
      {status === "done" && (
        <Box paddingX={1} gap={1}>
          <Text
            color={
              result.startsWith("Error") || result.includes("error")
                ? "red"
                : "green"
            }
          >
            {result.startsWith("Error") ? "✗" : "✓"}
          </Text>
          <Text color="white" wrap="wrap">
            {trunc(result, W() - 6)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

type CommitPanelState =
  | { phase: "scanning" }
  | { phase: "no-changes" }
  | { phase: "generating"; diff: string }
  | { phase: "review"; diff: string; message: string }
  | { phase: "editing"; diff: string; message: string }
  | { phase: "committing"; message: string }
  | { phase: "done"; result: string }
  | { phase: "error"; message: string };

function CommitPanel({
  repoPath,
  provider,
  onDone,
}: {
  repoPath: string;
  provider: Provider;
  onDone: (msg: string | null) => void;
}) {
  const [state, setState] = useState<CommitPanelState>({ phase: "scanning" });

  useEffect(() => {
    const diff = getUnstagedDiff(repoPath);
    if (!diff.trim() || diff === "(done)") {
      setState({ phase: "no-changes" });
      return;
    }
    setState({ phase: "generating", diff });
    generateCommitMessage(provider, diff)
      .then((msg) => setState({ phase: "review", diff, message: msg }))
      .catch((e) => setState({ phase: "error", message: String(e) }));
  }, []);

  useInput((input, key) => {
    if (
      state.phase === "no-changes" ||
      state.phase === "scanning" ||
      state.phase === "generating"
    ) {
      if (key.escape || input === "n" || input === "N") onDone(null);
      return;
    }

    if (state.phase === "review") {
      if (input === "y" || input === "Y" || key.return) {
        setState({ phase: "committing", message: state.message });
        const add = gitRun("git add -A", repoPath);
        if (!add.ok) {
          setState({ phase: "error", message: add.out });
          return;
        }
        const commit = gitRun(
          `git commit -m ${JSON.stringify(state.message)}`,
          repoPath,
        );
        setState({
          phase: "done",
          result: commit.ok ? commit.out : `Error: ${commit.out}`,
        });
        setTimeout(() => onDone(commit.ok ? state.message : null), 1500);
        return;
      }
      if (input === "e" || input === "E") {
        setState({
          phase: "editing",
          diff: state.diff,
          message: state.message,
        });
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        onDone(null);
        return;
      }
    }

    if (state.phase === "editing") {
      if (key.escape) {
        setState({ phase: "review", diff: state.diff, message: state.message });
      }
    }

    if (state.phase === "done" || state.phase === "error") {
      if (key.return || key.escape) onDone(null);
    }
  });

  const w = W();
  const divider = "─".repeat(w);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>
        {divider}
      </Text>
      <Box paddingX={1} marginBottom={1} gap={2}>
        <Text color={ACCENT} bold>
          COMMIT CHANGES
        </Text>
      </Box>

      {state.phase === "scanning" && (
        <Box paddingX={1} gap={1}>
          <Text color={ACCENT}>*</Text>
          <Text color="gray" dimColor>
            scanning for changes…
          </Text>
        </Box>
      )}

      {state.phase === "no-changes" && (
        <Box paddingX={1} flexDirection="column" gap={1}>
          <Box gap={1}>
            <Text color="yellow">!</Text>
            <Text color="white">no uncommitted changes found</Text>
          </Box>
          <Text color="gray" dimColor>
            {" "}
            esc to close
          </Text>
        </Box>
      )}

      {state.phase === "generating" && (
        <Box paddingX={1} gap={1}>
          <Text color={ACCENT}>*</Text>
          <Text color="gray" dimColor>
            generating commit message…
          </Text>
        </Box>
      )}

      {(state.phase === "review" || state.phase === "editing") && (
        <Box paddingX={1} flexDirection="column" gap={1}>
          <Box gap={1}>
            <Text color="gray" dimColor>
              diff preview:
            </Text>
            <Text color="gray" dimColor>
              {trunc(state.diff.split("\n")[0] ?? "", w - 20)}
            </Text>
          </Box>
          <Box gap={1} marginTop={1}>
            <Text color="gray" dimColor>
              message:
            </Text>
          </Box>

          {state.phase === "review" && (
            <Box paddingLeft={2} flexDirection="column">
              <Text color="white" bold wrap="wrap">
                {state.message}
              </Text>
              <Box gap={3} marginTop={1}>
                <Text color="green">y/enter commit</Text>
                <Text color="cyan">e edit</Text>
                <Text color="gray" dimColor>
                  n/esc cancel
                </Text>
              </Box>
            </Box>
          )}

          {state.phase === "editing" && (
            <Box paddingLeft={2} flexDirection="column" gap={1}>
              <TextInput
                value={state.message}
                onChange={(msg) =>
                  setState({ phase: "editing", diff: state.diff, message: msg })
                }
                onSubmit={(msg) =>
                  setState({ phase: "review", diff: state.diff, message: msg })
                }
              />
              <Text color="gray" dimColor>
                enter to confirm · esc to cancel edit
              </Text>
            </Box>
          )}
        </Box>
      )}

      {state.phase === "committing" && (
        <Box paddingX={1} gap={1}>
          <Text color={ACCENT}>*</Text>
          <Text color="gray" dimColor>
            committing…
          </Text>
        </Box>
      )}

      {state.phase === "done" && (
        <Box paddingX={1} gap={1}>
          <Text color="green">✓</Text>
          <Text color="white" wrap="wrap">
            {trunc(state.result, w - 6)}
          </Text>
        </Box>
      )}

      {state.phase === "error" && (
        <Box paddingX={1} flexDirection="column" gap={1}>
          <Box gap={1}>
            <Text color="red">✗</Text>
            <Text color="white" wrap="wrap">
              {trunc(state.message, w - 6)}
            </Text>
          </Box>
          <Text color="gray" dimColor>
            {" "}
            enter/esc to close
          </Text>
        </Box>
      )}
    </Box>
  );
}

type ChatMsg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "thinking" };

function AskPanel({
  commits,
  provider,
  onCommit,
}: {
  commits: Commit[];
  provider: Provider;
  onCommit: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [history, setHistory] = useState<
    { role: "user" | "assistant"; content: string; type: "text" }[]
  >([]);

  const COMMIT_TRIGGERS = [
    /commit/i,
    /stage/i,
    /push changes/i,

    /commit kr/i,
    /commit kar/i,
    /changes commit/i,
    /changes save/i,
    /save changes/i,
    /badlav.*commit/i,
  ];

  const systemPrompt = `You are a git history analyst embedded in a terminal git timeline viewer.
You can ONLY answer questions about the git history shown below.
You CANNOT run commands, execute git operations, or modify files.
If the user asks to commit, stage, push, or make any git change — reply with exactly: DELEGATE_COMMIT
Plain text answers only. No markdown. No code blocks. No backticks. Be concise.

${summarizeTimeline(commits)}`;

  const ask = async (q: string) => {
    if (!q.trim() || thinking) return;

    if (COMMIT_TRIGGERS.some((re) => re.test(q))) {
      setMessages((prev) => [...prev, { role: "user", content: q }]);
      setInput("");
      onCommit();
      return;
    }

    const nextHistory = [
      ...history,
      { role: "user" as const, content: q, type: "text" as const },
    ];
    setMessages((prev) => [
      ...prev,
      { role: "user", content: q },
      { role: "thinking" },
    ]);
    setThinking(true);
    setInput("");
    try {
      const raw = await callChat(provider, systemPrompt, nextHistory as any);
      const answer = typeof raw === "string" ? raw.trim() : "(no response)";

      if (
        answer === "DELEGATE_COMMIT" ||
        answer.startsWith("DELEGATE_COMMIT")
      ) {
        setMessages((prev) => prev.filter((m) => m.role !== "thinking"));
        setThinking(false);
        onCommit();
        return;
      }

      const clean = answer
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .trim();

      setMessages((prev) => [
        ...prev.filter((m) => m.role !== "thinking"),
        { role: "assistant", content: clean },
      ]);
      setHistory([
        ...nextHistory,
        { role: "assistant", content: clean, type: "text" },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev.filter((m) => m.role !== "thinking"),
        { role: "assistant", content: `Error: ${String(e)}` },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const w = W();

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>
        {"─".repeat(w)}
      </Text>

      {messages.map((msg, i) => {
        if (msg.role === "thinking")
          return (
            <Box key={i} paddingX={1} gap={1}>
              <Text color={ACCENT}>*</Text>
              <Text color="gray" dimColor>
                thinking…
              </Text>
            </Box>
          );
        if (msg.role === "user")
          return (
            <Box key={i} paddingX={1} gap={1}>
              <Text color="gray">{">"}</Text>
              <Text color="white">{msg.content}</Text>
            </Box>
          );
        return (
          <Box key={i} paddingX={1} gap={1} marginBottom={1}>
            <Text color={ACCENT}>{"*"}</Text>
            <Text color="white" wrap="wrap">
              {msg.content}
            </Text>
          </Box>
        );
      })}

      <Box paddingX={1} gap={1}>
        <Text color={ACCENT}>{"?"}</Text>
        {!thinking ? (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={ask}
            placeholder="ask about the history…"
          />
        ) : (
          <Text color="gray" dimColor>
            thinking…
          </Text>
        )}
      </Box>
    </Box>
  );
}

type UIMode =
  | { type: "browse" }
  | { type: "search"; query: string }
  | { type: "ask" }
  | { type: "revert"; commit: Commit }
  | { type: "commit" };

type StatusMsg = { id: number; text: string; ok: boolean };
let sid = 0;

export function TimelineRunner({ repoPath }: { repoPath: string }) {
  const [provider, setProvider] = useState<Provider | null>(null);
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
    if (key.ctrl && input === "c") process.exit(0);

    if (
      mode.type === "ask" ||
      mode.type === "revert" ||
      mode.type === "commit"
    ) {
      if (key.escape) setMode({ type: "browse" });
      return;
    }

    if (mode.type === "search") {
      if (key.escape) setMode({ type: "browse" });
      return;
    }

    if (showDiff) {
      if (key.escape || input === "d") {
        setShowDiff(false);
        return;
      }
      if (key.upArrow) {
        setDiffScroll((o) => Math.max(0, o - 1));
        return;
      }
      if (key.downArrow) {
        setDiffScroll((o) => o + 1);
        return;
      }
      if (input === "x" || input === "X") {
        if (selected) setMode({ type: "revert", commit: selected });
        return;
      }
      return;
    }

    if (key.escape) {
      setShowDiff(false);
      return;
    }
    if (input === "/") {
      setMode({ type: "search", query: "" });
      return;
    }
    if (input === "?") {
      setMode({ type: "ask" });
      return;
    }
    if (input === "c" || input === "C") {
      setMode({ type: "commit" });
      return;
    }

    if (key.return && selected) {
      setShowDiff(true);
      return;
    }

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
      if (next >= scrollOffset + visibleCount)
        setScrollOffset(next - visibleCount + 1);
      return;
    }
  });

  if (!provider) return <ProviderPicker onDone={setProvider} />;
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
  const isCommitting = mode.type === "commit";
  const searchQuery = isSearching ? mode.query : "";
  const visible = filtered.slice(scrollOffset, scrollOffset + visibleCount);

  const shortcutHint = showDiff
    ? "↑↓ scroll · x revert · esc/d close"
    : isSearching
      ? "type to filter · enter confirm · esc cancel"
      : isAsking
        ? "type question · enter send · esc close"
        : isReverting || isCommitting
          ? "see prompt above · esc cancel"
          : "↑↓ navigate · enter diff · x revert · c commit · / search · ? ask · ^C exit";

  return (
    <Box flexDirection="column">
      <Box gap={2} marginBottom={1}>
        <Text color={ACCENT} bold>
          ◈ TIMELINE
        </Text>
        <Text color="gray" dimColor>
          {repoPath}
        </Text>
        {isSearching && <Text color="yellow">/ {searchQuery || "…"}</Text>}
        {isSearching && filtered.length !== commits.length && (
          <Text color="gray" dimColor>
            {filtered.length} matches
          </Text>
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
            <Text color="gray" dimColor>
              ↑ {scrollOffset} above
            </Text>
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
            } else addStatus("revert cancelled", false);
          }}
        />
      )}

      {isCommitting && provider && (
        <CommitPanel
          repoPath={repoPath}
          provider={provider}
          onDone={(msg) => {
            setMode({ type: "browse" });
            if (msg) {
              addStatus(`committed: ${trunc(msg, 60)}`, true);
              reloadCommits();
            }
          }}
        />
      )}

      {isAsking && provider && (
        <AskPanel
          commits={commits}
          provider={provider}
          onCommit={() => {
            setMode({ type: "commit" });
          }}
        />
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {shortcutHint}
        </Text>
      </Box>
    </Box>
  );
}
