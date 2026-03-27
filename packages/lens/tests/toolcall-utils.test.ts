import { describe, it, expect } from "bun:test";
import { extractFileDiff, getLabel, getArgDetail } from "../src/components/toolcall-utils";

describe("getLabel", () => {
  it("returns running label for known tools", () => {
    expect(getLabel("read_file", true)).toBe("Reading");
    expect(getLabel("write_file", true)).toBe("Writing");
    expect(getLabel("bash", true)).toBe("Running");
    expect(getLabel("ls", true)).toBe("Listing");
    expect(getLabel("str_replace", true)).toBe("Editing");
  });

  it("returns done label for known tools", () => {
    expect(getLabel("read_file", false)).toBe("Read");
    expect(getLabel("write_file", false)).toBe("Wrote");
    expect(getLabel("bash", false)).toBe("Ran");
    expect(getLabel("ls", false)).toBe("Listed");
    expect(getLabel("create_file", false)).toBe("Created");
  });

  it("falls back gracefully for unknown tools", () => {
    expect(getLabel("some_tool", true)).toBe("Some tooling");
    expect(getLabel("some_tool", false)).toBe("Some tooled");
  });
});

describe("extractFileDiff", () => {
  it("returns null for non-object args", () => {
    expect(extractFileDiff("write_file", null)).toBeNull();
    expect(extractFileDiff("write_file", "string")).toBeNull();
  });

  it("returns null when no path in args", () => {
    expect(extractFileDiff("write_file", { content: "hello" })).toBeNull();
  });

  it("returns path with empty diff for read tools", () => {
    const result = extractFileDiff("read_file", { path: "src/foo.ts" });
    expect(result).toEqual({ path: "src/foo.ts", removals: [], additions: [] });
  });

  it("handles file_path and filename aliases", () => {
    expect(extractFileDiff("read", { file_path: "a.ts" })?.path).toBe("a.ts");
    expect(extractFileDiff("read", { filename: "b.ts" })?.path).toBe("b.ts");
  });

  it("parses str_replace style args (old_string / new_string)", () => {
    const result = extractFileDiff("str_replace", {
      path: "src/foo.ts",
      old_string: "const x = 1;\nconst y = 2;",
      new_string: "const x = 10;",
    });
    expect(result?.path).toBe("src/foo.ts");
    expect(result?.removals).toEqual(["const x = 1;", "const y = 2;"]);
    expect(result?.additions).toEqual(["const x = 10;"]);
  });

  it("parses old_str / new_str aliases", () => {
    const result = extractFileDiff("edit", {
      path: "foo.ts",
      old_str: "old",
      new_str: "new",
    });
    expect(result?.removals).toEqual(["old"]);
    expect(result?.additions).toEqual(["new"]);
  });

  it("parses full content write with no previous content", () => {
    const result = extractFileDiff("write_file", {
      path: "new.ts",
      content: "line1\nline2\nline3",
    });
    expect(result?.removals).toEqual([]);
    expect(result?.additions).toEqual(["line1", "line2", "line3"]);
  });

  it("includes prev content as removals when _prevContent is present", () => {
    const result = extractFileDiff("write_file", {
      path: "existing.ts",
      content: "new content",
      _prevContent: "old content\nmore old",
    });
    expect(result?.removals).toEqual(["old content", "more old"]);
    expect(result?.additions).toEqual(["new content"]);
  });

  it("returns empty diff for file tool with no content args", () => {
    const result = extractFileDiff("write_file", { path: "foo.ts" });
    expect(result).toEqual({ path: "foo.ts", removals: [], additions: [] });
  });
});

describe("getArgDetail", () => {
  it("returns path when present", () => {
    expect(getArgDetail("read", { path: "src/index.ts" })).toBe("src/index.ts");
  });

  it("prefers path over other fields", () => {
    expect(getArgDetail("bash", { path: "foo.ts", command: "ls" })).toBe("foo.ts");
  });

  it("falls back to query/command when no path", () => {
    expect(getArgDetail("bash", { command: "npm install" })).toBe("npm install");
    expect(getArgDetail("grep", { query: "TODO" })).toBe("TODO");
  });

  it("handles non-object args", () => {
    expect(getArgDetail("tool", null)).toBe("");
    expect(getArgDetail("tool", "plain")).toBe("plain");
  });
});
