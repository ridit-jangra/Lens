import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { getSystemPrompt, saveSession, loadSession, getLatestSession } from "../src/memory";
import { createSession, addMessage } from "../src/session";

const TMP = join(import.meta.dir, "__tmp__");

describe("getSystemPrompt", () => {
  it("includes the cwd in the prompt", () => {
    const prompt = getSystemPrompt("/some/nonexistent/dir");
    expect(prompt).toContain("/some/nonexistent/dir");
  });

  it("does not include project context when LENS.md is absent", () => {
    const prompt = getSystemPrompt("/some/nonexistent/dir");
    expect(prompt).not.toContain("## Project Context");
  });

  it("includes LENS.md content when present", () => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, "LENS.md"), "# My Project\nThis is a test project.");

    const prompt = getSystemPrompt(TMP);
    expect(prompt).toContain("My Project");
    expect(prompt).toContain("Project Context");

    rmSync(TMP, { recursive: true, force: true });
  });
});

describe("saveSession / loadSession", () => {
  it("round-trips a session", () => {
    let session = createSession("/test/cwd");
    session = addMessage(session, "user", "hello");
    session = addMessage(session, "assistant", "hi");

    saveSession(session);
    const loaded = loadSession(session.id);

    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(session.id);
    expect(loaded!.cwd).toBe("/test/cwd");
    expect(loaded!.messages).toHaveLength(2);
  });

  it("returns null for unknown id", () => {
    expect(loadSession("nonexistent-id-xyz")).toBeNull();
  });
});

describe("getLatestSession", () => {
  it("returns null for a cwd with no sessions", () => {
    expect(getLatestSession("/never/used/path/xyz123")).toBeNull();
  });

  it("returns the most recent session for a cwd", () => {
    const cwd = "/test/latest-session-cwd-" + Date.now();
    const s1 = createSession(cwd);
    const s2 = createSession(cwd);

    saveSession(s1);
    // small delay so createdAt differs
    saveSession({ ...s2, createdAt: new Date(Date.now() + 1000) });

    const latest = getLatestSession(cwd);
    expect(latest?.id).toBe(s2.id);
  });
});
