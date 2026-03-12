import type { ImportantFile } from "../types/repo";
import type { Provider } from "../types/config";
import type { FilePatch } from "../components/repo/DiffViewer";
import type { Message } from "../types/chat";

import path from "path";
import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildSystemPrompt(
  files: ImportantFile[],
  historySummary = "",
): string {
  const fileList = files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``)
    .join("\n\n");

  return `You are an expert software engineer assistant with access to the user's codebase and eleven tools.

## TOOLS

You have exactly eleven tools. To use a tool you MUST wrap it in the exact XML tags shown below — no other format will work.

### 1. fetch — load a URL
<fetch>https://example.com</fetch>

### 2. shell — run a terminal command
<shell>node -v</shell>

### 3. read-file — read a file from the repo
<read-file>src/foo.ts</read-file>

### 4. read-folder — list contents of a folder (files + subfolders, one level deep)
<read-folder>src/components</read-folder>

### 5. grep — search for a pattern across files in the repo (cross-platform, no shell needed)
<grep>
{"pattern": "ChatRunner", "glob": "src/**/*.tsx"}
</grep>

### 6. write-file — create or overwrite a file
<write-file>
{"path": "data/output.csv", "content": "col1,col2\nval1,val2"}
</write-file>

### 7. delete-file — permanently delete a single file
<delete-file>src/old-component.tsx</delete-file>

### 8. delete-folder — permanently delete a folder and all its contents
<delete-folder>src/legacy</delete-folder>

### 9. open-url — open a URL in the user's default browser
<open-url>https://github.com/owner/repo</open-url>

### 10. generate-pdf — generate a PDF file from markdown-style content
<generate-pdf>
{"path": "output/report.pdf", "content": "# Title\n\nSome body text.\n\n## Section\n\nMore content."}
</generate-pdf>

### 11. search — search the internet for anything you are unsure about
<search>how to use React useEffect cleanup function</search>

### 11. clone — clone a GitHub repo so you can explore and discuss it
<clone>https://github.com/owner/repo</clone>

### 12. changes — propose code edits (shown as a diff for user approval)
<changes>
{"summary": "what changed and why", "patches": [{"path": "src/foo.ts", "content": "COMPLETE file content", "isNew": false}]}
</changes>

## RULES

1. When you need to use a tool, output ONLY the XML tag — nothing before or after it in that response
2. ONE tool per response — emit the tag, then stop completely
3. After the user approves and you get the result, continue your analysis in the next response
4. NEVER print a URL, command, filename, or JSON blob as plain text when you should be using a tool
5. NEVER say "I'll fetch" / "run this command" / "here's the write-file" — just emit the tag
6. NEVER use shell to run git clone — always use the clone tag instead
7. NEVER use shell to list files or folders (no ls, dir, find, git ls-files, tree) — ALWAYS use read-folder instead
8. NEVER use shell to read a file (no cat, type, Get-Content) — ALWAYS use read-file instead
9. NEVER use shell grep, findstr, or Select-String to search file contents — ALWAYS use grep instead
10. shell is ONLY for running code, installing packages, building, testing — not for filesystem inspection
11. write-file content field must be the COMPLETE file content, never empty or placeholder
12. After a write-file succeeds, do NOT repeat it — trust the result and move on
13. After a write-file succeeds, use read-file to verify the content before telling the user it is done
14. NEVER apologize and redo a tool call you already made — if write-file or shell ran and returned a result, it worked, do not run it again
15. NEVER say "I made a mistake" and repeat the same tool — one attempt is enough, trust the output
16. NEVER second-guess yourself mid-response — commit to your answer
17. If a read-folder or read-file returns "not found", accept it and move on — do NOT retry the same path
18. If you have already retrieved a result for a path in this conversation, do NOT request it again — use the result you already have
17. Every shell command runs from the repo root — \`cd\` has NO persistent effect. NEVER use \`cd\` alone. Use full paths or combine with && e.g. \`cd list && bun run index.ts\`
18. write-file paths are relative to the repo root — if creating files in a subfolder write the full relative path e.g. \`list/src/index.tsx\` NOT \`src/index.tsx\`
19. When scaffolding a new project in a subfolder, ALL write-file paths must start with that subfolder name e.g. \`list/package.json\`, \`list/src/index.tsx\`
20. For JSX/TSX files always use \`.tsx\` extension and include \`/** @jsxImportSource react */\` or ensure tsconfig has jsx set — bun needs this to parse JSX

## CRITICAL: READ BEFORE YOU WRITE

These rules are mandatory whenever you plan to edit or create a file:

### Before modifying ANY existing file:
1. ALWAYS use read-file on the exact file you plan to change FIRST
2. Study the full current content — understand every import, every export, every type, every existing feature
3. Your changes patch MUST preserve ALL existing functionality — do not remove or rewrite things that were not part of the request
4. If you are unsure what other files import from the file you are editing, use read-folder on the parent directory first to see what exists nearby, then read-file the relevant ones

### Before adding a feature that touches multiple files:
1. Use read-folder on the relevant directory to see what files exist
2. Use read-file on each file you plan to touch
3. Only then emit a changes tag — with patches that are surgical additions, not wholesale rewrites

### The golden rule for write-file and changes:
- The output file must contain EVERYTHING the original had, PLUS your new additions
- NEVER produce a file that is shorter than the original unless you are explicitly asked to delete things
- If you catch yourself rewriting a file from scratch, STOP — go back and read the original first

## WHEN TO USE read-folder:
- Before editing files in an unfamiliar directory — list it first to understand the structure
- When a feature spans multiple files and you are not sure what exists
- When the user asks you to explore or explain a part of the codebase

## SCAFFOLDING A NEW PROJECT (follow this exactly)

When the user asks to create a new CLI/app in a subfolder (e.g. "make a todo app called list"):
1. Create all files first using write-file with paths like \`list/package.json\`, \`list/src/index.tsx\`
2. Then run \`cd list && bun install\` (or npm/pnpm) in one shell command
3. Then run the project with \`cd list && bun run index.ts\` or whatever the entry point is
4. NEVER run \`bun init\` — it is interactive and will hang. Create package.json manually with write-file instead
5. TSX files need either tsconfig.json with \`"jsx": "react-jsx"\` or \`/** @jsxImportSource react */\` at the top

## FETCH → WRITE FLOW (follow this exactly when saving fetched data)

1. fetch the URL
2. Analyze the result — count the rows, identify columns, check completeness
3. Tell the user what you found: "Found X rows with columns: A, B, C. Writing now."
4. emit write-file with correctly structured, complete content
5. After write-file confirms success, emit read-file to verify
6. Only after read-file confirms content is correct, tell the user it is done

## WHEN TO USE TOOLS

- User shares any URL → fetch it immediately
- User asks to run anything → shell it immediately
- User asks to open a link, open a URL, or visit a website → open-url it immediately, do NOT use fetch
- User asks to delete a file → delete-file it immediately (requires approval)
- User asks to delete a folder or directory → delete-folder it immediately (requires approval)
- User asks to search for a pattern in files, find usages, find where something is defined → grep it immediately, NEVER use shell grep/findstr/Select-String
- User asks to read a file → read-file it immediately, NEVER use shell cat/type
- User asks what files are in a folder, or to explore/list a directory → read-folder it immediately, NEVER use shell ls/dir/find/git ls-files
- User asks to explore a folder or directory → read-folder it immediately
- User asks to save/create/write a file → write-file it immediately, then read-file to verify
- User asks to modify/edit/add to an existing file → read-file it FIRST, then emit changes
- User shares a GitHub URL and wants to clone/explore/discuss it → use clone immediately, NEVER use shell git clone
- After clone succeeds, you will see context about the clone in the conversation. Wait for the user to ask a specific question before using any tools. Do NOT auto-read files, do NOT emit any tool tags until the user asks.
- You are unsure about an API, library, error, concept, or piece of code → search it immediately
- User asks about something recent or that you might not know → search it immediately
- You are about to say "I'm not sure" or "I don't know" → search instead of guessing

## shell IS ONLY FOR:
- Running code: \`node script.js\`, \`bun run dev\`, \`python main.py\`
- Installing packages: \`npm install\`, \`pip install\`
- Building/testing: \`npm run build\`, \`bun test\`
- Git operations other than clone: \`git status\`, \`git log\`, \`git diff\`
- Anything that EXECUTES — not reads or lists

## CODEBASE

${fileList.length > 0 ? fileList : "(no files indexed)"}

${historySummary}`;
}

// ── Few-shot examples ─────────────────────────────────────────────────────────

export const FEW_SHOT_MESSAGES: { role: string; content: string }[] = [
  // read-folder examples FIRST — highest priority pattern to establish
  {
    role: "user",
    content: "delete src/old-component.tsx",
  },
  {
    role: "assistant",
    content: "<delete-file>src/old-component.tsx</delete-file>",
  },
  {
    role: "user",
    content:
      "Here is the output from delete-file of src/old-component.tsx:\n\nDeleted: /repo/src/old-component.tsx\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "Done — `src/old-component.tsx` has been deleted.",
  },
  {
    role: "user",
    content: "delete the legacy folder",
  },
  {
    role: "assistant",
    content: "<delete-folder>src/legacy</delete-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from delete-folder of src/legacy:\n\nDeleted folder: /repo/src/legacy\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "Done — the `src/legacy` folder and all its contents have been deleted.",
  },
  {
    role: "user",
    content: "open https://github.com/microsoft/typescript",
  },
  {
    role: "assistant",
    content: "<open-url>https://github.com/microsoft/typescript</open-url>",
  },
  {
    role: "user",
    content:
      "Here is the output from open-url https://github.com/microsoft/typescript:\n\nOpened: https://github.com/microsoft/typescript\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "Opened the TypeScript GitHub page in your browser.",
  },
  {
    role: "user",
    content:
      "generate a PDF report about the project and save it to docs/report.pdf",
  },
  {
    role: "assistant",
    content:
      '<generate-pdf>\n{"path": "docs/report.pdf", "content": "# Project Report\\n\\n## Overview\\n\\nThis document summarizes the project.\\n\\n## Details\\n\\nMore content here."}\n</generate-pdf>',
  },
  {
    role: "user",
    content:
      "Here is the output from generate-pdf to docs/report.pdf:\n\nPDF generated: /repo/docs/report.pdf\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "Done — the PDF report has been saved to `docs/report.pdf`.",
  },
  {
    role: "user",
    content: 'grep -R "ChatRunner" -n src',
  },
  {
    role: "assistant",
    content: '<grep>\n{"pattern": "ChatRunner", "glob": "src/**/*"}\n</grep>',
  },
  {
    role: "user",
    content:
      'Here is the output from grep for "ChatRunner":\n\ngrep /ChatRunner/ src/**/* — 3 match(es) in 2 file(s)\n\nsrc/index.tsx\n  12: import { ChatRunner } from "./components/chat/ChatRunner";\n\nsrc/components/chat/ChatRunner.tsx\n  1: export const ChatRunner = ...\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content:
      "`ChatRunner` is defined in `src/components/chat/ChatRunner.tsx` and imported in `src/index.tsx`.",
  },
  {
    role: "user",
    content: "find all usages of useInput in the codebase",
  },
  {
    role: "assistant",
    content: '<grep>\n{"pattern": "useInput", "glob": "src/**/*.tsx"}\n</grep>',
  },
  {
    role: "user",
    content:
      'Here is the output from grep for "useInput":\n\ngrep /useInput/ src/**/*.tsx — 2 match(es) in 1 file(s)\n\nsrc/components/chat/ChatRunner.tsx\n  5: import { useInput } from "ink";\n  210: useInput((input, key) => {\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content:
      "`useInput` is used in `src/components/chat/ChatRunner.tsx` — imported on line 5 and called on line 210.",
  },
  {
    role: "user",
    content: "read src folder",
  },
  {
    role: "assistant",
    content: "<read-folder>src</read-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-folder of src:\n\nFolder: src (4 entries)\n\nFiles:\n  index.ts\n  App.tsx\n\nSubfolders:\n  components/\n  utils/\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "The `src` folder contains `index.ts`, `App.tsx`, plus subfolders `components/` and `utils/`.",
  },
  {
    role: "user",
    content: "list src folder",
  },
  {
    role: "assistant",
    content: "<read-folder>src</read-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-folder of src:\n\nFolder: src (4 entries)\n\nFiles:\n  index.ts\n  App.tsx\n\nSubfolders:\n  components/\n  utils/\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "The `src` folder contains `index.ts`, `App.tsx`, plus subfolders `components/` and `utils/`.",
  },
  {
    role: "user",
    content: "what files are in src/components?",
  },
  {
    role: "assistant",
    content: "<read-folder>src/components</read-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-folder of src/components:\n\nFolder: src/components (5 entries)\n\nFiles:\n  Header.tsx\n  Footer.tsx\n  Button.tsx\n\nSubfolders:\n  ui/\n  forms/\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "The `src/components` folder has 3 files — `Header.tsx`, `Footer.tsx`, `Button.tsx` — plus two subfolders: `ui/` and `forms/`.",
  },
  {
    role: "user",
    content: "list the files in src/utils",
  },
  {
    role: "assistant",
    content: "<read-folder>src/utils</read-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-folder of src/utils:\n\nFolder: src/utils (3 entries)\n\nFiles:\n  api.ts\n  helpers.ts\n  format.ts\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "The `src/utils` folder contains 3 files: `api.ts`, `helpers.ts`, and `format.ts`.",
  },
  {
    role: "user",
    content: "show me what's in the src directory",
  },
  {
    role: "assistant",
    content: "<read-folder>src</read-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-folder of src:\n\nFolder: src (4 entries)\n\nFiles:\n  index.ts\n  App.tsx\n\nSubfolders:\n  components/\n  utils/\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "The `src` directory has 2 files (`index.ts`, `App.tsx`) and 2 subfolders (`components/`, `utils/`).",
  },
  {
    role: "user",
    content: "show me the project structure",
  },
  {
    role: "assistant",
    content: "<read-folder>.</read-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-folder of .:\n\nFolder: . (5 entries)\n\nFiles:\n  package.json\n  tsconfig.json\n  README.md\n\nSubfolders:\n  src/\n  node_modules/\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "The project root has 3 files (`package.json`, `tsconfig.json`, `README.md`) and the `src/` folder for source code.",
  },
  {
    role: "user",
    content: "what does the project look like?",
  },
  {
    role: "assistant",
    content: "<read-folder>.</read-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-folder of .:\n\nFolder: . (4 entries)\n\nFiles:\n  package.json\n  README.md\n\nSubfolders:\n  src/\n  dist/\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "The repo root contains `package.json` and `README.md`, with source code in `src/` and compiled output in `dist/`.",
  },
  {
    role: "user",
    content: "fetch https://api.github.com/repos/microsoft/typescript",
  },
  {
    role: "assistant",
    content: "<fetch>https://api.github.com/repos/microsoft/typescript</fetch>",
  },
  {
    role: "user",
    content:
      'Here is the output from fetch of https://api.github.com/repos/microsoft/typescript:\n\n{"name":"TypeScript","stargazers_count":100000}\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content:
      "Found 1 object with fields: name, stargazers_count. Writing to ts-info.json now.",
  },
  {
    role: "user",
    content: "ok go ahead",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "ts-info.json", "content": "{\"name\":\"TypeScript\",\"stars\":100000}"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to ts-info.json:\n\nWritten: /repo/ts-info.json (1 lines, 44 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "<read-file>ts-info.json</read-file>",
  },
  {
    role: "user",
    content:
      'Here is the output from read-file of ts-info.json:\n\nFile: ts-info.json (1 lines)\n\n{"name":"TypeScript","stars":100000}\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content: "Done — saved and verified `ts-info.json`. Data looks correct.",
  },
  {
    role: "user",
    content: "add a logout button to src/components/Header.tsx",
  },
  {
    role: "assistant",
    content: "<read-file>src/components/Header.tsx</read-file>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-file of src/components/Header.tsx:\n\nFile: src/components/Header.tsx (42 lines)\n\nimport React from 'react';\n// ... full file content ...\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      '<changes>\n{"summary": "Add logout button to Header — preserves all existing nav items and imports", "patches": [{"path": "src/components/Header.tsx", "content": "// complete file with logout button added", "isNew": false}]}\n</changes>',
  },
  {
    role: "user",
    content: "what node version am I on",
  },
  {
    role: "assistant",
    content: "<shell>node -v</shell>",
  },
  {
    role: "user",
    content:
      "Here is the output from shell command `node -v`:\n\nv20.11.0\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "You're running Node.js v20.11.0.",
  },
  {
    role: "user",
    content: "clone https://github.com/facebook/react",
  },
  {
    role: "assistant",
    content: "<clone>https://github.com/facebook/react</clone>",
  },
  {
    role: "user",
    content:
      "Cloned react to /tmp/react — 2847 files available. You can now read files from this repo using read-file with paths relative to /tmp/react.",
  },
  {
    role: "assistant",
    content:
      "Cloned! The React repo has 2847 files. I can read source files, explain how it works, or suggest improvements — just ask.",
  },
  {
    role: "user",
    content: "what does the ?? operator do in typescript",
  },
  {
    role: "assistant",
    content: "<search>nullish coalescing operator ?? TypeScript</search>",
  },
  {
    role: "user",
    content:
      'Here is the output from web search for "nullish coalescing operator ?? TypeScript":\n\nAnswer: The ?? operator returns the right-hand side when the left-hand side is null or undefined.\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content:
      "The `??` operator is the nullish coalescing operator. It returns the right side only when the left side is `null` or `undefined`.",
  },
];

// ── Response parser ───────────────────────────────────────────────────────────

export type ParsedResponse =
  | { kind: "text"; content: string }
  | { kind: "changes"; content: string; patches: FilePatch[] }
  | { kind: "shell"; content: string; command: string }
  | { kind: "fetch"; content: string; url: string }
  | { kind: "read-file"; content: string; filePath: string }
  | { kind: "read-folder"; content: string; folderPath: string }
  | { kind: "grep"; content: string; pattern: string; glob: string }
  | { kind: "delete-file"; content: string; filePath: string }
  | { kind: "delete-folder"; content: string; folderPath: string }
  | { kind: "open-url"; content: string; url: string }
  | {
      kind: "generate-pdf";
      content: string;
      filePath: string;
      pdfContent: string;
    }
  | {
      kind: "write-file";
      content: string;
      filePath: string;
      fileContent: string;
    }
  | { kind: "search"; content: string; query: string }
  | { kind: "clone"; content: string; repoUrl: string };

export function parseResponse(text: string): ParsedResponse {
  type Candidate = {
    index: number;
    kind:
      | "changes"
      | "shell"
      | "fetch"
      | "read-file"
      | "read-folder"
      | "grep"
      | "delete-file"
      | "delete-folder"
      | "open-url"
      | "generate-pdf"
      | "write-file"
      | "search"
      | "clone";
    match: RegExpExecArray;
  };
  const candidates: Candidate[] = [];

  const patterns: { kind: Candidate["kind"]; re: RegExp }[] = [
    { kind: "fetch", re: /<fetch>([\s\S]*?)<\/fetch>/g },
    { kind: "shell", re: /<shell>([\s\S]*?)<\/shell>/g },
    { kind: "read-file", re: /<read-file>([\s\S]*?)<\/read-file>/g },
    { kind: "read-folder", re: /<read-folder>([\s\S]*?)<\/read-folder>/g },
    { kind: "grep", re: /<grep>([\s\S]*?)<\/grep>/g },
    { kind: "delete-file", re: /<delete-file>([\s\S]*?)<\/delete-file>/g },
    {
      kind: "delete-folder",
      re: /<delete-folder>([\s\S]*?)<\/delete-folder>/g,
    },
    { kind: "open-url", re: /<open-url>([\s\S]*?)<\/open-url>/g },
    { kind: "generate-pdf", re: /<generate-pdf>([\s\S]*?)<\/generate-pdf>/g },
    { kind: "write-file", re: /<write-file>([\s\S]*?)<\/write-file>/g },
    { kind: "search", re: /<search>([\s\S]*?)<\/search>/g },
    { kind: "clone", re: /<clone>([\s\S]*?)<\/clone>/g },
    { kind: "changes", re: /<changes>([\s\S]*?)<\/changes>/g },
    { kind: "fetch", re: /```fetch\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "shell", re: /```shell\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "read-file", re: /```read-file\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "read-folder", re: /```read-folder\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "write-file", re: /```write-file\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "search", re: /```search\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "changes", re: /```changes\r?\n([\s\S]*?)\r?\n```/g },
  ];

  for (const { kind, re } of patterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) candidates.push({ index: m.index, kind, match: m });
  }

  if (candidates.length === 0) return { kind: "text", content: text.trim() };

  candidates.sort((a, b) => a.index - b.index);
  const { kind, match } = candidates[0]!;
  // Strip any leaked tool tags from preamble (e.g. model emits tag twice or mid-sentence)
  const before = text
    .slice(0, match.index)
    .replace(
      /<(fetch|shell|read-file|read-folder|write-file|search|clone|changes)[^>]*>[\s\S]*?<\/\1>/g,
      "",
    )
    .trim();
  const body = match[1]!.trim();

  if (kind === "changes") {
    try {
      const parsed = JSON.parse(body) as {
        summary: string;
        patches: FilePatch[];
      };
      const display = [before, parsed.summary].filter(Boolean).join("\n\n");
      return { kind: "changes", content: display, patches: parsed.patches };
    } catch {
      // fall through
    }
  }

  if (kind === "shell")
    return { kind: "shell", content: before, command: body };

  if (kind === "fetch") {
    const url = body.replace(/^<|>$/g, "").trim();
    return { kind: "fetch", content: before, url };
  }

  if (kind === "read-file")
    return { kind: "read-file", content: before, filePath: body };

  if (kind === "read-folder")
    return { kind: "read-folder", content: before, folderPath: body };

  if (kind === "delete-file")
    return { kind: "delete-file", content: before, filePath: body };

  if (kind === "delete-folder")
    return { kind: "delete-folder", content: before, folderPath: body };

  if (kind === "open-url") {
    const url = body.replace(/^<|>$/g, "").trim();
    return { kind: "open-url", content: before, url };
  }

  if (kind === "generate-pdf") {
    try {
      const parsed = JSON.parse(body);
      return {
        kind: "generate-pdf",
        content: before,
        filePath: parsed.path ?? parsed.filePath ?? "output.pdf",
        pdfContent: parsed.content ?? "",
      };
    } catch {
      return { kind: "text", content: text };
    }
  }

  if (kind === "grep") {
    try {
      const parsed = JSON.parse(body) as { pattern: string; glob?: string };
      return {
        kind: "grep",
        content: before,
        pattern: parsed.pattern,
        glob: parsed.glob ?? "**/*",
      };
    } catch {
      // treat body as plain pattern with no glob
      return { kind: "grep", content: before, pattern: body, glob: "**/*" };
    }
  }

  if (kind === "write-file") {
    try {
      const parsed = JSON.parse(body) as { path: string; content: string };
      return {
        kind: "write-file",
        content: before,
        filePath: parsed.path,
        fileContent: parsed.content,
      };
    } catch {
      // fall through
    }
  }

  if (kind === "search")
    return { kind: "search", content: before, query: body };

  if (kind === "clone") {
    const url = body.replace(/^<|>$/g, "").trim();
    return { kind: "clone", content: before, repoUrl: url };
  }

  return { kind: "text", content: text.trim() };
}

// ── Clone tag helper ──────────────────────────────────────────────────────────

export function parseCloneTag(text: string): string | null {
  const m = text.match(/<clone>([\s\S]*?)<\/clone>/);
  return m ? m[1]!.trim() : null;
}

// ── GitHub URL detection ──────────────────────────────────────────────────────

export function extractGithubUrl(text: string): string | null {
  const match = text.match(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/);
  return match ? match[0]! : null;
}

export function toCloneUrl(url: string): string {
  const clean = url.replace(/\/+$/, "");
  return clean.endsWith(".git") ? clean : `${clean}.git`;
}

// ── API call ──────────────────────────────────────────────────────────────────

function buildApiMessages(
  messages: Message[],
): { role: string; content: string }[] {
  return messages.map((m) => {
    if (m.type === "tool") {
      if (!m.approved) {
        return {
          role: "user",
          content:
            "The tool call was denied by the user. Please respond without using that tool.",
        };
      }
      const label =
        m.toolName === "shell"
          ? `shell command \`${m.content}\``
          : m.toolName === "fetch"
            ? `fetch of ${m.content}`
            : m.toolName === "read-file"
              ? `read-file of ${m.content}`
              : m.toolName === "read-folder"
                ? `read-folder of ${m.content}`
                : m.toolName === "grep"
                  ? `grep for "${m.content}"`
                  : m.toolName === "delete-file"
                    ? `delete-file of ${m.content}`
                    : m.toolName === "delete-folder"
                      ? `delete-folder of ${m.content}`
                      : m.toolName === "open-url"
                        ? `open-url ${m.content}`
                        : m.toolName === "generate-pdf"
                          ? `generate-pdf to ${m.content}`
                          : m.toolName === "search"
                            ? `web search for "${m.content}"`
                            : `write-file to ${m.content}`;
      return {
        role: "user",
        content: `Here is the output from the ${label}:\n\n${m.result}\n\nPlease continue your response based on this output.`,
      };
    }
    return { role: m.role, content: m.content };
  });
}

export async function callChat(
  provider: Provider,
  systemPrompt: string,
  messages: Message[],
): Promise<string> {
  const apiMessages = [...FEW_SHOT_MESSAGES, ...buildApiMessages(messages)];

  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (provider.type === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    };
    body = {
      model: provider.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: apiMessages,
    };
  } else {
    const base = provider.baseUrl ?? "https://api.openai.com/v1";
    url = `${base}/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    };
    body = {
      model: provider.model,
      max_tokens: 4096,
      messages: [{ role: "system", content: systemPrompt }, ...apiMessages],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as Record<string, unknown>;

  if (provider.type === "anthropic") {
    const content = data.content as { type: string; text: string }[];
    return content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  } else {
    const choices = data.choices as { message: { content: string } }[];
    return choices[0]?.message.content ?? "";
  }
}

// ── Clipboard read ────────────────────────────────────────────────────────────

export function readClipboard(): string {
  try {
    const platform = process.platform;
    if (platform === "win32") {
      return execSync("powershell -noprofile -command Get-Clipboard", {
        encoding: "utf-8",
        timeout: 2000,
      })
        .replace(/\r\n/g, "\n")
        .trimEnd();
    }
    if (platform === "darwin") {
      return execSync("pbpaste", {
        encoding: "utf-8",
        timeout: 2000,
      }).trimEnd();
    }
    for (const cmd of [
      "xclip -selection clipboard -o",
      "xsel --clipboard --output",
      "wl-paste",
    ]) {
      try {
        return execSync(cmd, { encoding: "utf-8", timeout: 2000 }).trimEnd();
      } catch {
        continue;
      }
    }
    return "";
  } catch {
    return "";
  }
}

// ── File system ───────────────────────────────────────────────────────────────

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

export function walkDir(dir: string, base = dir): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir, { encoding: "utf-8" });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const rel = path.relative(base, full).replace(/\\/g, "/");
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) results.push(...walkDir(full, base));
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

// ── Tool execution ────────────────────────────────────────────────────────────

export async function runShell(command: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const { spawn } =
      require("child_process") as typeof import("child_process");
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const shellFlag = isWin ? "/c" : "-c";

    const proc = spawn(shell, [shellFlag, command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));

    const killTimer = setTimeout(
      () => {
        proc.kill();
        resolve("(command timed out after 5 minutes)");
      },
      5 * 60 * 1000,
    );

    proc.on("close", (code: number | null) => {
      clearTimeout(killTimer);
      const stdout = Buffer.concat(chunks).toString("utf-8").trim();
      const stderr = Buffer.concat(errChunks).toString("utf-8").trim();
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      resolve(combined || (code === 0 ? "(no output)" : `exit code ${code}`));
    });

    proc.on("error", (err: Error) => {
      clearTimeout(killTimer);
      resolve(`Error: ${err.message}`);
    });
  });
}

// ── HTML table / list extractor ───────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTables(html: string): string {
  const tables: string[] = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tMatch: RegExpExecArray | null;

  while ((tMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tMatch[0]!;
    const rows: string[][] = [];

    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    let rMatch: RegExpExecArray | null;
    while ((rMatch = rowRe.exec(tableHtml)) !== null) {
      const cells: string[] = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = cellRe.exec(rMatch[0]!)) !== null) {
        cells.push(stripTags(cMatch[1] ?? ""));
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length < 2) continue;

    const cols = Math.max(...rows.map((r) => r.length));
    const padded = rows.map((r) => {
      while (r.length < cols) r.push("");
      return r;
    });
    const widths = Array.from({ length: cols }, (_, ci) =>
      Math.max(...padded.map((r) => (r[ci] ?? "").length), 3),
    );
    const fmt = (r: string[]) =>
      r.map((c, ci) => c.padEnd(widths[ci] ?? 0)).join(" | ");
    const header = fmt(padded[0]!);
    const sep = widths.map((w) => "-".repeat(w)).join("-|-");
    const body = padded.slice(1).map(fmt).join("\n");
    tables.push(`${header}\n${sep}\n${body}`);
  }

  return tables.length > 0
    ? `=== TABLES (${tables.length}) ===\n\n${tables.join("\n\n---\n\n")}`
    : "";
}

function extractLists(html: string): string {
  const lists: string[] = [];
  const listRe = /<[ou]l[\s\S]*?<\/[ou]l>/gi;
  let lMatch: RegExpExecArray | null;
  while ((lMatch = listRe.exec(html)) !== null) {
    const items: string[] = [];
    const itemRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let iMatch: RegExpExecArray | null;
    while ((iMatch = itemRe.exec(lMatch[0]!)) !== null) {
      const text = stripTags(iMatch[1] ?? "");
      if (text.length > 2) items.push(`• ${text}`);
    }
    if (items.length > 1) lists.push(items.join("\n"));
  }
  return lists.length > 0
    ? `=== LISTS ===\n\n${lists.slice(0, 5).join("\n\n")}`
    : "";
}

export async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await res.json();
    return JSON.stringify(json, null, 2).slice(0, 8000);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]!) : "No title";

  const tables = extractTables(html);
  const lists = extractLists(html);
  const bodyText = stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, ""),
  )
    .replace(/\s{3,}/g, "\n\n")
    .slice(0, 3000);

  const parts = [`PAGE: ${title}`, `URL: ${url}`];
  if (tables) parts.push(tables);
  if (lists) parts.push(lists);
  parts.push(`=== TEXT ===\n${bodyText}`);

  return parts.join("\n\n");
}

// ── Web search ────────────────────────────────────────────────────────────────

export async function searchWeb(query: string): Promise<string> {
  const encoded = encodeURIComponent(query);

  const ddgUrl = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
  try {
    const res = await fetch(ddgUrl, {
      headers: { "User-Agent": "Lens/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: { Text?: string; FirstURL?: string }[];
        Answer?: string;
        Infobox?: { content?: { label: string; value: string }[] };
      };

      const parts: string[] = [`Search: ${query}`];
      if (data.Answer) parts.push(`Answer: ${data.Answer}`);
      if (data.AbstractText) {
        parts.push(`Summary: ${data.AbstractText}`);
        if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
      }
      if (data.Infobox?.content?.length) {
        const fields = data.Infobox.content
          .slice(0, 8)
          .map((f) => `  ${f.label}: ${f.value}`)
          .join("\n");
        parts.push(`Info:\n${fields}`);
      }
      if (data.RelatedTopics?.length) {
        const topics = (data.RelatedTopics as { Text?: string }[])
          .filter((t) => t.Text)
          .slice(0, 5)
          .map((t) => `  - ${t.Text}`)
          .join("\n");
        if (topics) parts.push(`Related:\n${topics}`);
      }

      const result = parts.join("\n\n");
      if (result.length > 60) return result;
    }
  } catch {
    // fall through to HTML scrape
  }

  try {
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;
    const res = await fetch(htmlUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const snippets: string[] = [];
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = snippetRe.exec(html)) !== null && snippets.length < 6) {
      const text = m[1]!
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 20) snippets.push(`- ${text}`);
    }

    const links: string[] = [];
    const linkRe = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    while ((m = linkRe.exec(html)) !== null && links.length < 5) {
      const title = m[2]!.replace(/<[^>]+>/g, "").trim();
      const href = m[1]!;
      if (title && href) links.push(`  ${title} \u2014 ${href}`);
    }

    if (snippets.length === 0 && links.length === 0) {
      return `No results found for: ${query}`;
    }

    const parts = [`Search results for: ${query}`];
    if (snippets.length > 0) parts.push(`Snippets:\n${snippets.join("\n")}`);
    if (links.length > 0) parts.push(`Links:\n${links.join("\n")}`);
    return parts.join("\n\n");
  } catch (err) {
    return `Search failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── File tools ────────────────────────────────────────────────────────────────

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
  // Strip any command prefixes the model may have included (e.g. "ls src" → "src", "read src" → "src")
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
      if (entry.startsWith(".") && entry !== ".env") continue; // skip hidden except .env hint
      const full = path.join(candidate, entry);
      try {
        if (statSync(full).isDirectory()) {
          subfolders.push(`${entry}/`);
        } else {
          files.push(entry);
        }
      } catch {
        // skip unreadable entries
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

    if (total === 0) {
      lines.push("(empty folder)");
    }

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
    // fall back to literal string match if pattern is not valid regex
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  // Convert glob to a simple path prefix/suffix filter
  // Supports patterns like: src/**/*.tsx, **/*.ts, src/utils/*
  const globToFilter = (g: string): ((rel: string) => boolean) => {
    // strip leading **/
    const cleaned = g.replace(/^\*\*\//, "");
    const parts = cleaned.split("/");
    const ext = parts[parts.length - 1];
    const prefix = parts.slice(0, -1).join("/");

    return (rel: string) => {
      // extension match (e.g. *.tsx)
      if (ext?.startsWith("*.")) {
        const extSuffix = ext.slice(1); // e.g. .tsx
        if (!rel.endsWith(extSuffix)) return false;
      } else if (ext && !ext.includes("*")) {
        // exact filename
        if (!rel.endsWith(ext)) return false;
      }
      // prefix match
      if (prefix && !prefix.includes("*")) {
        if (!rel.startsWith(prefix)) return false;
      }
      return true;
    };
  };

  const filter = globToFilter(glob);
  const allFiles = walkDir(repoPath);
  const matchedFiles = allFiles.filter(filter);

  if (matchedFiles.length === 0) {
    return `No files matched glob: ${glob}`;
  }

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

    const lines = content.split("\n");
    const fileMatches: string[] = [];

    lines.forEach((line, i) => {
      if (regex.test(line)) {
        fileMatches.push(`  ${i + 1}: ${line.trimEnd()}`);
        totalMatches++;
      }
    });

    if (fileMatches.length > 0) {
      results.push(`${relPath}\n${fileMatches.join("\n")}`);
    }

    if (totalMatches >= 200) {
      results.push("(truncated — too many matches)");
      break;
    }
  }

  if (results.length === 0) {
    return `No matches for /${pattern}/ in ${matchedFiles.length} file(s) matching ${glob}`;
  }

  return `grep /${pattern}/ ${glob} — ${totalMatches} match(es) in ${results.length} file(s)\n\n${results.join("\n\n")}`;
}

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

export function openUrl(url: string): string {
  try {
    const { execSync } =
      require("child_process") as typeof import("child_process");
    const platform = process.platform;
    if (platform === "win32") {
      execSync(`start "" "${url}"`, { stdio: "ignore" });
    } else if (platform === "darwin") {
      execSync(`open "${url}"`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: "ignore" });
    }
    return `Opened: ${url}`;
  } catch (err) {
    return `Error opening URL: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function generatePdf(
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

    // Escape content for embedding in a Python string literal
    const escaped = content
      .replace(/\\/g, "\\\\")
      .replace(/"""/g, '\\"\\"\\"')
      .replace(/\r/g, "");

    const script = `
import sys
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "reportlab", "--break-system-packages", "-q"])
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors

doc = SimpleDocTemplate(
    r"""${fullPath}""",
    pagesize=letter,
    rightMargin=inch,
    leftMargin=inch,
    topMargin=inch,
    bottomMargin=inch,
)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="H1", parent=styles["Heading1"], fontSize=22, spaceAfter=10))
styles.add(ParagraphStyle(name="H2", parent=styles["Heading2"], fontSize=16, spaceAfter=8))
styles.add(ParagraphStyle(name="H3", parent=styles["Heading3"], fontSize=13, spaceAfter=6))
styles.add(ParagraphStyle(name="Body", parent=styles["Normal"], fontSize=11, leading=16, spaceAfter=8))
styles.add(ParagraphStyle(name="Bullet", parent=styles["Normal"], fontSize=11, leading=16, leftIndent=20, spaceAfter=4, bulletIndent=10))

raw = """${escaped}"""

story = []
for line in raw.split("\\n"):
    s = line.rstrip()
    if s.startswith("### "):
        story.append(Paragraph(s[4:], styles["H3"]))
    elif s.startswith("## "):
        story.append(Spacer(1, 6))
        story.append(Paragraph(s[3:], styles["H2"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey, spaceAfter=4))
    elif s.startswith("# "):
        story.append(Paragraph(s[2:], styles["H1"]))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.black, spaceAfter=6))
    elif s.startswith("- ") or s.startswith("* "):
        story.append(Paragraph(u"\\u2022  " + s[2:], styles["Bullet"]))
    elif s.startswith("---"):
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey, spaceAfter=4))
    elif s == "":
        story.append(Spacer(1, 6))
    else:
        # handle **bold** inline
        import re
        s = re.sub(r"\\*\\*(.+?)\\*\\*", r"<b>\\1</b>", s)
        s = re.sub(r"\\*(.+?)\\*", r"<i>\\1</i>", s)
        s = re.sub(r"\`(.+?)\`", r"<font name='Courier'>\\1</font>", s)
        story.append(Paragraph(s, styles["Body"]))

doc.build(story)
print("OK")
`
      .replace("${fullPath}", fullPath.replace(/\\/g, "/"))
      .replace("${escaped}", escaped);

    const os = require("os") as typeof import("os");
    const tmpFile = path.join(os.tmpdir(), `lens_pdf_${Date.now()}.py`);
    writeFileSync(tmpFile, script, "utf-8");

    const { execSync } =
      require("child_process") as typeof import("child_process");
    execSync(`python "${tmpFile}"`, { stdio: "pipe" });

    try {
      require("fs").unlinkSync(tmpFile);
    } catch {
      /* ignore cleanup errors */
    }

    return `PDF generated: ${fullPath}`;
  } catch (err) {
    return `Error generating PDF: ${err instanceof Error ? err.message : String(err)}`;
  }
}
