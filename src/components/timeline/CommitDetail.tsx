import React from "react";
import { Box, Text } from "ink";
import type { Commit, DiffFile } from "../../utils/git";

const ACCENT = "#FF8C00";

type Props = {
  commit: Commit | null;
  diff: DiffFile[];
  diffLoading: boolean;
  diffScrollOffset: number;
  showFullDiff: boolean;
  width: number;
  height: number;
};

function formatFullDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function statusIcon(status: DiffFile["status"]): {
  icon: string;
  color: string;
} {
  switch (status) {
    case "added":
      return { icon: "+", color: "green" };
    case "deleted":
      return { icon: "-", color: "red" };
    case "renamed":
      return { icon: "→", color: "yellow" };
    default:
      return { icon: "~", color: "cyan" };
  }
}

export function CommitDetail({
  commit,
  diff,
  diffLoading,
  diffScrollOffset,
  showFullDiff,
  width,
  height,
}: Props) {
  if (!commit) {
    return (
      <Box
        width={width}
        height={height}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="gray" dimColor>
          select a commit to view details
        </Text>
      </Box>
    );
  }

  const divider = "─".repeat(Math.max(0, width - 2));

  // Build all diff lines for scrolling
  const allDiffLines: Array<{
    type: string;
    content: string;
    fileHeader?: string;
  }> = [];
  for (const file of diff) {
    const { icon, color } = statusIcon(file.status);
    allDiffLines.push({
      type: "fileheader",
      content: `${icon} ${file.path}`,
      fileHeader: color,
    });
    allDiffLines.push({
      type: "filestat",
      content: `  +${file.insertions} -${file.deletions}`,
    });
    if (showFullDiff) {
      for (const line of file.lines) {
        allDiffLines.push({ type: line.type, content: line.content });
      }
    }
  }

  const visibleDiffLines = allDiffLines.slice(
    diffScrollOffset,
    diffScrollOffset + Math.max(1, height - 18),
  );

  return (
    <Box width={width} flexDirection="column">
      {/* ── Commit header ── */}
      <Box paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>
          {divider}
        </Text>
      </Box>

      <Box paddingX={1} gap={2}>
        <Text color={ACCENT} bold>
          ◉ {commit.shortHash}
        </Text>
        {commit.parents.length > 1 && <Text color="magenta">merge commit</Text>}
        {commit.refs && (
          <Text color="yellow">
            {commit.refs
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean)
              .slice(0, 2)
              .join(" ")}
          </Text>
        )}
      </Box>

      {/* message */}
      <Box paddingX={1} marginTop={1}>
        <Text color="white" bold wrap="wrap">
          {commit.message}
        </Text>
      </Box>
      {commit.body && (
        <Box paddingX={1} marginTop={1}>
          <Text color="gray" wrap="wrap">
            {commit.body}
          </Text>
        </Box>
      )}

      {/* meta */}
      <Box paddingX={1} marginTop={1} flexDirection="column" gap={0}>
        <Box gap={2}>
          <Text color="gray" dimColor>
            author
          </Text>
          <Text color="cyan">{commit.author}</Text>
          <Text color="gray" dimColor>
            &lt;{commit.email}&gt;
          </Text>
        </Box>
        <Box gap={2}>
          <Text color="gray" dimColor>
            date{" "}
          </Text>
          <Text color="white">{formatFullDate(commit.date)}</Text>
          <Text color="gray" dimColor>
            ({commit.relativeDate})
          </Text>
        </Box>
        {commit.parents.length > 0 && (
          <Box gap={2}>
            <Text color="gray" dimColor>
              parent
            </Text>
            <Text color="gray">
              {commit.parents.map((p) => p.slice(0, 7)).join(", ")}
            </Text>
          </Box>
        )}
      </Box>

      {/* stats bar */}
      <Box paddingX={1} marginTop={1} gap={3}>
        <Text color="green">+{commit.insertions} insertions</Text>
        <Text color="red">-{commit.deletions} deletions</Text>
        <Text color="gray" dimColor>
          {commit.filesChanged} file{commit.filesChanged !== 1 ? "s" : ""}{" "}
          changed
        </Text>
      </Box>

      {/* ── Diff section ── */}
      <Box paddingX={1} marginTop={1}>
        <Text color="gray" dimColor>
          {divider}
        </Text>
      </Box>

      <Box paddingX={1} marginBottom={1} gap={2}>
        <Text color={ACCENT}>CHANGES</Text>
        <Text color="gray" dimColor>
          {showFullDiff ? "[d] collapse diff" : "[d] expand diff"}
        </Text>
        {diffLoading && (
          <Text color="gray" dimColor>
            loading…
          </Text>
        )}
      </Box>

      {/* diff lines */}
      {visibleDiffLines.map((line, i) => {
        if (line.type === "fileheader") {
          return (
            <Box key={i} paddingX={1}>
              <Text color={line.fileHeader ?? "white"} bold>
                {line.content}
              </Text>
            </Box>
          );
        }
        if (line.type === "filestat") {
          return (
            <Box key={i} paddingX={1}>
              <Text color="gray" dimColor>
                {line.content}
              </Text>
            </Box>
          );
        }
        if (line.type === "header") {
          return (
            <Box key={i} paddingX={1}>
              <Text color="cyan" dimColor>
                {line.content.slice(0, width - 4)}
              </Text>
            </Box>
          );
        }
        if (line.type === "add") {
          return (
            <Box key={i} paddingX={1}>
              <Text color="green">
                {"+"}
                {line.content.slice(0, width - 5)}
              </Text>
            </Box>
          );
        }
        if (line.type === "remove") {
          return (
            <Box key={i} paddingX={1}>
              <Text color="red">
                {"-"}
                {line.content.slice(0, width - 5)}
              </Text>
            </Box>
          );
        }
        return (
          <Box key={i} paddingX={1}>
            <Text color="gray" dimColor>
              {" "}
              {line.content.slice(0, width - 5)}
            </Text>
          </Box>
        );
      })}

      {allDiffLines.length > visibleDiffLines.length + diffScrollOffset && (
        <Box paddingX={1} marginTop={1}>
          <Text color="gray" dimColor>
            ↓ scroll diff with shift+↑↓
          </Text>
        </Box>
      )}
    </Box>
  );
}
