import { readFileSync, statSync } from "fs";
import path from "path";

export type CodeStats = {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>; // ext -> file count
  functions: number;
  classes: number;
  blankLines: number;
  commentLines: number;
  codeLines: number;
};

const LANG_MAP: Record<string, string> = {
  ".ts": "TS",
  ".tsx": "TSX",
  ".js": "JS",
  ".jsx": "JSX",
  ".css": "CSS",
  ".scss": "SCSS",
  ".json": "JSON",
  ".md": "MD",
  ".py": "PY",
  ".go": "GO",
  ".rs": "RS",
  ".java": "Java",
  ".cpp": "C++",
  ".c": "C",
  ".html": "HTML",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".sh": "SH",
  ".env": "ENV",
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  "__pycache__",
  ".cache",
  "vendor",
  ".venv",
  "venv",
]);

function isBinary(filePath: string): boolean {
  const binaryExts = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".svg",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp4",
    ".mp3",
    ".wav",
    ".zip",
    ".tar",
    ".gz",
    ".pdf",
    ".lock",
  ]);
  return binaryExts.has(path.extname(filePath).toLowerCase());
}

function countFunctionsAndClasses(
  content: string,
  ext: string,
): { functions: number; classes: number } {
  let functions = 0;
  let classes = 0;

  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    // functions: function declarations, arrow functions assigned to const, methods
    const fnMatches = content.match(
      /(?:^|\s)(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(|(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{|\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/gm,
    );
    functions = fnMatches?.length ?? 0;

    const classMatches = content.match(/(?:^|\s)class\s+\w+/gm);
    classes = classMatches?.length ?? 0;
  } else if (ext === ".py") {
    const fnMatches = content.match(/^\s*def\s+\w+/gm);
    functions = fnMatches?.length ?? 0;
    const classMatches = content.match(/^\s*class\s+\w+/gm);
    classes = classMatches?.length ?? 0;
  } else if ([".go", ".rs"].includes(ext)) {
    const fnMatches = content.match(/^\s*(?:func|fn)\s+\w+/gm);
    functions = fnMatches?.length ?? 0;
  }

  return { functions, classes };
}

export function computeStats(repoPath: string, files: string[]): CodeStats {
  const stats: CodeStats = {
    totalFiles: 0,
    totalLines: 0,
    languages: {},
    functions: 0,
    classes: 0,
    blankLines: 0,
    commentLines: 0,
    codeLines: 0,
  };

  for (const filePath of files) {
    // Skip files inside ignored dirs
    const parts = filePath.split(/[/\\]/);
    if (parts.some((p) => SKIP_DIRS.has(p))) continue;
    if (isBinary(filePath)) continue;

    const ext = path.extname(filePath).toLowerCase();
    const lang = LANG_MAP[ext];
    if (!lang) continue;

    stats.totalFiles++;
    stats.languages[lang] = (stats.languages[lang] ?? 0) + 1;

    try {
      const content = readFileSync(path.join(repoPath, filePath), "utf-8");
      const lines = content.split("\n");
      stats.totalLines += lines.length;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") {
          stats.blankLines++;
        } else if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("#") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("<!--")
        ) {
          stats.commentLines++;
        } else {
          stats.codeLines++;
        }
      }

      const { functions, classes } = countFunctionsAndClasses(content, ext);
      stats.functions += functions;
      stats.classes += classes;
    } catch {
      // skip unreadable
    }
  }

  return stats;
}

export function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function topLanguages(
  languages: Record<string, number>,
  limit = 5,
): string {
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([lang]) => lang)
    .join(", ");
}
