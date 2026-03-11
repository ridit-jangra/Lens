import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { AnalysisResult } from "../types/repo";

export const LENS_FILENAME = "LENS.md";

export type LensFile = {
  overview: string;
  importantFolders: string[];
  missingConfigs: string[];
  securityIssues: string[];
  suggestions: string[];
  generatedAt: string;
};

export function lensFilePath(repoPath: string): string {
  return path.join(repoPath, LENS_FILENAME);
}

export function lensFileExists(repoPath: string): boolean {
  return existsSync(lensFilePath(repoPath));
}

export function writeLensFile(repoPath: string, result: AnalysisResult): void {
  const data: LensFile = {
    ...result,
    generatedAt: new Date().toISOString(),
  };

  const content = `# Lens Analysis
> Generated: ${data.generatedAt}

## Overview
${data.overview}

## Important Folders
${data.importantFolders.map((f) => `- ${f}`).join("\n")}

## Missing Configs
${data.missingConfigs.length > 0 ? data.missingConfigs.map((f) => `- ${f}`).join("\n") : "- None detected"}

## Security Issues
${data.securityIssues.length > 0 ? data.securityIssues.map((s) => `- ${s}`).join("\n") : "- None detected"}

## Suggestions
${data.suggestions.map((s) => `- ${s}`).join("\n")}

<!--lens-json
${JSON.stringify(data)}
lens-json-->
`;

  writeFileSync(lensFilePath(repoPath), content, "utf-8");
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
    missingConfigs: lf.missingConfigs,
    securityIssues: lf.securityIssues,
    suggestions: lf.suggestions,
  };
}
