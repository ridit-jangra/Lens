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
- Include config files: vite.config, eslint.config, tailwind.config, etc.
- If there is a src/index.ts or src/main.ts or src/lib/index.ts, ALWAYS include it — these reveal what the project exports
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

  return `You are a senior software engineer analyzing a repository.
Repository URL: ${repoUrl}

Here are the file contents:

${fileList}

Analyze this repository thoroughly using the actual file contents above.

Important instructions:
- Read the actual source code carefully to determine what the project really is
- Look at every component, hook, utility and describe what it actually does
- importantFolders must describe EVERY folder with specifics: what files are in it, what they do, and why they matter
- suggestions must be specific to the actual code you read — reference real file names, real function names, real patterns you saw
- missingConfigs should only list things genuinely missing for THIS type of project
- securityIssues must reference actual file names and line patterns found
- overview must be specific: name the actual components/features/exports you saw, not just the tech stack

Respond ONLY with a JSON object (no markdown, no explanation) with this exact shape:
{
  "overview": "3-5 sentences. Name the actual components, features, or exports you found. Describe what the project does, who would use it, and what makes it distinctive. Be specific — mention actual file names or component names.",
  "importantFolders": [
    "src/components: contains X, Y, Z components. ButtonComponent uses CVA for variants. Each component is exported from index.ts."
  ],
  "missingConfigs": ["only configs genuinely missing and relevant — explain WHY each is missing for this specific project"],
  "securityIssues": ["reference actual file names and patterns found"],
  "suggestions": ["each suggestion must reference actual code — e.g. 'In src/components/Button.tsx, consider adding ...' not generic advice"]
}`;
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
    missingConfigs: parsed.missingConfigs ?? [],
    securityIssues: parsed.securityIssues ?? [],
    suggestions: parsed.suggestions ?? [],
  };
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
      } catch {
        // skip unreadable files
      }
    }
  }
  return files;
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
