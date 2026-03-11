export type Step =
  | { type: "cloning"; status: "pending" | "done" }
  | { type: "folder-exists"; status: "pending"; repoPath: string }
  | { type: "fetching-tree"; status: "pending" | "done" }
  | { type: "reading-files"; status: "pending" | "done" }
  | { type: "error"; message: string };

export type ReviewStage = "list" | "file";

export type FileTree = {
  name: string;
  children?: FileTree[];
};

export type ImportantFile = {
  path: string;
  content: string;
};

export type AIProvider =
  | "anthropic"
  | "gemini"
  | "ollama"
  | "openai"
  | "custom";

export type AnalysisResult = {
  overview: string;
  importantFolders: string[];
  missingConfigs: string[];
  securityIssues: string[];
  suggestions: string[];
};

export type PackageManager = "npm" | "yarn" | "pnpm" | "pip" | "unknown";

export type PreviewInfo = {
  packageManager: PackageManager;
  installCmd: string;
  devCmd: string;
  port: number | null;
};
