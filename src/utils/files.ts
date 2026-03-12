import { readFileSync } from "fs";
import path from "path";
import { exec } from "child_process";
import figures from "figures";
import type { FileTree, ImportantFile } from "../types/repo";

export const IMPORTANT_PATTERNS = [
  /^\.gitignore$/,
  /^\.env(\..+)?$/,
  /^\.env\.example$/,
  /^package\.json$/,
  /^tsconfig(\..+)?\.json$/,
  /^jsconfig\.json$/,
  /^vite\.config\.(ts|js)$/,
  /^webpack\.config\.(ts|js)$/,
  /^rollup\.config\.(ts|js)$/,
  /^babel\.config\.(ts|js|json)$/,
  /^\.babelrc$/,
  /^eslint\.config\.(ts|js|json)$/,
  /^\.eslintrc(\..+)?$/,
  /^\.prettierrc(\..+)?$/,
  /^prettier\.config\.(ts|js)$/,
  /^docker-compose(\..+)?\.yml$/,
  /^Dockerfile(\..+)?$/,
  /^README(\..+)?\.md$/,
  /^LICENSE(\..+)?$/,
  /^Makefile$/,
  /^\.github\/workflows\/.+\.yml$/,
];

export function isImportantFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return IMPORTANT_PATTERNS.some(
    (pattern) => pattern.test(fileName) || pattern.test(filePath),
  );
}

export function buildTree(files: string[]): FileTree[] {
  const root: FileTree[] = [];
  for (const file of files) {
    const parts = file.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] ?? "";
      const isFile = i === parts.length - 1;
      const existing = current.find((n) => n.name === part);
      if (existing) {
        if (!isFile && existing.children) current = existing.children;
      } else {
        const node: FileTree = isFile
          ? { name: part }
          : { name: part, children: [] };
        current.push(node);
        if (!isFile && node.children) current = node.children;
      }
    }
  }
  return root;
}

export function fetchFileTree(repoPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    exec("git ls-files", { cwd: repoPath }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim().split("\n").filter(Boolean));
    });
  });
}

export function readImportantFiles(
  repoPath: string,
  files: string[],
): ImportantFile[] {
  if (files.length > 100) return [];
  return files.filter(isImportantFile).flatMap((filePath) => {
    try {
      const content = readFileSync(path.join(repoPath, filePath), "utf-8");
      return [{ path: filePath, content }];
    } catch {
      return [];
    }
  });
}

const FILE_ICON: Record<string, string> = {
  ".gitignore": figures.pointer,
  "package.json": figures.nodejs,
  Dockerfile: figures.square,
  Makefile: figures.play,
  "README.md": figures.info,
  LICENSE: figures.star,
  ".env": figures.warning,
  ".env.example": figures.warning,
};

export function iconForFile(filePath: string): string {
  const name = path.basename(filePath);
  for (const [key, icon] of Object.entries(FILE_ICON)) {
    if (name === key || name.startsWith(key)) return icon;
  }
  if (name.endsWith(".json")) return figures.arrowRight;
  if (name.endsWith(".yml") || name.endsWith(".yaml")) return figures.bullet;
  if (name.startsWith(".")) return figures.dot;
  return figures.pointerSmall;
}
