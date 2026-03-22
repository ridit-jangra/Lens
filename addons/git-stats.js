const { defineTool } = require("@ridit/lens-sdk");
const { execSync } = require("child_process");

defineTool({
  name: "git-stats",
  description: "Show git contributor stats",
  safe: true,
  permissionLabel: "View git stats",
  systemPromptEntry: () => "<git-stats>{}</git-stats> — show contributor commit counts",
  parseInput: (body) => JSON.parse(body.trim() || "{}"),
  summariseInput: () => "git contributor stats",
  execute: async (input, ctx) => {
    try {
      const output = execSync("git shortlog -sn --all", {
        cwd: ctx.repoPath,
        stdio: "pipe",
      }).toString();
      return {
        kind: "text",
        value: output || "No commits found",
      };
    } catch (err) {
      return {
        kind: "error",
        value: `Failed to get git stats: ${err.message}`,
      };
    }
  },
});