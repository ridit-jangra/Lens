import { tool } from "ai";
import { z } from "zod";
import { readFileSync, readdirSync } from "fs";

export const read = tool({
  description: "read the contents of a file or list a directory",
  parameters: z.object({
    path: z.string().describe("path to file or directory"),
  }),
  execute: async ({ path }) => {
    try {
      const content = readFileSync(path, "utf-8");
      return content;
    } catch {
      return `error reading ${path}`;
    }
  },
});
