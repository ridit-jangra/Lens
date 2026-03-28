import React from "react";
import { Box, Text } from "ink";
import { MessageBody } from "@ridit/ink-ui";
import { ACCENT, GREEN, RED } from "../../colors";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UIMessage =
  | { role: "user" | "assistant"; type: "text"; content: string }
  | {
      role: "assistant";
      type: "tool";
      toolName: string;
      content: string;
      result: string;
      approved: boolean;
      diff?: { prev: string; next: string };
    };

// ── Diff ──────────────────────────────────────────────────────────────────────

type DiffLine = { type: "add" | "remove" | "context"; content: string };

function computeDiff(prev: string, next: string, context = 2): DiffLine[] {
  const a = prev.split("\n");
  const b = next.split("\n");
  if (a.length > 400 || b.length > 400) {
    return b.map((content) => ({ type: "add" as const, content }));
  }

  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);

  const edits: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.unshift({ type: "context", content: a[i - 1]! });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      edits.unshift({ type: "add", content: b[j - 1]! });
      j--;
    } else {
      edits.unshift({ type: "remove", content: a[i - 1]! });
      i--;
    }
  }

  const keep = new Set<number>();
  edits.forEach((e, idx) => {
    if (e.type !== "context") {
      for (let k = Math.max(0, idx - context); k <= Math.min(edits.length - 1, idx + context); k++)
        keep.add(k);
    }
  });

  return edits.filter((_, idx) => keep.has(idx));
}

// ── Tool icons ────────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  bash: "$",
  read: "r",
  write: "w",
  grep: "/",
  ls: "d",
  remember: "·",
};

// ── Static message renderer ───────────────────────────────────────────────────

export function StaticMessage({ msg }: { msg: UIMessage }) {
  if (msg.role === "user") {
    return (
      <Box marginBottom={1} gap={1}>
        <Text color={ACCENT}>{">"}</Text>
        <Text color="white" bold>
          {msg.content}
        </Text>
      </Box>
    );
  }

  if (msg.type === "tool") {
    const icon = TOOL_ICONS[msg.toolName] ?? "·";

    if (msg.toolName === "write" && msg.diff) {
      const lines = computeDiff(msg.diff.prev, msg.diff.next);
      const additions = lines.filter((l) => l.type === "add").length;
      const deletions = lines.filter((l) => l.type === "remove").length;
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Box gap={1}>
            <Text color={ACCENT}>{icon}</Text>
            <Text color="gray">{msg.content}</Text>
            {lines.length > 0 && (
              <>
                <Text color={GREEN} dimColor>+{additions}</Text>
                <Text color={RED} dimColor>-{deletions}</Text>
              </>
            )}
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            {lines.map((line, i) => (
              <Text
                key={i}
                color={line.type === "add" ? GREEN : line.type === "remove" ? RED : "gray"}
                dimColor={line.type === "context"}
              >
                {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
                {line.content}
              </Text>
            ))}
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1}>
          <Text color={msg.approved ? ACCENT : RED}>{icon}</Text>
          <Text color={msg.approved ? "gray" : RED} dimColor={!msg.approved}>
            {msg.content}
          </Text>
          {!msg.approved && <Text color={RED}>denied</Text>}
        </Box>
        {msg.approved && msg.result && (
          <Box gap={1} marginLeft={2}>
            <Text color="gray" dimColor>{"└"}</Text>
            <Text color="gray" dimColor>
              {msg.result.split("\n")[0]?.slice(0, 120)}
              {(msg.result.split("\n")[0]?.length ?? 0) > 120 ? "…" : ""}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // assistant text
  return (
    <Box marginBottom={1} gap={1}>
      <Text color={ACCENT}>●</Text>
      <MessageBody content={msg.content} />
    </Box>
  );
}
