import { tool } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const grep = tool({
  description: "search for a pattern in files",
  parameters: z.object({
    pattern: z.string().describe("pattern to search for"),
    path: z.string().optional().describe("path to search in, default ."),
    filePattern: z.string().optional().describe("file pattern e.g *.ts"),
  }),
  execute: async ({ pattern, path = ".", filePattern }) => {
    try {
      const includeFlag = filePattern ? `--include="${filePattern}"` : "";
      const { stdout } = await execAsync(
        `grep -r "${pattern}" ${path} ${includeFlag}`,
      );
      return stdout || "no matches found";
    } catch {
      return "no matches found";
    }
  },
});
