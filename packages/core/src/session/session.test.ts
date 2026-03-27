import { describe, it, expect } from "bun:test";
import { createSession, addMessage, getMessages } from "./index";

describe("createSession", () => {
  it("sets cwd and empty messages", () => {
    const s = createSession("/my/project");
    expect(s.cwd).toBe("/my/project");
    expect(s.messages).toEqual([]);
    expect(s.id).toBeTruthy();
  });

  it("generates unique ids", () => {
    const a = createSession("/path");
    const b = createSession("/path");
    expect(a.id).not.toBe(b.id);
  });
});

describe("addMessage", () => {
  it("appends a message without mutating the original", () => {
    const original = createSession("/path");
    const updated = addMessage(original, "user", "hello");

    expect(original.messages).toHaveLength(0);
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0]).toMatchObject({ role: "user", content: "hello" });
  });

  it("chains multiple messages correctly", () => {
    let s = createSession("/path");
    s = addMessage(s, "user", "hello");
    s = addMessage(s, "assistant", "hi there");
    s = addMessage(s, "user", "thanks");

    expect(s.messages).toHaveLength(3);
    expect(s.messages[1]).toMatchObject({ role: "assistant", content: "hi there" });
    expect(s.messages[2]).toMatchObject({ role: "user", content: "thanks" });
  });
});

describe("getMessages", () => {
  it("returns the session messages array", () => {
    let s = createSession("/path");
    s = addMessage(s, "user", "test");
    expect(getMessages(s)).toEqual(s.messages);
  });
});
