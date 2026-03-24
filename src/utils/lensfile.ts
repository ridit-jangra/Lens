import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { AnalysisResult } from "../types/repo";

export const LENS_FILENAME = "LENS.md";

export type LensFile = {
  overview: string;
  importantFolders: string[];
  tooling: Record<string, string>;
  keyFiles: string[];
  patterns: string[];
  architecture: string;
  suggestions: string[];
  generatedAt: string;
  lastUpdated: string;
};

export function lensFilePath(repoPath: string): string {
  return path.join(repoPath, LENS_FILENAME);
}

export function lensFileExists(repoPath: string): boolean {
  return existsSync(lensFilePath(repoPath));
}

function renderLensFile(data: LensFile): string {
  const toolingLines = Object.entries(data.tooling)
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join("\n");

  return `# Lens
> Generated: ${data.generatedAt}${data.lastUpdated !== data.generatedAt ? `  |  Updated: ${data.lastUpdated}` : ""}

## Overview
${data.overview}

## Architecture
${data.architecture}

## Tooling & Conventions
${toolingLines || "- Not yet determined"}

## Important Folders
${data.importantFolders.map((f) => `- ${f}`).join("\n") || "- None"}

## Key Files
${data.keyFiles.map((f) => `- ${f}`).join("\n") || "- None"}

## Patterns & Idioms
${data.patterns.map((p) => `- ${p}`).join("\n") || "- None"}

## Suggestions
${data.suggestions.map((s) => `- ${s}`).join("\n") || "- None"}

<!--lens-json
${JSON.stringify(data)}
lens-json-->
`;
}

export function writeLensFile(repoPath: string, result: AnalysisResult): void {
  const now = new Date().toISOString();
  const data: LensFile = {
    overview: result.overview,
    importantFolders: result.importantFolders,
    tooling: result.tooling ?? {},
    keyFiles: result.keyFiles ?? [],
    patterns: result.patterns ?? [],
    architecture: result.architecture ?? "",
    suggestions: result.suggestions,
    generatedAt: now,
    lastUpdated: now,
  };
  writeFileSync(lensFilePath(repoPath), renderLensFile(data), "utf-8");
}

export function patchLensFile(
  repoPath: string,
  patch: Partial<AnalysisResult>,
): void {
  const existing = readLensFile(repoPath);
  const now = new Date().toISOString();

  const base: LensFile = existing ?? {
    overview: "",
    importantFolders: [],
    tooling: {},
    keyFiles: [],
    patterns: [],
    architecture: "",
    suggestions: [],
    generatedAt: now,
    lastUpdated: now,
  };

  const merged: LensFile = {
    ...base,
    lastUpdated: now,
    overview: patch.overview ?? base.overview,
    architecture: patch.architecture ?? base.architecture,
    tooling: { ...base.tooling, ...(patch.tooling ?? {}) },
    importantFolders: dedup([
      ...base.importantFolders,
      ...(patch.importantFolders ?? []),
    ]),
    keyFiles: dedup([...base.keyFiles, ...(patch.keyFiles ?? [])]),
    patterns: dedup([...base.patterns, ...(patch.patterns ?? [])]),
    suggestions: dedup([...base.suggestions, ...(patch.suggestions ?? [])]),
  };

  writeFileSync(lensFilePath(repoPath), renderLensFile(merged), "utf-8");
}

function dedup(arr: string[]): string[] {
  return [...new Map(arr.map((s) => [s.trim().toLowerCase(), s])).values()];
}

export function readLensFile(repoPath: string): LensFile | null {
  const filePath = lensFilePath(repoPath);
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf-8");
    const match = content.match(/<!--lens-json\n([\s\S]*?)\nlens-json-->/);
    if (!match) return null;
    return JSON.parse(match[1]!) as LensFile;
  } catch {
    return null;
  }
}

export function lensFileToAnalysisResult(lf: LensFile): AnalysisResult {
  return {
    overview: lf.overview,
    importantFolders: lf.importantFolders,
    tooling: lf.tooling,
    keyFiles: lf.keyFiles,
    patterns: lf.patterns,
    architecture: lf.architecture,
    suggestions: lf.suggestions,
  };
}
