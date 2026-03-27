import { tool } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const bash = tool({
  description: "run a shell command and return the output",
  parameters: z.object({
    command: z.string().describe("shell command to run"),
    timeout: z.number().optional().describe("timeout in ms, default 30000"),
  }),
  execute: async ({ command, timeout = 30000 }) => {
    try {
      const { stdout, stderr } = await execAsync(command, { timeout });
      return stdout || stderr || "no output";
    } catch (e) {
      return `error running command: ${command}`;
    }
  },
});
