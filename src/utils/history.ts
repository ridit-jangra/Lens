import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import os from "os";

export type HistoryEntryKind =
  | "file-written"
  | "file-read"
  | "url-fetched"
  | "shell-run"
  | "code-applied"
  | "code-skipped";

export type HistoryEntry = {
  kind: HistoryEntryKind;
  detail: string;
  summary: string;
  timestamp: string;
  repoPath: string;
};

export type HistoryFile = {
  entries: HistoryEntry[];
};

const LENS_DIR = path.join(os.homedir(), ".lens");
const HISTORY_PATH = path.join(LENS_DIR, "history.json");

function loadHistory(): HistoryFile {
  if (!existsSync(HISTORY_PATH)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, "utf-8")) as HistoryFile;
  } catch {
    return { entries: [] };
  }
}

function saveHistory(h: HistoryFile): void {
  if (!existsSync(LENS_DIR)) mkdirSync(LENS_DIR, { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify(h, null, 2), "utf-8");
}

export function appendHistory(entry: Omit<HistoryEntry, "timestamp">): void {
  const h = loadHistory();
  h.entries.push({ ...entry, timestamp: new Date().toISOString() });

  if (h.entries.length > 500) h.entries = h.entries.slice(-500);
  saveHistory(h);
}

/**
 * Returns a compact summary string to inject into the system prompt.
 * Only includes entries for the current repo, most recent 50.
 */
export function buildHistorySummary(repoPath: string): string {
  const h = loadHistory();
  const relevant = h.entries.filter((e) => e.repoPath === repoPath).slice(-50);

  if (relevant.length === 0) return "";

  const lines = relevant.map((e) => {
    const ts = new Date(e.timestamp).toLocaleString();
    return `[${ts}] ${e.kind}: ${e.detail} — ${e.summary}`;
  });

  return `## WHAT YOU HAVE ALREADY DONE IN THIS REPO

The following actions have already been completed. Do NOT repeat them unless the user explicitly asks you to redo something:

${lines.join("\n")}`;
}

/**
 * Returns all entries for a repo, for display purposes.
 */
export function getRepoHistory(repoPath: string): HistoryEntry[] {
  return loadHistory().entries.filter((e) => e.repoPath === repoPath);
}

/**
 * Clears all history for a repo.
 */
export function clearRepoHistory(repoPath: string): void {
  const h = loadHistory();
  h.entries = h.entries.filter((e) => e.repoPath !== repoPath);
  saveHistory(h);
}
