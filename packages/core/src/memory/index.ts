import { join } from "path";
import type { Session } from "../session";
import { homedir } from "os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";

const MEMORY_DIR = join(homedir(), ".lens", "memory");
const GLOBAL_MEMORY_PATH = join(homedir(), ".lens", "global-memory.txt");

// saves to ~/.lens/memory/{session.id}.json
export function saveSession(session: Session): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
  const file = join(MEMORY_DIR, `${session.id}.json`);
  writeFileSync(file, JSON.stringify(session));
}

// loads by session id
export function loadSession(id: string): Session | null {
  const file = join(MEMORY_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf-8")) as Session;
}

// get latest session for cwd
export function getLatestSession(cwd: string): Session | null {
  if (!existsSync(MEMORY_DIR)) return null;
  const files = readdirSync(MEMORY_DIR);
  if (files.length === 0) return null;
  const sessions = files
    .map(
      (f) => JSON.parse(readFileSync(join(MEMORY_DIR, f), "utf-8")) as Session,
    )
    .filter((s) => s.cwd === cwd)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  return sessions[0] ?? null;
}

// global memory
export function loadGlobalMemory(): string | null {
  if (!existsSync(GLOBAL_MEMORY_PATH)) return null;
  return readFileSync(GLOBAL_MEMORY_PATH, "utf-8");
}

export function saveGlobalMemory(content: string): void {
  writeFileSync(GLOBAL_MEMORY_PATH, content);
}

// system prompt
export function getSystemPrompt(cwd: string): string {
  const globalMemory = loadGlobalMemory();
  const lensmd = existsSync(join(cwd, "LENS.md"))
    ? readFileSync(join(cwd, "LENS.md"), "utf-8")
    : null;

  return `You are Lens — an AI that helps developers understand their codebase.
    "Understand your codebase."
    Current directory: ${cwd}
    
    ${globalMemory ? `## Your Memory:\n${globalMemory}` : ""}
    
    ${lensmd ? `## Codebase Context:\n${lensmd}` : "No memory yet. Run /init to analyze this codebase."}
    
    Be concise. No fluff. Only answer what was asked.
    Use tools only when necessary.
    Prefer short responses over long explanations.`;
}
