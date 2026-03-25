import type { Tool, ToolContext } from "@ridit/lens-sdk";
import { TOOL_TAGS } from "@ridit/lens-sdk";
import {
  fetchUrl,
  searchWeb,
  runShell,
  openUrl,
  readFile,
  readFolder,
  grepFiles,
  writeFile,
  deleteFile,
  deleteFolder,
  generatePdf,
  viewImageTool,
  registerGitTools,
  chartDataTool,
  convertImageTool,
} from "../../tools";

const cleanBody = (body: string) => body.trim().replace(/\\/g, "/");

export const fetchTool: Tool<string> = {
  name: "fetch",
  description: "load a URL",
  safe: true,
  tag: TOOL_TAGS.net,
  permissionLabel: "fetch",
  systemPromptEntry: (i) =>
    `### ${i}. fetch — load a URL\n<fetch>https://example.com</fetch>`,
  parseInput: (body) => body.replace(/^<|>$/g, "").trim() || null,
  summariseInput: (url) => url,
  execute: async (url) => {
    try {
      const value = await fetchUrl(url);
      return { kind: "text", value };
    } catch (err) {
      return {
        kind: "error",
        value: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

export const shellTool: Tool<string> = {
  name: "shell",
  description: "run a terminal command",
  safe: false,
  tag: TOOL_TAGS.shell,
  permissionLabel: "run",
  systemPromptEntry: (i) =>
    `### ${i}. shell — run a terminal command\n<shell>node -v</shell>`,
  parseInput: (body) => body || null,
  summariseInput: (cmd) => cmd,
  execute: async (cmd, ctx) => {
    const value = await runShell(cmd, ctx.repoPath);
    return { kind: "text", value };
  },
};

export const readFileTool: Tool<string> = {
  name: "read-file",
  description: "read a file from the repo",
  safe: true,
  tag: TOOL_TAGS.read,
  permissionLabel: "read",
  systemPromptEntry: (i) =>
    `### ${i}. read-file — read a file from the repo\n<read-file>src/foo.ts</read-file>`,
  parseInput: (body) => cleanBody(body) || null,
  summariseInput: (p) => p,
  execute: (filePath, ctx) => ({
    kind: "text",
    value: readFile(filePath, ctx.repoPath),
  }),
};

export const readFolderTool: Tool<string> = {
  name: "read-folder",
  description: "list contents of a folder (files + subfolders, one level deep)",
  tag: TOOL_TAGS.read,
  safe: true,
  permissionLabel: "folder",
  systemPromptEntry: (i) =>
    `### ${i}. read-folder — list contents of a folder (files + subfolders, one level deep)\n<read-folder>src/components</read-folder>`,
  parseInput: (body) => cleanBody(body) || null,
  summariseInput: (p) => p,
  execute: (folderPath, ctx) => ({
    kind: "text",
    value: readFolder(folderPath, ctx.repoPath),
  }),
};

interface GrepInput {
  pattern: string;
  glob: string;
}

export const grepTool: Tool<GrepInput> = {
  name: "grep",
  description: "search for a pattern across files in the repo",
  tag: TOOL_TAGS.find,
  safe: true,
  permissionLabel: "grep",
  systemPromptEntry: (i) =>
    `### ${i}. grep — search for a pattern across files in the repo (cross-platform, no shell needed)\n<grep>\n{"pattern": "ChatRunner", "glob": "src/**/*.tsx"}\n</grep>`,
  parseInput: (body) => {
    try {
      const parsed = JSON.parse(cleanBody(body)) as {
        pattern: string;
        glob?: string;
      };
      return { pattern: parsed.pattern, glob: parsed.glob ?? "**/*" };
    } catch {
      return { pattern: body, glob: "**/*" };
    }
  },
  summariseInput: ({ pattern, glob }) => `${pattern} — ${glob}`,
  execute: ({ pattern, glob }, ctx) => ({
    kind: "text",
    value: grepFiles(pattern, glob, ctx.repoPath),
  }),
};

interface WriteFileInput {
  path: string;
  content: string;
}

export const writeFileTool: Tool<WriteFileInput> = {
  name: "write-file",
  description: "create or overwrite a file",
  tag: TOOL_TAGS.write,
  safe: false,
  permissionLabel: "write",
  systemPromptEntry: (i) =>
    `### ${i}. write-file — create or overwrite a file\n<write-file>\n{"path": "data/output.csv", "content": "col1,col2\\nval1,val2"}\n</write-file>`,
  parseInput: (body) => {
    const tryParse = (s: string) => {
      try {
        const parsed = JSON.parse(s) as { path: string; content: string };
        if (!parsed.path) return null;
        return { ...parsed, path: parsed.path.replace(/\\/g, "/") };
      } catch {
        return null;
      }
    };

    // first try raw
    const first = tryParse(body);
    if (first) return first;

    // extract path and content manually as fallback
    const pathMatch = body.match(/"path"\s*:\s*"([^"]+)"/);
    const contentMatch = body.match(/"content"\s*:\s*"([\s\S]*)"\s*}?\s*$/);
    if (pathMatch && contentMatch) {
      return {
        path: pathMatch[1]!.replace(/\\/g, "/"),
        content: contentMatch[1]!.replace(/\\n/g, "\n").replace(/\\t/g, "\t"),
      };
    }

    return null;
  },
  summariseInput: ({ path, content }) => `${path} (${content.length} bytes)`,
  execute: ({ path: filePath, content }, ctx) => ({
    kind: "text",
    value: writeFile(filePath, content, ctx.repoPath),
  }),
};

export const deleteFileTool: Tool<string> = {
  name: "delete-file",
  description: "permanently delete a single file",
  tag: TOOL_TAGS.delete,
  safe: false,
  permissionLabel: "delete",
  systemPromptEntry: (i) =>
    `### ${i}. delete-file — permanently delete a single file\n<delete-file>src/old-component.tsx</delete-file>`,
  parseInput: (body) => cleanBody(body) || null,
  summariseInput: (p) => p,
  execute: (filePath, ctx) => ({
    kind: "text",
    value: deleteFile(filePath, ctx.repoPath),
  }),
};

export const deleteFolderTool: Tool<string> = {
  name: "delete-folder",
  description: "permanently delete a folder and all its contents",
  tag: TOOL_TAGS.delete,
  safe: false,
  permissionLabel: "delete folder",
  systemPromptEntry: (i) =>
    `### ${i}. delete-folder — permanently delete a folder and all its contents\n<delete-folder>src/legacy</delete-folder>`,
  parseInput: (body) => cleanBody(body) || null,
  summariseInput: (p) => p,
  execute: (folderPath, ctx) => ({
    kind: "text",
    value: deleteFolder(folderPath, ctx.repoPath),
  }),
};

export const openUrlTool: Tool<string> = {
  name: "open-url",
  description: "open a URL in the user's default browser",
  tag: TOOL_TAGS.net,
  safe: true,
  permissionLabel: "open",
  systemPromptEntry: (i) =>
    `### ${i}. open-url — open a URL in the user's default browser\n<open-url>https://github.com/owner/repo</open-url>`,
  parseInput: (body) => body.replace(/^<|>$/g, "").trim() || null,
  summariseInput: (url) => url,
  execute: (url) => ({ kind: "text", value: openUrl(url) }),
};

interface GeneratePdfInput {
  filePath: string;
  content: string;
}

export const generatePdfTool: Tool<GeneratePdfInput> = {
  name: "generate-pdf",
  description: "generate a PDF file from markdown-style content",
  tag: TOOL_TAGS.write,
  safe: false,
  permissionLabel: "pdf",
  systemPromptEntry: (i) =>
    `### ${i}. generate-pdf — generate a PDF file from markdown-style content\n<generate-pdf>\n{"path": "output/report.pdf", "content": "# Title\\n\\nSome body text."}\n</generate-pdf>`,
  parseInput: (body) => {
    try {
      const parsed = JSON.parse(cleanBody(body)) as {
        path?: string;
        filePath?: string;
        content?: string;
      };
      return {
        filePath: parsed.path ?? parsed.filePath ?? "output.pdf",
        content: parsed.content ?? "",
      };
    } catch {
      return null;
    }
  },
  summariseInput: ({ filePath }) => filePath,
  execute: async ({ filePath, content }, ctx) => ({
    kind: "text",
    value: await generatePdf(filePath, content, ctx.repoPath),
  }),
};

export const searchTool: Tool<string> = {
  name: "search",
  tag: TOOL_TAGS.net,
  description: "search the internet for anything you are unsure about",
  safe: true,
  permissionLabel: "search",
  systemPromptEntry: (i) =>
    `### ${i}. search — search the internet for anything you are unsure about\n<search>how to use React useEffect cleanup function</search>`,
  parseInput: (body) => body || null,
  summariseInput: (q) => `"${q}"`,
  execute: async (query) => {
    try {
      const value = await searchWeb(query);
      return { kind: "text", value };
    } catch (err) {
      return {
        kind: "error",
        value: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

export const cloneTool: Tool<string> = {
  name: "clone",
  description: "clone a GitHub repo so you can explore and discuss it",
  tag: TOOL_TAGS.write,
  safe: false,
  permissionLabel: "clone",
  systemPromptEntry: (i) =>
    `### ${i}. clone — clone a GitHub repo so you can explore and discuss it\n<clone>https://github.com/owner/repo</clone>`,
  parseInput: (body) => body.replace(/^<|>$/g, "").trim() || null,
  summariseInput: (url) => url,
  execute: (repoUrl) => ({
    kind: "text",
    value: `Clone of ${repoUrl} was handled by the UI.`,
  }),
};

export interface ChangesInput {
  summary: string;
  patches: { path: string; content: string; isNew: boolean }[];
}

export const changesTool: Tool<ChangesInput> = {
  name: "changes",
  description: "propose code edits (shown as a diff for user approval)",
  tag: TOOL_TAGS.write,
  safe: false,
  permissionLabel: "changes",
  systemPromptEntry: (i) =>
    `### ${i}. changes — propose code edits (shown as a diff for user approval)\n<changes>\n{"summary": "what changed and why", "patches": [{"path": "src/foo.ts", "content": "COMPLETE file content", "isNew": false}]}\n</changes>`,
  parseInput: (body) => {
    try {
      return JSON.parse(cleanBody(body)) as ChangesInput;
    } catch {
      return null;
    }
  },
  summariseInput: ({ summary }) => summary,
  execute: ({ summary }) => ({
    kind: "text",
    value: `Changes proposed: ${summary}`,
  }),
};

interface ReadFilesInput {
  paths: string[];
}

export const readFilesTool: Tool<ReadFilesInput> = {
  name: "read-files",
  description: "read multiple files from the repo at once",
  tag: TOOL_TAGS.read,
  safe: true,
  permissionLabel: "read",
  systemPromptEntry: (i) =>
    `### ${i}. read-files — read multiple files from the repo at once\n<read-files>\n["src/foo.ts", "src/bar.ts"]\n</read-files>`,
  parseInput: (body) => {
    try {
      const parsed = JSON.parse(cleanBody(body)) as string[];
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      return { paths: parsed };
    } catch {
      return null;
    }
  },
  summariseInput: ({ paths }) => paths.join(", "),
  execute: ({ paths }, ctx) => ({
    kind: "text",
    value: paths
      .map((p) => `=== ${p} ===\n${readFile(p, ctx.repoPath)}`)
      .join("\n\n"),
  }),
};

import { registry } from "./registry";

export function registerBuiltins(): void {
  registry.register(fetchTool);
  registry.register(shellTool);
  registry.register(readFileTool);
  registry.register(readFolderTool);
  registry.register(grepTool);
  registry.register(writeFileTool);
  registry.register(deleteFileTool);
  registry.register(deleteFolderTool);
  registry.register(openUrlTool);
  registry.register(generatePdfTool);
  registry.register(searchTool);
  registry.register(cloneTool);
  registry.register(changesTool);
  registry.register(viewImageTool);
  registry.register(chartDataTool);
  registry.register(convertImageTool);
  registry.register(readFilesTool);
  registerGitTools();
}
