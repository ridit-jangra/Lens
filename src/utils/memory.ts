import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import os from "os";

export type MemoryEntryKind =
  | "file-written"
  | "file-read"
  | "url-fetched"
  | "shell-run"
  | "code-applied"
  | "code-skipped";

export type MemoryEntry = {
  kind: MemoryEntryKind;
  detail: string;
  summary: string;
  timestamp: string;
  repoPath: string;
};

export type Memory = {
  id: string;
  content: string;
  timestamp: string;
  repoPath: string;
};

export type MemoryFile = {
  entries: MemoryEntry[];
  memories: Memory[];
};

const LENS_DIR = path.join(os.homedir(), ".lens");
const MEMORY_PATH = path.join(LENS_DIR, "memory.json");

function loadMemoryFile(): MemoryFile {
  if (!existsSync(MEMORY_PATH)) return { entries: [], memories: [] };
  try {
    const data = JSON.parse(
      readFileSync(MEMORY_PATH, "utf-8"),
    ) as Partial<MemoryFile>;
    return {
      entries: data.entries ?? [],
      memories: data.memories ?? [],
    };
  } catch {
    return { entries: [], memories: [] };
  }
}

function saveMemoryFile(m: MemoryFile): void {
  if (!existsSync(LENS_DIR)) mkdirSync(LENS_DIR, { recursive: true });
  writeFileSync(MEMORY_PATH, JSON.stringify(m, null, 2), "utf-8");
}

// ── Action entries (what the model has done) ──────────────────────────────────

export function appendMemory(entry: Omit<MemoryEntry, "timestamp">): void {
  const m = loadMemoryFile();
  m.entries.push({ ...entry, timestamp: new Date().toISOString() });
  if (m.entries.length > 500) m.entries = m.entries.slice(-500);
  saveMemoryFile(m);
}

export function buildMemorySummary(repoPath: string): string {
  const m = loadMemoryFile();
  const relevant = m.entries.filter((e) => e.repoPath === repoPath).slice(-50);

  const memories = m.memories.filter((mem) => mem.repoPath === repoPath);

  const parts: string[] = [];

  if (memories.length > 0) {
    parts.push(
      `## MEMORIES ABOUT THIS REPO\n\n${memories
        .map((mem) => `- [${mem.id}] ${mem.content}`)
        .join("\n")}`,
    );
  }

  if (relevant.length > 0) {
    const lines = relevant.map((e) => {
      const ts = new Date(e.timestamp).toLocaleString();
      return `[${ts}] ${e.kind}: ${e.detail} — ${e.summary}`;
    });
    parts.push(
      `## WHAT YOU HAVE ALREADY DONE IN THIS REPO\n\nThe following actions have already been completed. Do NOT repeat them unless the user explicitly asks you to redo something:\n\n${lines.join("\n")}`,
    );
  }

  return parts.join("\n\n");
}

export function getRepoMemory(repoPath: string): MemoryEntry[] {
  return loadMemoryFile().entries.filter((e) => e.repoPath === repoPath);
}

export function clearRepoMemory(repoPath: string): void {
  const m = loadMemoryFile();
  m.entries = m.entries.filter((e) => e.repoPath !== repoPath);
  m.memories = m.memories.filter((mem) => mem.repoPath !== repoPath);
  saveMemoryFile(m);
}

// ── User/model memories ───────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function addMemory(content: string, repoPath: string): Memory {
  const m = loadMemoryFile();
  const memory: Memory = {
    id: generateId(),
    content,
    timestamp: new Date().toISOString(),
    repoPath,
  };
  m.memories.push(memory);
  saveMemoryFile(m);
  return memory;
}

export function deleteMemory(id: string, repoPath: string): boolean {
  const m = loadMemoryFile();
  const before = m.memories.length;
  m.memories = m.memories.filter(
    (mem) => !(mem.id === id && mem.repoPath === repoPath),
  );
  if (m.memories.length === before) return false;
  saveMemoryFile(m);
  return true;
}

export function listMemories(repoPath: string): Memory[] {
  return loadMemoryFile().memories.filter((mem) => mem.repoPath === repoPath);
}
