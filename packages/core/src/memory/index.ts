import { join } from "path";
import type { Session } from "../session";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const MEMORY_DIR = join(homedir(), ".lens", "memory");
const GLOBAL_MEMORY_PATH = join(homedir(), ".lens", "global-memory.json");

// per-repo session
// runs: git rev-list --max-parents=0 HEAD in cwd
// returns first commit hash
export function getRepoId(cwd: string): string {
  try {
    return execSync("git rev-list --max-parents=0 HEAD", { cwd })
      .toString()
      .trim();
  } catch {
    // not a git repo, use cwd as fallback
    return Buffer.from(cwd).toString("base64");
  }
}

// saves to ~/.lens/memory/{repoId}.json
export function saveSession(cwd: string, session: Session): void {
  const memory_file = join(MEMORY_DIR, getRepoId(cwd));
  mkdirSync(MEMORY_DIR, { recursive: true });
  writeFileSync(memory_file, JSON.stringify(session));
}

// loads ~/.lens/memory/{repoId}.json
// returns null if not found
export function loadSession(cwd: string): Session | null {
  const memory_file = join(MEMORY_DIR, getRepoId(cwd));
  if (!sessionExists(cwd)) return null;

  const session = JSON.parse(readFileSync(memory_file, "utf-8")) as Session;

  return session;
}

export function sessionExists(cwd: string): boolean {
  const memory_file = join(MEMORY_DIR, getRepoId(cwd));
  return existsSync(memory_file);
}

// global memory
// reads ~/.lens/global-memory.json
// returns null if not found
export function loadGlobalMemory(): string | null {
  if (!existsSync(GLOBAL_MEMORY_PATH)) return null;

  return readFileSync(GLOBAL_MEMORY_PATH, "utf-8");
}

// writes to ~/.lens/global-memory.json
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
  
  Always use tools to explore before answering.
  Be concise and precise.`;
}
