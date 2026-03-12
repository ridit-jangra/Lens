import type { FilePatch, DiffLine } from "../components/repo/DiffViewer";

// ── Tool calls ────────────────────────────────────────────────────────────────

export type ToolCall =
  | { type: "shell"; command: string }
  | { type: "fetch"; url: string }
  | { type: "read-file"; filePath: string }
  | { type: "read-folder"; folderPath: string }
  | { type: "grep"; pattern: string; glob: string }
  | { type: "write-file"; filePath: string; fileContent: string }
  | { type: "delete-file"; filePath: string }
  | { type: "delete-folder"; folderPath: string }
  | { type: "open-url"; url: string }
  | { type: "generate-pdf"; filePath: string; content: string }
  | { type: "search"; query: string };

// ── Messages ──────────────────────────────────────────────────────────────────

export type Message =
  | { role: "user" | "assistant"; type: "text"; content: string }
  | {
      role: "assistant";
      type: "tool";
      toolName:
        | "shell"
        | "fetch"
        | "read-file"
        | "read-folder"
        | "grep"
        | "write-file"
        | "delete-file"
        | "delete-folder"
        | "open-url"
        | "generate-pdf"
        | "search";
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
