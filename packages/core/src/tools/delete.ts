import { tool } from "ai";
import { z } from "zod";
import { rmSync, existsSync } from "fs";

function deletePath(path: string): string {
  try {
    if (!existsSync(path)) return `error: ${path} does not exist`;
    rmSync(path, { recursive: true, force: true });
    return `deleted: ${path}`;
  } catch {
    return `error deleting ${path}`;
  }
}

export const del = tool({
  description: "delete one or more files or folders",
  parameters: z.object({
    path: z
      .union([z.string(), z.array(z.string())])
      .describe("path or array of paths to delete"),
  }),
  execute: async ({ path }) => {
    if (Array.isArray(path)) {
      const results = await Promise.all(path.map(deletePath));
      return results.join("\n");
    }
    return deletePath(path);
  },
});
