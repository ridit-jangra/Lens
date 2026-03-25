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
  repoPath?: string;
};

export type Memory = {
  id: string;
  content: string;
  timestamp: string;
  repoPath?: string;
  scope: "repo" | "global";
};

export type MemoryFile = {
  memories: Memory[];
};

const LENS_DIR = path.join(os.homedir(), ".lens");
const MEMORY_PATH = path.join(LENS_DIR, "memory.json");

function loadMemoryFile(): MemoryFile {
  if (!existsSync(MEMORY_PATH)) return { memories: [] };
  try {
    const data = JSON.parse(
      readFileSync(MEMORY_PATH, "utf-8"),
    ) as Partial<MemoryFile>;
    return { memories: data.memories ?? [] };
  } catch {
    return { memories: [] };
  }
}

function saveMemoryFile(m: MemoryFile): void {
  if (!existsSync(LENS_DIR)) mkdirSync(LENS_DIR, { recursive: true });
  writeFileSync(MEMORY_PATH, JSON.stringify(m, null, 2), "utf-8");
}

// ── Session-only action entries (in-memory, never written to disk) ────────────

const sessionEntries: MemoryEntry[] = [];

export function appendMemory(
  entry: Omit<MemoryEntry, "timestamp">,
  repoPath?: string,
): void {
  sessionEntries.push({
    ...entry,
    repoPath,
    timestamp: new Date().toISOString(),
  });
  if (sessionEntries.length > 200)
    sessionEntries.splice(0, sessionEntries.length - 200);
}

export function buildMemorySummary(repoPath: string): string {
  const m = loadMemoryFile();

  const globalMemories = m.memories.filter((mem) => mem.scope === "global");
  const repoMemories = m.memories.filter(
    (mem) => mem.scope === "repo" && mem.repoPath === repoPath,
  );

  const relevant = sessionEntries
    .filter((e) => !e.repoPath || e.repoPath === repoPath)
    .slice(-50);

  const parts: string[] = [];

  if (globalMemories.length > 0) {
    parts.push(
      `## GLOBAL MEMORIES (apply to all repos)\n\n${globalMemories
        .map((mem) => `- [${mem.id}] ${mem.content}`)
        .join("\n")}`,
    );
  }

  if (repoMemories.length > 0) {
    parts.push(
      `## MEMORIES ABOUT THIS REPO\n\n${repoMemories
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
      `## WHAT YOU HAVE ALREADY DONE THIS SESSION\n\nThe following actions have already been completed. Do NOT repeat them unless the user explicitly asks:\n\n${lines.join("\n")}`,
    );
  }

  return parts.join("\n\n");
}

export function getRepoMemory(repoPath: string): MemoryEntry[] {
  return sessionEntries.filter((e) => !e.repoPath || e.repoPath === repoPath);
}

export function clearRepoMemory(repoPath: string): void {
  // clear session entries for this repo
  const toRemove = sessionEntries
    .map((e, i) => (e.repoPath === repoPath ? i : -1))
    .filter((i) => i >= 0)
    .reverse();
  for (const i of toRemove) sessionEntries.splice(i, 1);

  // clear persisted memories for this repo (keep global)
  const m = loadMemoryFile();
  m.memories = m.memories.filter(
    (mem) => mem.scope === "global" || mem.repoPath !== repoPath,
  );
  saveMemoryFile(m);
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function addMemory(content: string, repoPath: string): Memory {
  const m = loadMemoryFile();

  const isGlobal = content.startsWith("[global]");
  const cleanContent = isGlobal
    ? content.replace("[global]", "").trim()
    : content;

  const memory: Memory = {
    id: generateId(),
    content: cleanContent,
    repoPath: isGlobal ? undefined : repoPath,
    scope: isGlobal ? "global" : "repo",
    timestamp: new Date().toISOString(),
  };
  m.memories.push(memory);
  saveMemoryFile(m);
  return memory;
}

export function deleteMemory(id: string, repoPath: string): boolean {
  const m = loadMemoryFile();
  const before = m.memories.length;
  m.memories = m.memories.filter((mem) => mem.id !== id);
  if (m.memories.length === before) return false;
  saveMemoryFile(m);
  return true;
}

export function listMemories(repoPath: string): Memory[] {
  return loadMemoryFile().memories.filter(
    (mem) => mem.scope === "global" || mem.repoPath === repoPath,
  );
}

type SessionToolLog = {
  toolName: string;
  input: string;
  resultPreview: string;
  timestamp: string;
};

const sessionToolLog: SessionToolLog[] = [];

export function logToolCall(
  toolName: string,
  input: string,
  result: string,
  repoPath?: string,
): void {
  sessionToolLog.push({
    toolName,
    input,
    resultPreview: result.slice(0, 120),
    timestamp: new Date().toISOString(),
  });
  if (sessionToolLog.length > 100)
    sessionToolLog.splice(0, sessionToolLog.length - 100);
}

export function getSessionToolSummary(repoPath: string): string {
  if (sessionToolLog.length === 0) return "";
  const recent = sessionToolLog.slice(-30);
  const lines = recent.map((e) => {
    const input = e.input.length > 60 ? e.input.slice(0, 60) + "…" : e.input;
    return `- ${e.toolName}: ${input}`;
  });
  return `## TOOLS ALREADY USED THIS SESSION\n\nDo NOT call these again unless the user explicitly asks:\n\n${lines.join("\n")}`;
}

export function clearSessionLog(): void {
  sessionToolLog.splice(0, sessionToolLog.length);
}
