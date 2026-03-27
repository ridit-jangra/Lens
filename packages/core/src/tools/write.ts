import { tool } from "ai";
import { writeFileSync } from "fs";
import { z } from "zod";

export const write = tool({
  description: "write content to a file, creates the file if it doesn't exist",
  parameters: z.object({
    path: z.string().describe("path to file"),
    content: z.string().describe("content to write"),
  }),
  execute: async ({ path, content }) => {
    try {
      writeFileSync(path, content);
      return `successfully wrote to ${path}`;
    } catch {
      return `error writing to ${path}`;
    }
  },
});
