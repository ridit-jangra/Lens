import { tool } from "ai";
import { z } from "zod";
import { readdirSync, statSync } from "fs";
import { join } from "path";

export const ls = tool({
  description: "list files and directories at a path",
  parameters: z.object({
    path: z.string().optional().describe("path to list, default ."),
  }),
  execute: async ({ path = "." }) => {
    try {
      const entries = readdirSync(path);
      return entries
        .map((entry) => {
          const isDir = statSync(join(path, entry)).isDirectory();
          return `${isDir ? "🗀" : "☰"} ${entry}`;
        })
        .join("\n");
    } catch {
      return `error listing ${path}`;
    }
  },
});
