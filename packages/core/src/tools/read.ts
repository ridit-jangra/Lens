import { tool } from "ai";
import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function readPath(path: string): string {
  try {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      const entries = readdirSync(path);
      return entries
        .map((entry) => {
          const isDir = statSync(join(path, entry)).isDirectory();
          return `${isDir ? "📁" : "📄"} ${entry}`;
        })
        .join("\n");
    }
    return readFileSync(path, "utf-8");
  } catch {
    return `error reading ${path}`;
  }
}

export const read = tool({
  description: "read contents of one or more files or directories",
  parameters: z.object({
    path: z
      .union([z.string(), z.array(z.string())])
      .describe("path or array of paths to read"),
  }),
  execute: async ({ path }) => {
    if (Array.isArray(path)) {
      const results = await Promise.all(
        path.map(async (p) => `--- ${p} ---\n${readPath(p)}`),
      );
      return results.join("\n\n");
    }
    return readPath(path);
  },
});
