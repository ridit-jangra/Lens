import React from "react";
import { Box, Text } from "ink";
import figures from "figures";

export type DiffLine = {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNum: number;
};

export type FilePatch = {
  path: string;
  content: string;
  isNew: boolean;
};

export function computeDiff(
  oldContent: string,
  newContent: string,
): DiffLine[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const result: DiffLine[] = [];

  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  const raw: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.unshift({ type: "unchanged", content: oldLines[i - 1]!, lineNum: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      raw.unshift({ type: "added", content: newLines[j - 1]!, lineNum: j });
      j--;
    } else {
      raw.unshift({ type: "removed", content: oldLines[i - 1]!, lineNum: i });
      i--;
    }
  }

  const CONTEXT = 3;
  const changedIndices = new Set<number>();
  raw.forEach((line, idx) => {
    if (line.type !== "unchanged") {
      for (
        let k = Math.max(0, idx - CONTEXT);
        k <= Math.min(raw.length - 1, idx + CONTEXT);
        k++
      ) {
        changedIndices.add(k);
      }
    }
  });

  let lastIncluded = -1;
  raw.forEach((line, idx) => {
    if (!changedIndices.has(idx)) return;
    if (lastIncluded !== -1 && idx > lastIncluded + 1) {
      result.push({ type: "unchanged", content: "...", lineNum: -1 });
    }
    result.push(line);
    lastIncluded = idx;
  });

  return result;
}

export function buildDiffs(
  repoPath: string,
  patches: FilePatch[],
): DiffLine[][] {
  const { readFileSync } = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");

  return patches.map((patch) => {
    if (patch.isNew) {
      return patch.content.split("\n").map((line, i) => ({
        type: "added" as const,
        content: line,
        lineNum: i + 1,
      }));
    }
    const fullPath = path.join(repoPath, patch.path);
    let oldContent = "";
    try {
      oldContent = readFileSync(fullPath, "utf-8");
    } catch {
      // file doesn't exist yet
    }
    return computeDiff(oldContent, patch.content);
  });
}

export const DiffViewer = ({
  patches,
  diffs,
  scrollOffset,
  maxVisible = 20,
}: {
  patches: FilePatch[];
  diffs: DiffLine[][];
  scrollOffset: number;
  maxVisible?: number;
}) => {
  const allLines: {
    fileIdx: number;
    fileName: string;
    line: DiffLine | null;
  }[] = [];

  patches.forEach((patch, fi) => {
    allLines.push({ fileIdx: fi, fileName: patch.path, line: null });
    (diffs[fi] ?? []).forEach((line) => {
      allLines.push({ fileIdx: fi, fileName: patch.path, line });
    });
  });

  const visible = allLines.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <Box flexDirection="column" gap={0}>
      {visible.map((entry, i) => {
        if (!entry.line) {
          return (
            <Box key={`header-${entry.fileIdx}-${i}`}>
              <Text bold color={entry.fileIdx % 2 === 0 ? "cyan" : "magenta"}>
                {figures.bullet} {entry.fileName}
                {patches[entry.fileIdx]?.isNew ? " (new file)" : ""}
              </Text>
            </Box>
          );
        }

        const { type, content, lineNum } = entry.line;
        const prefix = type === "added" ? "+" : type === "removed" ? "-" : " ";
        const color =
          type === "added" ? "green" : type === "removed" ? "red" : "gray";
        const lineNumStr =
          lineNum === -1 ? "   " : String(lineNum).padStart(3, " ");

        return (
          <Box key={`line-${entry.fileIdx}-${i}`}>
            <Text color="gray">{lineNumStr} </Text>
            <Text color={color}>
              {prefix} {content}
            </Text>
          </Box>
        );
      })}
      {allLines.length > maxVisible && (
        <Text color="gray" dimColor>
          {scrollOffset + maxVisible < allLines.length
            ? `↓ ${allLines.length - scrollOffset - maxVisible} more lines`
            : "end of diff"}
        </Text>
      )}
    </Box>
  );
};
