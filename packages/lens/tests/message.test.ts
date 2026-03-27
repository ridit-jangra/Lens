import { describe, it, expect } from "bun:test";
import { extractText } from "../src/components/Message";

describe("extractText", () => {
  it("returns a plain string as-is", () => {
    expect(extractText("hello world")).toBe("hello world");
  });

  it("extracts text from a content array", () => {
    const content = [
      { type: "text", text: "hello " },
      { type: "text", text: "world" },
    ];
    expect(extractText(content)).toBe("hello world");
  });

  it("skips non-text content blocks", () => {
    const content = [
      { type: "image", url: "http://example.com/img.png" },
      { type: "text", text: "caption" },
    ];
    expect(extractText(content)).toBe("caption");
  });

  it("returns empty string for null / undefined", () => {
    expect(extractText(null)).toBe("");
    expect(extractText(undefined)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(extractText([])).toBe("");
  });

  it("handles missing text field gracefully", () => {
    const content = [{ type: "text" }];
    expect(extractText(content)).toBe("");
  });
});
