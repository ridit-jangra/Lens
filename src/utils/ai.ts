import { exec } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";
import type { Provider } from "../types/config";
import type { AnalysisResult, ImportantFile } from "../types/repo";

export function buildFileListPrompt(
  repoUrl: string,
  fileTree: string[],
): string {
  return `You are a senior software engineer. You are about to analyze this repository:
Repository URL: ${repoUrl}

Here is the complete file tree (${fileTree.length} files):
${fileTree.join("\n")}

Your job is to select the files you need to read to fully understand what this project is, what it does, and how it works.

Rules:
- ALWAYS include package.json, tsconfig.json, README.md if they exist
- ALWAYS include ALL files inside src/ — especially index files, main entry points, and any files that reveal the project's purpose (components, hooks, utilities, exports)
- Include config files: vite.config, eslint.config, tailwind.config, bun.lockb, .nvmrc, etc.
- If there is a src/index.ts or src/main.ts or src/lib/index.ts, ALWAYS include it
- Do NOT skip source files just because there are many — pick up to 30 files
- Prefer breadth: pick at least one file from every folder under src/

Respond ONLY with a JSON array of file paths relative to repo root. No markdown, no explanation. Example:
["package.json", "src/main.ts", "src/components/Button.tsx"]`;
}

export function buildAnalysisPrompt(
  repoUrl: string,
  files: ImportantFile[],
): string {
  const fileList = files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
    .join("\n\n");

  return `You are a senior software engineer building a persistent knowledge base about a codebase. Your output will be stored and incrementally updated over time — it must be durable, structural knowledge, not ephemeral warnings.

Repository URL: ${repoUrl}

Here are the file contents:

${fileList}

Analyze this repository and extract permanent, structural understanding. Focus on WHAT the codebase IS and HOW it works — not linting issues or missing configs.

Rules:
- Read source code carefully. Reference real file names, real function names, real patterns.
- tooling: detect from package.json, lockfiles, config files. Keys: packageManager (npm/yarn/pnpm/bun), language, runtime, bundler, framework, testRunner, linter, formatter — only include what you actually found evidence of.
- keyFiles: list the most important files with a one-line description of what they do. Format: "src/utils/ai.ts: callModel abstraction supporting anthropic/gemini/ollama/openai"
- patterns: list recurring idioms, design patterns, or conventions actually used in the code. E.g. "Discriminated union state machines for multi-stage UI flows", "React + Ink for terminal rendering"
- architecture: 2-3 sentences describing the high-level structure and how data flows through the system.
- importantFolders: describe EVERY folder with specifics — what files are in it and what they do.
- suggestions: specific, actionable improvements referencing real file names and real patterns you saw. No generic advice.
- overview: 3-5 sentences naming actual components, features, exports. Be specific.

Respond ONLY with a JSON object (no markdown, no explanation):
{
  "overview": "...",
  "architecture": "...",
  "tooling": {
    "packageManager": "bun",
    "language": "TypeScript",
    "runtime": "Node.js",
    "bundler": "tsup",
    "framework": "Ink"
  },
  "importantFolders": [
    "src/commands: contains chat.tsx, commit.tsx, review.tsx — each exports an Ink component that is the top-level renderer for that CLI command"
  ],
  "keyFiles": [
    "src/utils/ai.ts: callModel abstraction supporting anthropic/gemini/ollama/openai providers via a unified Provider type"
  ],
  "patterns": [
    "Discriminated union state machines (type + stage fields) for multi-step UI flows in every command component"
  ],
  "suggestions": [
    "In src/utils/ai.ts, callModel has no retry logic — adding exponential backoff would improve reliability for ollama which can be slow to start"
  ]
}`;
}

export function buildToolingPatchPrompt(
  repoUrl: string,
  files: ImportantFile[],
): string {
  const relevant = files.filter((f) =>
    [
      "package.json",
      "bun.lockb",
      "yarn.lock",
      "pnpm-lock.yaml",
      "package-lock.json",
      "tsconfig.json",
      ".nvmrc",
      ".node-version",
    ].includes(path.basename(f.path)),
  );

  if (relevant.length === 0) return "";

  const fileList = relevant
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``)
    .join("\n\n");

  return `You are analyzing a repository's tooling configuration.
Repository: ${repoUrl}

${fileList}

Extract only tooling information. Respond ONLY with a JSON object:
{
  "tooling": {
    "packageManager": "bun | npm | yarn | pnpm",
    "language": "TypeScript | JavaScript | ...",
    "runtime": "Node.js | Bun | Deno | ...",
    "bundler": "tsup | esbuild | vite | webpack | ...",
    "framework": "React | Ink | Next.js | ...",
    "testRunner": "vitest | jest | ...",
    "linter": "eslint | biome | ...",
    "formatter": "prettier | biome | ..."
  }
}
Only include keys where you found actual evidence. No markdown, no explanation.`;
}

function parseStringArray(text: string): string[] {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as string[];
  } catch {
    return [];
  }
}

function parseResult(text: string): AnalysisResult {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found in response:\n${cleaned}`);

  const parsed = JSON.parse(jsonMatch[0]) as Partial<AnalysisResult>;

  return {
    overview: parsed.overview ?? "No overview provided",
    importantFolders: parsed.importantFolders ?? [],
    tooling: parsed.tooling ?? {},
    keyFiles: parsed.keyFiles ?? [],
    patterns: parsed.patterns ?? [],
    architecture: parsed.architecture ?? "",
    suggestions: parsed.suggestions ?? [],
  };
}

function parseToolingPatch(text: string): Partial<AnalysisResult> | null {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as Partial<AnalysisResult>;
  } catch {
    return null;
  }
}

export function checkOllamaInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    exec("ollama --version", (err) => resolve(!err));
  });
}

export function getOllamaModels(): Promise<string[]> {
  return new Promise((resolve) => {
    exec("ollama list", (err, stdout) => {
      if (err) return resolve([]);
      const models = stdout
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => line.split(/\s+/)[0] ?? "")
        .filter(Boolean);
      resolve(models);
    });
  });
}

async function callModel(provider: Provider, prompt: string): Promise<string> {
  switch (provider.type) {
    case "anthropic": {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": provider.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!response.ok)
        throw new Error(`Anthropic API error: ${response.statusText}`);
      const data = (await response.json()) as any;
      return data.content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("");
    }

    case "gemini": {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${provider.apiKey ?? ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        },
      );
      if (!response.ok)
        throw new Error(`Gemini API error: ${response.statusText}`);
      const data = (await response.json()) as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }

    case "ollama": {
      const baseUrl = provider.baseUrl ?? "http://localhost:11434";
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model,
          prompt,
          stream: false,
        }),
      });
      if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
      const data = (await response.json()) as any;
      return data.response ?? "";
    }

    case "openai":
    case "custom": {
      const baseUrl = provider.baseUrl ?? "https://api.openai.com/v1";
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey ?? ""}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!response.ok)
        throw new Error(`OpenAI-compat API error: ${response.statusText}`);
      const data = (await response.json()) as any;
      return data.choices?.[0]?.message?.content ?? "";
    }

    default:
      throw new Error(`Unknown provider type`);
  }
}

export async function requestFileList(
  repoUrl: string,
  repoPath: string,
  fileTree: string[],
  provider: Provider,
): Promise<ImportantFile[]> {
  const prompt = buildFileListPrompt(repoUrl, fileTree);
  const text = await callModel(provider, prompt);
  const requestedPaths = parseStringArray(text);

  const files: ImportantFile[] = [];
  for (const filePath of requestedPaths) {
    const fullPath = path.join(repoPath, filePath);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        files.push({ path: filePath, content });
      } catch {}
    }
  }
  return files;
}

export async function extractToolingPatch(
  repoUrl: string,
  files: ImportantFile[],
  provider: Provider,
): Promise<Partial<AnalysisResult> | null> {
  const prompt = buildToolingPatchPrompt(repoUrl, files);
  if (!prompt) return null;
  try {
    const text = await callModel(provider, prompt);
    return parseToolingPatch(text);
  } catch {
    return null;
  }
}

export async function analyzeRepo(
  repoUrl: string,
  files: ImportantFile[],
  provider: Provider,
): Promise<AnalysisResult> {
  const prompt = buildAnalysisPrompt(repoUrl, files);
  const text = await callModel(provider, prompt);
  return parseResult(text);
}

export const callModelRaw = callModel;
