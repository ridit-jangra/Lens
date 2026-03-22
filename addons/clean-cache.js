const { defineTool } = require("@ridit/lens-sdk");
const { execSync } = require("child_process");

const isWindows = process.platform === "win32";

defineTool({
  name: "clean-cache",
  description: "Clean node_modules and bun install cache",
  safe: false,
  permissionLabel: "Clean cache and node_modules",

  systemPromptEntry: () =>
    `<clean-cache>{}</clean-cache> — clean node_modules and bun cache`,

  parseInput: (body) => {
    const trimmed = body.trim();
    if (!trimmed || trimmed === "{}") return {};
    return JSON.parse(trimmed);
  },

  summariseInput: () => "clean cache",

  execute: async (input, ctx) => {
    const repoPath = ctx.repoPath;

    try {
      // Remove node_modules
      if (isWindows) {
        execSync("rmdir /s /q node_modules", { cwd: repoPath, stdio: "pipe" });
      } else {
        execSync("rm -rf node_modules", { cwd: repoPath, stdio: "pipe" });
      }

      // Clean bun cache
      execSync("bun clean", { cwd: repoPath, stdio: "pipe" });

      return {
        kind: "text",
        value: "Cache cleaned successfully! node_modules removed and bun cache cleared.",
      };
    } catch (err) {
      return {
        kind: "error",
        value: `Failed to clean cache: ${err.message}`,
      };
    }
  },
});