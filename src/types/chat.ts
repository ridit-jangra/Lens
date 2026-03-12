import type { DiffLine, FilePatch } from "../components/repo/DiffViewer";

export type Role = "user" | "assistant";

export type Message =
  | { role: Role; content: string; type: "text" }
  | {
      role: "assistant";
      content: string;
      type: "plan";
      patches: FilePatch[];
      applied: boolean;
    }
  | {
      role: "assistant";
      content: string;
      type: "tool";
      toolName: string;
      result: string;
      approved: boolean;
    };

export type ToolCall =
  | { type: "shell"; command: string }
  | { type: "fetch"; url: string }
  | { type: "read-file"; filePath: string }
  | { type: "write-file"; filePath: string; fileContent: string };

export type ChatStage =
  | { type: "picking-provider" }
  | { type: "loading" }
  | { type: "idle" }
  | { type: "thinking" }
  | {
      type: "preview";
      patches: FilePatch[];
      diffLines: DiffLine[][];
      scrollOffset: number;
    }
  | {
      type: "viewing-file";
      file: { path: string; isNew: boolean; patch: FilePatch };
      diffLines: DiffLine[];
      scrollOffset: number;
    }
  | {
      type: "permission";
      tool: ToolCall;
      pendingMessages: Message[];
      resolve: (approved: boolean) => void;
    }
  | { type: "clone-offer"; repoUrl: string; cloneUrl: string }
  | { type: "cloning"; repoUrl: string; cloneUrl: string }
  | {
      type: "clone-exists";
      repoUrl: string;
      cloneUrl: string;
      repoPath: string;
    }
  | { type: "clone-done"; repoUrl: string; destPath: string; fileCount: number }
  | { type: "clone-error"; repoUrl: string; message: string };
