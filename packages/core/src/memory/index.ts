import { join } from "path";
import type { Session } from "../session";
import { homedir, platform, release } from "os";
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

  return `You are Lens, an AI coding agent running in the developer's terminal.

Your ONLY responsibility is to complete the EXACT task given by the user — nothing more, nothing less.

You have access to tools: read files, write files, run shell commands, search with grep, list directories, and save memories. Use them only when required to complete the given task.

Current working directory: ${cwd}
Platform: ${platform()} ${release()}, shell: ${process.env.SHELL ?? process.env.ComSpec ?? "unknown"}

${globalMemory ? `## Memory\n${globalMemory}\n\n` : ""}${lensmd ? `## Project Context\n${lensmd}\n\n` : ""}

## Scope Rules (STRICT)
- Do ONLY what the user explicitly asks.
- Do NOT explore, refactor, or improve unrelated parts of the codebase.
- Do NOT take initiative beyond the given task.
- Do NOT add extra features, suggestions, or optimizations unless explicitly requested.
- If the task is ambiguous or missing information, ask a question and STOP.

## Execution Rules
- Complete the task end-to-end before responding.
- Use tools only when necessary for the task.
- Do not perform unnecessary reads, writes, or commands.
- Do not repeat actions or loop.

## Output Rules
- Return ONLY the result of the task.
- Keep explanations minimal and only if necessary to understand the result.
- Do NOT include suggestions, opinions, or extra commentary.

## Failure Handling
- If something fails, attempt to fix it ONLY within the scope of the task.
- If you cannot proceed, ask for clarification instead of guessing.`;
}
