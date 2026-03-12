import path from "path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import type { FilePatch } from "../components/repo/DiffViewer";

// ── Walk ──────────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
]);

export function walkDir(
  dir: string,
  base = dir,
  results: string[] = [],
): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { encoding: "utf-8" });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (results.length >= 100) return results;
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const rel = path.relative(base, full).replace(/\\/g, "/");
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) walkDir(full, base, results);
    else results.push(rel);
  }
  return results;
}

export function applyPatches(repoPath: string, patches: FilePatch[]): void {
  for (const patch of patches) {
    const fullPath = path.join(repoPath, patch.path);
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, patch.content, "utf-8");
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function readFile(filePath: string, repoPath: string): string {
  const candidates = path.isAbsolute(filePath)
    ? [filePath]
    : [filePath, path.join(repoPath, filePath)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const content = readFileSync(candidate, "utf-8");
        const lines = content.split("\n").length;
        return `File: ${candidate} (${lines} lines)\n\n${content.slice(0, 8000)}${
          content.length > 8000 ? "\n\n… (truncated)" : ""
        }`;
      } catch (err) {
        return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }
  return `File not found: ${filePath}. If reading from a cloned repo, use the full absolute path e.g. C:\\Users\\...\\repo\\file.ts`;
}

export function readFolder(folderPath: string, repoPath: string): string {
  const sanitized = folderPath
    .replace(/^(ls|dir|find|tree|cat|read|ls -la?|ls -al?)\s+/i, "")
    .trim();

  const candidates = path.isAbsolute(sanitized)
    ? [sanitized]
    : [sanitized, path.join(repoPath, sanitized)];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(candidate);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) {
      return `Not a directory: ${candidate}. Use read-file to read a file.`;
    }

    let entries: string[];
    try {
      entries = readdirSync(candidate, { encoding: "utf-8" });
    } catch (err) {
      return `Error reading folder: ${err instanceof Error ? err.message : String(err)}`;
    }

    const files: string[] = [];
    const subfolders: string[] = [];

    for (const entry of entries) {
      if (entry.startsWith(".") && entry !== ".env") continue;
      const full = path.join(candidate, entry);
      try {
        if (statSync(full).isDirectory()) subfolders.push(`${entry}/`);
        else files.push(entry);
      } catch {
        // skip
      }
    }

    const total = files.length + subfolders.length;
    const lines: string[] = [`Folder: ${candidate} (${total} entries)`, ""];
    if (files.length > 0) {
      lines.push("Files:");
      files.forEach((f) => lines.push(`  ${f}`));
    }
    if (subfolders.length > 0) {
      if (files.length > 0) lines.push("");
      lines.push("Subfolders:");
      subfolders.forEach((d) => lines.push(`  ${d}`));
    }
    if (total === 0) lines.push("(empty folder)");
    return lines.join("\n");
  }

  return `Folder not found: ${sanitized}`;
}

export function grepFiles(
  pattern: string,
  glob: string,
  repoPath: string,
): string {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  const globToFilter = (g: string): ((rel: string) => boolean) => {
    const cleaned = g.replace(/^\*\*\//, "");
    const parts = cleaned.split("/");
    const ext = parts[parts.length - 1];
    const prefix = parts.slice(0, -1).join("/");
    return (rel: string) => {
      if (ext?.startsWith("*.")) {
        if (!rel.endsWith(ext.slice(1))) return false;
      } else if (ext && !ext.includes("*")) {
        if (!rel.endsWith(ext)) return false;
      }
      if (prefix && !prefix.includes("*")) {
        if (!rel.startsWith(prefix)) return false;
      }
      return true;
    };
  };

  const filter = globToFilter(glob);
  const allFiles = walkDir(repoPath);
  const matchedFiles = allFiles.filter(filter);
  if (matchedFiles.length === 0) return `No files matched glob: ${glob}`;

  const results: string[] = [];
  let totalMatches = 0;

  for (const relPath of matchedFiles) {
    const fullPath = path.join(repoPath, relPath);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }
    const fileLines = content.split("\n");
    const fileMatches: string[] = [];
    fileLines.forEach((line, i) => {
      if (regex.test(line)) {
        fileMatches.push(`  ${i + 1}: ${line.trimEnd()}`);
        totalMatches++;
      }
    });
    if (fileMatches.length > 0)
      results.push(`${relPath}\n${fileMatches.join("\n")}`);
    if (totalMatches >= 200) {
      results.push("(truncated — too many matches)");
      break;
    }
  }

  if (results.length === 0)
    return `No matches for /${pattern}/ in ${matchedFiles.length} file(s) matching ${glob}`;

  return `grep /${pattern}/ ${glob} — ${totalMatches} match(es) in ${results.length} file(s)\n\n${results.join("\n\n")}`;
}

// ── Write / Delete ────────────────────────────────────────────────────────────

export function writeFile(
  filePath: string,
  content: string,
  repoPath: string,
): string {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(repoPath, filePath);
  try {
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
    const lines = content.split("\n").length;
    return `Written: ${fullPath} (${lines} lines, ${content.length} bytes)`;
  } catch (err) {
    return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function deleteFile(filePath: string, repoPath: string): string {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(repoPath, filePath);
  try {
    if (!existsSync(fullPath)) return `File not found: ${fullPath}`;
    const { unlinkSync } = require("fs") as typeof import("fs");
    unlinkSync(fullPath);
    return `Deleted: ${fullPath}`;
  } catch (err) {
    return `Error deleting file: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function deleteFolder(folderPath: string, repoPath: string): string {
  const fullPath = path.isAbsolute(folderPath)
    ? folderPath
    : path.join(repoPath, folderPath);
  try {
    if (!existsSync(fullPath)) return `Folder not found: ${fullPath}`;
    const { rmSync } = require("fs") as typeof import("fs");
    rmSync(fullPath, { recursive: true, force: true });
    return `Deleted folder: ${fullPath}`;
  } catch (err) {
    return `Error deleting folder: ${err instanceof Error ? err.message : String(err)}`;
  }
}
