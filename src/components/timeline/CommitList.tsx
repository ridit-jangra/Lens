import React from "react";
import { Box, Text } from "ink";
import type { Commit } from "../../utils/git";

const ACCENT = "#FF8C00";

type Props = {
  commits: Commit[];
  selectedIndex: number;
  scrollOffset: number;
  visibleCount: number;
  searchQuery: string;
  width: number;
};

function formatRefs(refs: string): string {
  if (!refs) return "";
  return refs
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      if (r.startsWith("HEAD -> ")) return `[${r.slice(8)}]`;
      if (r.startsWith("origin/")) return `[${r}]`;
      if (r.startsWith("tag: ")) return `<${r.slice(5)}>`;
      return `[${r}]`;
    })
    .join(" ");
}

function shortDate(dateStr: string): string {
  // "2026-03-12 14:22:01 +0530" → "Mar 12"
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr.slice(0, 10);
  }
}

function graphSymbol(
  commit: Commit,
  index: number,
): { symbol: string; color: string } {
  if (commit.parents.length > 1) return { symbol: "⎇", color: "magenta" };
  if (index === 0) return { symbol: "◉", color: ACCENT };
  return { symbol: "●", color: "gray" };
}

export function CommitList({
  commits,
  selectedIndex,
  scrollOffset,
  visibleCount,
  searchQuery,
  width,
}: Props) {
  const visible = commits.slice(scrollOffset, scrollOffset + visibleCount);

  return (
    <Box flexDirection="column" width={width}>
      {/* header */}
      <Box paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>
          {"─".repeat(Math.max(0, width - 2))}
        </Text>
      </Box>
      <Box paddingX={1} marginBottom={1}>
        <Text color={ACCENT} bold>
          {" COMMITS "}
        </Text>
        <Text color="gray" dimColor>
          {commits.length} total
          {searchQuery ? `  / ${searchQuery}` : ""}
        </Text>
      </Box>

      {visible.map((commit, i) => {
        const absoluteIndex = scrollOffset + i;
        const isSelected = absoluteIndex === selectedIndex;
        const { symbol, color } = graphSymbol(commit, absoluteIndex);
        const refs = formatRefs(commit.refs);
        const date = shortDate(commit.date);

        // truncate message to fit width
        const prefixLen = 14; // symbol + hash + date
        const maxMsg = Math.max(10, width - prefixLen - 3);
        const msg =
          commit.message.length > maxMsg
            ? commit.message.slice(0, maxMsg - 1) + "…"
            : commit.message;

        return (
          <Box key={commit.hash} paddingX={1} flexDirection="column">
            {/* graph line above (not first) */}
            {i > 0 && (
              <Text color="gray" dimColor>
                {"│"}
              </Text>
            )}
            <Box gap={1}>
              {/* selection indicator */}
              <Text color={isSelected ? ACCENT : "gray"}>
                {isSelected ? "▶" : " "}
              </Text>

              {/* graph node */}
              <Text color={isSelected ? ACCENT : color}>{symbol}</Text>

              {/* short hash */}
              <Text
                color={isSelected ? "white" : "gray"}
                dimColor={!isSelected}
              >
                {commit.shortHash}
              </Text>

              {/* date */}
              <Text color="cyan" dimColor={!isSelected}>
                {date}
              </Text>

              {/* message */}
              <Text
                color={isSelected ? "white" : "gray"}
                bold={isSelected}
                wrap="truncate"
              >
                {msg}
              </Text>
            </Box>

            {/* refs on selected */}
            {isSelected && refs && (
              <Box paddingLeft={4}>
                <Text color="yellow">{refs}</Text>
              </Box>
            )}

            {/* stat summary on selected */}
            {isSelected && (
              <Box paddingLeft={4} gap={2}>
                <Text color="gray" dimColor>
                  {commit.author}
                </Text>
                {commit.filesChanged > 0 && (
                  <>
                    <Text color="green">+{commit.insertions}</Text>
                    <Text color="red">-{commit.deletions}</Text>
                    <Text color="gray" dimColor>
                      {commit.filesChanged} file
                      {commit.filesChanged !== 1 ? "s" : ""}
                    </Text>
                  </>
                )}
              </Box>
            )}
          </Box>
        );
      })}

      {/* scroll hint */}
      <Box paddingX={1} marginTop={1}>
        <Text color="gray" dimColor>
          {scrollOffset > 0 ? "↑ more above" : ""}
          {scrollOffset > 0 && scrollOffset + visibleCount < commits.length
            ? "  "
            : ""}
          {scrollOffset + visibleCount < commits.length ? "↓ more below" : ""}
        </Text>
      </Box>
    </Box>
  );
}
