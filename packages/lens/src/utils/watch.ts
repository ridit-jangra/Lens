import { spawn, type ChildProcess } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";

export type WatchProcess = {
  kill: () => void;
  onLog: (cb: (line: string, isErr: boolean) => void) => void;
  onError: (cb: (chunk: ErrorChunk) => void) => void;
  onExit: (cb: (code: number | null) => void) => void;
  onInputRequest: (cb: (prompt: string) => void) => void;
  sendInput: (text: string) => void;
};

export type ErrorChunk = {
  lines: string[];
  contextBefore: string[];
  filePath?: string;
  lineNumber?: number;
  timestamp: number;
};

const ERROR_PATTERNS = [
  /error:/i,
  /TypeError/,
  /ReferenceError/,
  /SyntaxError/,
  /RangeError/,
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
  /Traceback \(most recent call last\)/,
  /NameError/,
  /AttributeError/,
  /ImportError/,
];

const NOISE_PATTERNS = [/^\s*at\s+/, /^\s*\^+\s*$/, /^\s*$/, /^\s*warn/i];

const INPUT_REQUEST_PATTERNS = [/:\s*$/, /\?\s*$/, /input/i, /press\s+\w/i];

function isErrorLine(line: string): boolean {
  return ERROR_PATTERNS.some((p) => p.test(line));
}

function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(line));
}

function isInputRequest(line: string): boolean {
  const stripped = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
  if (!stripped) return false;
  return INPUT_REQUEST_PATTERNS.some((p) => p.test(stripped));
}

function extractFilePath(lines: string[]): {
  filePath?: string;
  lineNumber?: number;
} {
  for (const line of lines) {
    const m = line.match(
      /([./][\w./\\-]+\.(tsx?|jsx?|mjs|cjs|ts|js|py)):(\d+)/,
    );
    if (m) return { filePath: m[1], lineNumber: parseInt(m[3]!, 10) };

    const pyM = line.match(/File "([^"]+\.py)",\s*line\s*(\d+)/);
    if (pyM) return { filePath: pyM[1], lineNumber: parseInt(pyM[2]!, 10) };
  }
  return {};
}

export function spawnWatch(cmd: string, cwd: string): WatchProcess {
  const [bin, ...args] = cmd.split(/\s+/) as [string, ...string[]];

  const child: ChildProcess = spawn(bin, args, {
    cwd,
    shell: true,
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const logCbs: ((line: string, isErr: boolean) => void)[] = [];
  const errorCbs: ((chunk: ErrorChunk) => void)[] = [];
  const exitCbs: ((code: number | null) => void)[] = [];
  const inputCbs: ((prompt: string) => void)[] = [];

  const recentLines: string[] = [];
  let errorBuffer: string[] = [];
  let errorTimer: ReturnType<typeof setTimeout> | null = null;
  const seenErrors = new Set<string>();

  const flushError = () => {
    if (errorBuffer.length === 0) return;
    const key = errorBuffer.slice(0, 3).join("\n").slice(0, 120);
    if (seenErrors.has(key)) { errorBuffer = []; return; }
    seenErrors.add(key);

    const { filePath, lineNumber } = extractFilePath(errorBuffer);
    const chunk: ErrorChunk = {
      lines: errorBuffer.filter((l) => !isNoise(l)).slice(0, 20),
      contextBefore: recentLines.slice(-15),
      filePath,
      lineNumber,
      timestamp: Date.now(),
    };
    errorCbs.forEach((cb) => cb(chunk));
    errorBuffer = [];
  };

  const processLine = (line: string, isErr: boolean) => {
    recentLines.push(line);
    if (recentLines.length > 30) recentLines.shift();
    logCbs.forEach((cb) => cb(line, isErr));

    if (isErrorLine(line)) {
      errorBuffer.push(line);
      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = setTimeout(flushError, 300);
    } else if (errorBuffer.length > 0) {
      errorBuffer.push(line);
      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = setTimeout(flushError, 300);
    } else if (!isErr && isInputRequest(line)) {
      inputCbs.forEach((cb) => cb(line.trim()));
    }
  };

  child.stdout?.on("data", (data: Buffer) =>
    data.toString().split("\n").filter(Boolean).forEach((l) => processLine(l, false)),
  );
  child.stderr?.on("data", (data: Buffer) =>
    data.toString().split("\n").filter(Boolean).forEach((l) => processLine(l, true)),
  );
  child.on("close", (code) => {
    if (errorTimer) clearTimeout(errorTimer);
    flushError();
    exitCbs.forEach((cb) => cb(code));
  });

  return {
    kill: () => child.kill(),
    onLog: (cb) => logCbs.push(cb),
    onError: (cb) => errorCbs.push(cb),
    onExit: (cb) => exitCbs.push(cb),
    onInputRequest: (cb) => inputCbs.push(cb),
    sendInput: (text) => { child.stdin?.write(text + "\n"); },
  };
}

export function readPackageJson(repoPath: string): string {
  const p = path.join(repoPath, "package.json");
  if (!existsSync(p)) return "";
  try {
    const pkg = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
    const deps = { ...((pkg.dependencies as object) ?? {}), ...((pkg.devDependencies as object) ?? {}) };
    return Object.keys(deps).slice(0, 30).join(", ");
  } catch { return ""; }
}
