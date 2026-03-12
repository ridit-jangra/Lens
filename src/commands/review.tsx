import React from "react";
import { Box, Text } from "ink";
import figures from "figures";
import { useEffect, useState } from "react";
import path from "path";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { fetchFileTree, readImportantFiles } from "../utils/files";
import { computeStats, formatNumber, topLanguages } from "../utils/stats";
import { RepoAnalysis } from "../components/repo/RepoAnalysis";
import { LensFileMenu } from "../components/repo/LensFileMenu";
import {
  lensFileExists,
  readLensFile,
  lensFileToAnalysisResult,
} from "../utils/lensfile";
import type { ImportantFile } from "../types/repo";
import type { CodeStats } from "../utils/stats";
import type { LensMenuChoice } from "../components/repo/LensFileMenu";

type ReviewStage =
  | { type: "scanning" }
  | {
      type: "lens-menu";
      fileTree: string[];
      files: ImportantFile[];
      stats: CodeStats;
    }
  | {
      type: "stats";
      stats: CodeStats;
      files: ImportantFile[];
      fileTree: string[];
    }
  | { type: "error"; message: string };

function StatRow({ label, value }: { label: string; value: string }) {
  const PAD = 20;
  return (
    <Box>
      <Text color="gray">{label.padEnd(PAD, " ")}</Text>
      <Text color="white" bold>
        {value}
      </Text>
    </Box>
  );
}

function Divider() {
  return <Text color="gray">{"─".repeat(36)}</Text>;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
]);

function parseGitignore(dir: string): string[] {
  const p = path.join(dir, ".gitignore");
  if (!existsSync(p)) return [];
  try {
    return readFileSync(p, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

function matchesGitignore(
  patterns: string[],
  relPath: string,
  isDir: boolean,
): boolean {
  const name = path.basename(relPath);
  for (const pattern of patterns) {
    if (pattern.endsWith("/")) {
      if (isDir && name === pattern.slice(0, -1)) return true;
      continue;
    }
    if (pattern.startsWith("!")) continue;
    if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" +
          pattern
            .replace(/\./g, "\\.")
            .replace(/\*\*/g, ".*")
            .replace(/\*/g, "[^/]*") +
          "$",
      );
      if (regex.test(name) || regex.test(relPath)) return true;
      continue;
    }
    if (
      name === pattern ||
      relPath === pattern ||
      relPath.startsWith(pattern + "/")
    )
      return true;
  }
  return false;
}

function walkDir(dir: string, base = dir, patterns?: string[]): string[] {
  const p = patterns ?? parseGitignore(base);
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir, { encoding: "utf-8" });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const rel = path.relative(base, full).replace(/\\/g, "/");
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (matchesGitignore(p, rel, isDir)) continue;
    if (isDir) results.push(...walkDir(full, base, p));
    else results.push(rel);
  }
  return results;
}

function StatsPanel({
  resolvedPath,
  stats,
}: {
  resolvedPath: string;
  stats: CodeStats;
}) {
  const langs = topLanguages(stats.languages);
  return (
    <Box flexDirection="column" marginTop={1} gap={0}>
      <Text bold color="cyan">
        {figures.hamburger} {path.basename(resolvedPath)}
      </Text>
      <Divider />
      <StatRow label="Lines of Code" value={formatNumber(stats.codeLines)} />
      <StatRow label="Total Lines" value={formatNumber(stats.totalLines)} />
      <StatRow label="Files" value={formatNumber(stats.totalFiles)} />
      <StatRow label="Languages" value={langs || "—"} />
      <StatRow label="Functions" value={formatNumber(stats.functions)} />
      <StatRow label="Classes" value={formatNumber(stats.classes)} />
      <StatRow label="Comment Lines" value={formatNumber(stats.commentLines)} />
      <StatRow label="Blank Lines" value={formatNumber(stats.blankLines)} />
      <Divider />
    </Box>
  );
}

export const ReviewCommand = ({ path: inputPath }: { path: string }) => {
  const [stage, setStage] = useState<ReviewStage>({ type: "scanning" });

  const [preloadedResult, setPreloadedResult] = useState<
    import("../types/repo").AnalysisResult | null
  >(null);
  const resolvedPath = path.resolve(inputPath);

  useEffect(() => {
    if (!existsSync(resolvedPath)) {
      setStage({ type: "error", message: `Path not found: ${resolvedPath}` });
      return;
    }

    fetchFileTree(resolvedPath)
      .catch(() => walkDir(resolvedPath))
      .then((fileTree) => {
        const stats = computeStats(resolvedPath, fileTree);
        const files = readImportantFiles(resolvedPath, fileTree);

        if (lensFileExists(resolvedPath)) {
          setStage({ type: "lens-menu", fileTree, files, stats });
        } else {
          setStage({ type: "stats", stats, files, fileTree });
        }
      })
      .catch((err: unknown) =>
        setStage({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to scan",
        }),
      );
  }, [resolvedPath]);

  const handleLensChoice = (
    choice: LensMenuChoice,
    fileTree: string[],
    files: ImportantFile[],
    stats: CodeStats,
  ) => {
    const lf = readLensFile(resolvedPath);

    if (choice === "use-cached" && lf) {
      setPreloadedResult(lensFileToAnalysisResult(lf));
      setStage({ type: "stats", stats, files, fileTree });
      return;
    }

    if (choice === "fix-issues" && lf) {
      setPreloadedResult(lensFileToAnalysisResult(lf));
      setStage({ type: "stats", stats, files, fileTree });
      return;
    }

    if (choice === "security" && lf) {
      setPreloadedResult(lensFileToAnalysisResult(lf));
      setStage({ type: "stats", stats, files, fileTree });
      return;
    }

    setStage({ type: "stats", stats, files, fileTree });
  };

  if (stage.type === "scanning") {
    return (
      <Box marginTop={1} gap={1}>
        <Text color="cyan">{figures.pointer}</Text>
        <Text>Scanning codebase...</Text>
      </Box>
    );
  }

  if (stage.type === "error") {
    return (
      <Box marginTop={1}>
        <Text color="red">
          {figures.cross} {stage.message}
        </Text>
      </Box>
    );
  }

  if (stage.type === "lens-menu") {
    const lf = readLensFile(resolvedPath);
    if (!lf) {
      setStage({
        type: "stats",
        stats: stage.stats,
        files: stage.files,
        fileTree: stage.fileTree,
      });
      return null;
    }
    const { fileTree, files, stats } = stage;
    return (
      <Box flexDirection="column" gap={1}>
        <StatsPanel resolvedPath={resolvedPath} stats={stats} />
        <LensFileMenu
          repoPath={resolvedPath}
          lensFile={lf}
          onChoice={(choice) =>
            handleLensChoice(choice, fileTree, files, stats)
          }
        />
      </Box>
    );
  }

  const { stats, files, fileTree } = stage;

  return (
    <Box flexDirection="column" gap={1}>
      <StatsPanel resolvedPath={resolvedPath} stats={stats} />
      <RepoAnalysis
        repoUrl={resolvedPath}
        repoPath={resolvedPath}
        fileTree={fileTree}
        files={files}
        preloadedResult={preloadedResult ?? undefined}
      />
    </Box>
  );
};
