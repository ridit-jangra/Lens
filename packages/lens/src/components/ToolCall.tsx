import React from "react";
import { Box, Text } from "ink";
import { Diff, GREEN, YELLOW, RED } from "@ridit/ink-ui";

interface ToolCallProps {
  tool: string;
  args: unknown;
  status: "running" | "done";
  tokenCount?: number;
  duration?: number;
}

// Human-friendly labels: [running, done]
const TOOL_LABELS: Record<string, [string, string]> = {
  // file reads
  read_file:      ["Reading",       "Read"],
  read:           ["Reading",       "Read"],
  view_file:      ["Reading",       "Read"],
  cat:            ["Reading",       "Read"],
  // file writes
  write_file:     ["Writing",       "Wrote"],
  write:          ["Writing",       "Wrote"],
  create_file:    ["Creating",      "Created"],
  create:         ["Creating",      "Created"],
  overwrite_file: ["Overwriting",   "Overwrote"],
  // edits
  edit_file:      ["Editing",       "Edited"],
  edit:           ["Editing",       "Edited"],
  str_replace:    ["Editing",       "Edited"],
  patch_file:     ["Patching",      "Patched"],
  // search / glob
  grep:           ["Searching",     "Searched"],
  glob:           ["Finding files", "Found files"],
  search:         ["Searching",     "Searched"],
  ripgrep:        ["Searching",     "Searched"],
  // shell
  bash:           ["Running",       "Ran"],
  run_command:    ["Running",       "Ran"],
  execute:        ["Running",       "Ran"],
  shell:          ["Running",       "Ran"],
  // listing
  ls:             ["Listing",       "Listed"],
  list:           ["Listing",       "Listed"],
  list_files:     ["Listing",       "Listed"],
  // web
  web_search:     ["Searching web", "Searched web"],
  web_fetch:      ["Fetching",      "Fetched"],
  fetch:          ["Fetching",      "Fetched"],
};

const FILE_WRITE_TOOLS = new Set([
  "write_file", "edit_file", "create_file", "str_replace",
  "edit", "write", "create", "overwrite_file", "patch_file",
]);

const FILE_READ_TOOLS = new Set([
  "read_file", "read", "view_file", "cat",
]);

interface FileDiff {
  path: string;
  removals: string[];
  additions: string[];
}

function extractFileDiff(tool: string, args: unknown): FileDiff | null {
  if (typeof args !== "object" || !args) return null;
  const a = args as Record<string, unknown>;

  const path = String(a.path ?? a.file_path ?? a.filename ?? "");
  if (!path) return null;

  if (FILE_READ_TOOLS.has(tool)) {
    return { path, removals: [], additions: [] };
  }

  // str_replace / edit style
  const old = a.old_string ?? a.old_str ?? a.old;
  const newContent = a.new_string ?? a.new_str ?? a.new;
  if (old !== undefined || newContent !== undefined) {
    return {
      path,
      removals: old ? String(old).split("\n") : [],
      additions: newContent ? String(newContent).split("\n") : [],
    };
  }

  // Full content write / create
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

function getArgDetail(tool: string, args: unknown): string {
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

function getLabel(tool: string, running: boolean): string {
  const entry = TOOL_LABELS[tool];
  if (entry) return running ? entry[0] : entry[1];
  const base = tool.replace(/_/g, " ");
  return running
    ? base.charAt(0).toUpperCase() + base.slice(1) + "ing"
    : base.charAt(0).toUpperCase() + base.slice(1) + "ed";
}

export function ToolCall({ tool, args, status, tokenCount }: ToolCallProps) {
  const isFileTool = FILE_WRITE_TOOLS.has(tool) || FILE_READ_TOOLS.has(tool);
  const diff = isFileTool ? extractFileDiff(tool, args) : null;
  const detail = getArgDetail(tool, args);
  const isRunning = status === "running";
  const label = getLabel(tool, isRunning);

  const hasDiffContent = diff && (diff.additions.length > 0 || diff.removals.length > 0);

  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* Tool header row */}
      <Box gap={1}>
        <Text color={isRunning ? YELLOW : GREEN} dimColor={!isRunning}>
          {isRunning ? "◆" : "✓"}
        </Text>
        <Text color={isRunning ? "white" : "gray"} dimColor={!isRunning}>
          {label}
        </Text>
        {detail && (
          <Text color="gray" dimColor>
            {detail}
            {isRunning ? "..." : ""}
          </Text>
        )}
        {!isRunning && tokenCount && (
          <Text color="gray" dimColor>· {tokenCount} tokens</Text>
        )}
      </Box>

      {/* Diff — shown always when there's content */}
      {hasDiffContent && (
        <Box marginLeft={2} marginTop={0}>
          <Diff
            filename={diff!.path}
            additions={diff!.additions.length}
            deletions={diff!.removals.length}
            lines={[
              ...diff!.removals.map((content) => ({ type: "remove" as const, content })),
              ...diff!.additions.map((content) => ({ type: "add" as const, content })),
            ]}
          />
        </Box>
      )}
    </Box>
  );
}
