import { spawn, type ChildProcess } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";

export type WatchProcess = {
  kill: () => void;
  onLog: (cb: (line: string, isErr: boolean) => void) => void;
  onError: (cb: (chunk: ErrorChunk) => void) => void;
  onExit: (cb: (code: number | null) => void) => void;
};

export type ErrorChunk = {
  raw: string;
  lines: string[];
  contextBefore: string[];
  filePath?: string;
  lineNumber?: number;
  timestamp: number;
};

export type Suggestion = {
  id: string;
  errorSummary: string;
  simplified: string;
  fix: string;
  filePath?: string;
  patch?: { path: string; content: string; isNew: boolean };
  timestamp: number;
};

const ERROR_PATTERNS = [
  /error:/i,
  /TypeError/,
  /ReferenceError/,
  /SyntaxError/,
  /RangeError/,
  /NameError/,
  /AttributeError/,
  /KeyError/,
  /IndexError/,
  /ImportError/,
  /ModuleNotFoundError/,
  /ZeroDivisionError/,
  /ValueError/,
  /RuntimeError/,
  /Traceback \(most recent call last\)/,
  /Cannot find module/,
  /Cannot read propert/,
  /is not defined/,
  /is not a function/,
  /Unhandled/,
  /ENOENT/,
  /EADDRINUSE/,
  /failed to compile/i,
  /Build failed/i,
  /Module not found/i,
  /unexpected token/i,
  /Expected/,
];

const NOISE_PATTERNS = [
  /^\s*at\s+/, // stack trace lines
  /^\s*\^+\s*$/, // caret indicators
  /^\s*$/, // blank lines
  /^\s*warn/i, // warnings (unless --verbose)
  /deprecat/i,
];

function isErrorLine(line: string): boolean {
  return ERROR_PATTERNS.some((p) => p.test(line));
}

function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(line));
}

function extractFilePath(lines: string[]): {
  filePath?: string;
  lineNumber?: number;
} {
  for (const line of lines) {
    // Python: File "path/to/file.py", line 12
    const pyM = line.match(/File "([^"]+\.py)",\s*line\s*(\d+)/);
    if (pyM) {
      return { filePath: pyM[1], lineNumber: parseInt(pyM[2]!, 10) };
    }
    // JS/TS: ./src/foo.tsx:12:5
    const m = line.match(
      /([./][\w./\\-]+\.(tsx?|jsx?|mjs|cjs|ts|js|py)):(\d+)/,
    );
    if (m) {
      return { filePath: m[1], lineNumber: parseInt(m[3]!, 10) };
    }
    // at Function (/abs/path/file.ts:12:5)
    const absM = line.match(/\(([^)]+\.(tsx?|jsx?|ts|js)):(\d+)/);
    if (absM) {
      return { filePath: absM[1], lineNumber: parseInt(absM[3]!, 10) };
    }
  }
  return {};
}

export function spawnWatch(cmd: string, cwd: string): WatchProcess {
  const [bin, ...args] = cmd.split(/\s+/) as [string, ...string[]];

  const child: ChildProcess = spawn(bin, args, {
    cwd,
    shell: true,
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  const logCallbacks: ((line: string, isErr: boolean) => void)[] = [];
  const errorCallbacks: ((chunk: ErrorChunk) => void)[] = [];
  const exitCallbacks: ((code: number | null) => void)[] = [];

  const recentLines: string[] = [];
  let errorBuffer: string[] = [];
  let errorTimer: ReturnType<typeof setTimeout> | null = null;
  const seenErrors = new Set<string>();

  const flushError = () => {
    if (errorBuffer.length === 0) return;

    const raw = errorBuffer.join("\n");
    const key = raw.slice(0, 120); // dedup key

    if (seenErrors.has(key)) {
      errorBuffer = [];
      return;
    }
    seenErrors.add(key);

    const { filePath, lineNumber } = extractFilePath(errorBuffer);

    const chunk: ErrorChunk = {
      raw,
      lines: errorBuffer.filter((l) => !isNoise(l)).slice(0, 20),
      contextBefore: recentLines.slice(-15),
      filePath,
      lineNumber,
      timestamp: Date.now(),
    };

    errorCallbacks.forEach((cb) => cb(chunk));
    errorBuffer = [];
  };

  const processLine = (line: string, isErr: boolean) => {
    // keep rolling context
    recentLines.push(line);
    if (recentLines.length > 30) recentLines.shift();

    logCallbacks.forEach((cb) => cb(line, isErr));

    if (isErrorLine(line)) {
      errorBuffer.push(line);
      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = setTimeout(flushError, 300);
    } else if (errorBuffer.length > 0) {
      // accumulate lines after the initial error line (stack trace etc.)
      errorBuffer.push(line);
      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = setTimeout(flushError, 300);
    }
  };

  child.stdout?.on("data", (data: Buffer) => {
    data
      .toString()
      .split("\n")
      .filter(Boolean)
      .forEach((l) => processLine(l, false));
  });

  child.stderr?.on("data", (data: Buffer) => {
    data
      .toString()
      .split("\n")
      .filter(Boolean)
      .forEach((l) => processLine(l, true));
  });

  child.on("close", (code) => {
    if (errorTimer) clearTimeout(errorTimer);
    flushError();
    exitCallbacks.forEach((cb) => cb(code));
  });

  return {
    kill: () => child.kill(),
    onLog: (cb) => logCallbacks.push(cb),
    onError: (cb) => errorCallbacks.push(cb),
    onExit: (cb) => exitCallbacks.push(cb),
  };
}

export function readFileContext(
  filePath: string,
  repoPath: string,
  lineNumber?: number,
): string {
  const candidates = [
    filePath,
    path.join(repoPath, filePath),
    path.resolve(repoPath, filePath),
  ];

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const content = readFileSync(p, "utf-8");
      if (!lineNumber) return content.slice(0, 3000);

      // return ±30 lines around the error line
      const lines = content.split("\n");
      const start = Math.max(0, lineNumber - 30);
      const end = Math.min(lines.length, lineNumber + 30);
      return lines
        .slice(start, end)
        .map((l, i) => `${start + i + 1}: ${l}`)
        .join("\n");
    } catch {
      continue;
    }
  }
  return "";
}

export function readPackageJson(repoPath: string): string {
  const p = path.join(repoPath, "package.json");
  if (!existsSync(p)) return "";
  try {
    const pkg = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
    const deps = {
      ...((pkg.dependencies as object) ?? {}),
      ...((pkg.devDependencies as object) ?? {}),
    };
    return Object.keys(deps).slice(0, 30).join(", ");
  } catch {
    return "";
  }
}

export function buildWatchPrompt(
  chunk: ErrorChunk,
  fileContext: string,
  deps: string,
  repoPath: string,
): string {
  return `You are a senior developer assistant watching a dev server. An error just occurred.

Error output:
\`\`\`
${chunk.lines.join("\n").slice(0, 2000)}
\`\`\`

${chunk.contextBefore.length > 0 ? `Log context (lines before error):\n\`\`\`\n${chunk.contextBefore.join("\n")}\n\`\`\`` : ""}

${fileContext ? `File content${chunk.lineNumber ? ` (around line ${chunk.lineNumber})` : ""}:\n\`\`\`\n${fileContext.slice(0, 2500)}\n\`\`\`` : ""}

${deps ? `Project dependencies: ${deps}` : ""}
Repo path: ${repoPath}
${chunk.filePath ? `Error in file: ${chunk.filePath}` : ""}

Respond ONLY with a JSON object (no markdown, no backticks) with this exact shape:
{
  "errorSummary": "one line — what went wrong",
  "simplified": "2-3 sentences in plain language — what this error means and why it usually happens",
  "fix": "specific actionable fix — reference actual file names and line numbers if known",
  "patch": null
}

If you can provide a code fix, replace "patch" with:
{
  "path": "relative/file/path.ts",
  "content": "complete corrected file content",
  "isNew": false
}

Rules:
- Be specific — mention actual files, variables, function names from the error
- Don't be generic ("check if variable is defined") — say WHERE
- patch should only be included when you are confident in the fix
- Keep simplified under 60 words`;
}
