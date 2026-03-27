export const TOOL_LABELS: Record<string, [string, string]> = {
  read_file:      ["Reading",       "Read"],
  read:           ["Reading",       "Read"],
  view_file:      ["Reading",       "Read"],
  cat:            ["Reading",       "Read"],
  write_file:     ["Writing",       "Wrote"],
  write:          ["Writing",       "Wrote"],
  create_file:    ["Creating",      "Created"],
  create:         ["Creating",      "Created"],
  overwrite_file: ["Overwriting",   "Overwrote"],
  edit_file:      ["Editing",       "Edited"],
  edit:           ["Editing",       "Edited"],
  str_replace:    ["Editing",       "Edited"],
  patch_file:     ["Patching",      "Patched"],
  grep:           ["Searching",     "Searched"],
  glob:           ["Finding files", "Found files"],
  search:         ["Searching",     "Searched"],
  ripgrep:        ["Searching",     "Searched"],
  bash:           ["Running",       "Ran"],
  run_command:    ["Running",       "Ran"],
  execute:        ["Running",       "Ran"],
  shell:          ["Running",       "Ran"],
  ls:             ["Listing",       "Listed"],
  list:           ["Listing",       "Listed"],
  list_files:     ["Listing",       "Listed"],
  web_search:     ["Searching web", "Searched web"],
  web_fetch:      ["Fetching",      "Fetched"],
  fetch:          ["Fetching",      "Fetched"],
};

export const FILE_WRITE_TOOLS = new Set([
  "write_file", "edit_file", "create_file", "str_replace",
  "edit", "write", "create", "overwrite_file", "patch_file",
]);

export const FILE_READ_TOOLS = new Set([
  "read_file", "read", "view_file", "cat",
]);

export interface FileDiff {
  path: string;
  removals: string[];
  additions: string[];
}

export function extractFileDiff(tool: string, args: unknown): FileDiff | null {
  if (typeof args !== "object" || !args) return null;
  const a = args as Record<string, unknown>;

  const path = String(a.path ?? a.file_path ?? a.filename ?? "");
  if (!path) return null;

  if (FILE_READ_TOOLS.has(tool)) {
    return { path, removals: [], additions: [] };
  }

  const old = a.old_string ?? a.old_str ?? a.old;
  const newContent = a.new_string ?? a.new_str ?? a.new;
  if (old !== undefined || newContent !== undefined) {
    return {
      path,
      removals: old ? String(old).split("\n") : [],
      additions: newContent ? String(newContent).split("\n") : [],
    };
  }

  const content = a.content ?? a.new_content;
  if (content !== undefined) {
    const prev = a._prevContent;
    return {
      path,
      removals: prev ? String(prev).split("\n") : [],
      additions: String(content).split("\n"),
    };
  }

  return { path, removals: [], additions: [] };
}

export function getArgDetail(tool: string, args: unknown): string {
  if (typeof args !== "object" || !args) return String(args ?? "");
  const a = args as Record<string, unknown>;

  const path = a.path ?? a.file_path ?? a.filename;
  if (path) return String(path);

  const pattern = a.pattern ?? a.query ?? a.command ?? a.cmd;
  if (pattern) return String(pattern).slice(0, 50);

  return Object.values(a)
    .filter((v) => typeof v === "string")
    .join(", ")
    .slice(0, 50);
}

export function getLabel(tool: string, running: boolean): string {
  const entry = TOOL_LABELS[tool];
  if (entry) return running ? entry[0] : entry[1];
  const base = tool.replace(/_/g, " ");
  return running
    ? base.charAt(0).toUpperCase() + base.slice(1) + "ing"
    : base.charAt(0).toUpperCase() + base.slice(1) + "ed";
}
