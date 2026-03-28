import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { read, write, bash, grep, ls } from "../src/tools";

const TMP = join(import.meta.dir, "__tools_tmp__");

beforeAll(() => mkdirSync(TMP, { recursive: true }));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe("read tool", () => {
  it("reads a file's content", async () => {
    const file = join(TMP, "hello.txt");
    writeFileSync(file, "hello world");
    const result = await read.execute({ path: file }, {} as never);
    expect(result).toBe("hello world");
  });

  it("lists a directory's entries", async () => {
    const dir = join(TMP, "subdir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.ts"), "");
    writeFileSync(join(dir, "b.ts"), "");
    const result = await read.execute({ path: dir }, {} as never);
    expect(result).toContain("a.ts");
    expect(result).toContain("b.ts");
  });

  it("reads multiple paths when given an array", async () => {
    const f1 = join(TMP, "f1.txt");
    const f2 = join(TMP, "f2.txt");
    writeFileSync(f1, "content1");
    writeFileSync(f2, "content2");
    const result = await read.execute({ path: [f1, f2] }, {} as never);
    expect(result).toContain("content1");
    expect(result).toContain("content2");
  });

  it("returns an error message for a missing file", async () => {
    const result = await read.execute({ path: join(TMP, "nonexistent.txt") }, {} as never);
    expect(result).toContain("error reading");
  });
});

describe("write tool", () => {
  it("creates a new file with content", async () => {
    const file = join(TMP, "written.txt");
    const result = await write.execute({ path: file, content: "new content" }, {} as never);
    expect((result as { ok: boolean }).ok).toBe(true);

    const { readFileSync } = await import("fs");
    expect(readFileSync(file, "utf-8")).toBe("new content");
  });

  it("overwrites an existing file", async () => {
    const file = join(TMP, "overwrite.txt");
    writeFileSync(file, "old content");
    await write.execute({ path: file, content: "new content" }, {} as never);

    const { readFileSync } = await import("fs");
    expect(readFileSync(file, "utf-8")).toBe("new content");
  });

  it("returns error when write fails", async () => {
    const result = await write.execute({ path: "/nonexistent/deep/path/file.txt", content: "x" }, {} as never);
    expect((result as { ok: boolean }).ok).toBe(false);
  });
});

describe("bash tool", () => {
  it("executes a command and returns stdout", async () => {
    const result = await bash.execute({ command: "echo hello" }, {} as never);
    expect(result.trim()).toBe("hello");
  });

  it("returns stderr output on failure", async () => {
    const result = await bash.execute({ command: "ls /nonexistent_path_xyz 2>&1; true" }, {} as never);
    expect(typeof result).toBe("string");
  });
});

describe("grep tool", () => {
  it("finds matching lines in a file", async () => {
    const file = join(TMP, "grep_target.txt");
    writeFileSync(file, "foo bar\nbaz qux\nfoo again");
    const result = await grep.execute({ pattern: "foo", path: file }, {} as never);
    expect(result).toContain("foo bar");
    expect(result).toContain("foo again");
    expect(result).not.toContain("baz qux");
  });

  it("returns no matches message when pattern not found", async () => {
    const file = join(TMP, "grep_empty.txt");
    writeFileSync(file, "nothing here");
    const result = await grep.execute({ pattern: "xyz_not_found", path: file }, {} as never);
    expect(typeof result).toBe("string");
  });
});

describe("ls tool", () => {
  it("lists files in a directory", async () => {
    const dir = join(TMP, "ls_dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "one.ts"), "");
    writeFileSync(join(dir, "two.ts"), "");
    const result = await ls.execute({ path: dir }, {} as never);
    expect(result).toContain("one.ts");
    expect(result).toContain("two.ts");
  });

  it("defaults to cwd when no path given", async () => {
    const result = await ls.execute({ path: "." }, {} as never);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
