import type { FilePatch, DiffLine } from "../components/repo/DiffViewer";

// ── Tool calls ────────────────────────────────────────────────────────────────

export type ToolCall =
  | { type: "shell"; command: string }
  | { type: "fetch"; url: string }
  | { type: "read-file"; filePath: string }
  | { type: "write-file"; filePath: string; fileContent: string }
  | { type: "search"; query: string };

// ── Messages ──────────────────────────────────────────────────────────────────

export type Message =
  | { role: "user" | "assistant"; type: "text"; content: string }
  | {
      role: "assistant";
      type: "tool";
      toolName: "shell" | "fetch" | "read-file" | "write-file" | "search";
      content: string;
      result: string;
      approved: boolean;
    }
  | {
      role: "assistant";
      type: "plan";
      content: string;
      patches: FilePatch[];
      applied: boolean;
    };

// ── Chat stage ────────────────────────────────────────────────────────────────

export type ChatStage =
  | { type: "picking-provider" }
  | { type: "loading" }
  | { type: "idle" }
  | { type: "thinking" }
  | { type: "error"; message: string }
  | {
      type: "permission";
      tool: ToolCall;
      pendingMessages: Message[];
      resolve: (approved: boolean) => void;
    }
  | {
      type: "preview";
      patches: FilePatch[];
      diffLines: DiffLine[][];
      scrollOffset: number;
      pendingMessages: Message[];
    }
  | {
      type: "viewing-file";
      file: { path: string; isNew: boolean; patch: FilePatch };
      diffLines: DiffLine[];
      scrollOffset: number;
    }
  | { type: "clone-offer"; repoUrl: string; launchAnalysis?: boolean }
  | { type: "cloning"; repoUrl: string }
  | { type: "clone-exists"; repoUrl: string; repoPath: string }
  | {
      type: "clone-done";
      repoUrl: string;
      destPath: string;
      fileCount: number;
      launchAnalysis?: boolean;
    }
  | { type: "clone-error"; message: string };
