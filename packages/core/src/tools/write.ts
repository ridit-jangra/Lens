import { tool } from "ai";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { z } from "zod";

export const write = tool({
  description: "write content to a file, creates the file if it doesn't exist",
  parameters: z.object({
    path: z.string().describe("path to file"),
    content: z.string().describe("content to write"),
  }),
  execute: async ({ path, content }) => {
    const prevContent = existsSync(path)
      ? (() => { try { return readFileSync(path, "utf-8"); } catch { return null; } })()
      : null;
    try {
      writeFileSync(path, content);
      return { ok: true, prevContent };
    } catch {
      return { ok: false, prevContent: null };
    }
  },
});
