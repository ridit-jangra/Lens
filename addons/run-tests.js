const { defineTool } = require("@ridit/lens-sdk");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

defineTool({
  name: "run-tests",
  description:
    "Runs Node.js tests — whole suite or a specific file, auto-detected",
  safe: false,
  permissionLabel: "Run tests in the repo",

  systemPromptEntry: () =>
    `<run-tests>{}</run-tests> — run the full test suite\n` +
    `<run-tests>{"file": "src/utils.test.js"}</run-tests> — run a specific test file\n` +
    `<run-tests>{"command": "node script.js"}</run-tests> — run any custom Node.js command`,

  parseInput: (body) => {
    const trimmed = body.trim();
    if (!trimmed || trimmed === "{}") return {};
    return JSON.parse(trimmed);
  },

  summariseInput: (input) => {
    if (input.file) return `test file: ${input.file}`;
    if (input.command) return `command: ${input.command}`;
    return "full test suite";
  },

  execute: async (input, ctx) => {
    const repoPath = ctx.repoPath;

    // Helper: run a shell command and capture output
    const run = (cmd) => {
      try {
        const output = execSync(cmd, {
          cwd: repoPath,
          timeout: 60_000,
          stdio: "pipe",
        }).toString();
        return { ok: true, output };
      } catch (err) {
        const output = [err.stdout?.toString(), err.stderr?.toString()]
          .filter(Boolean)
          .join("\n");
        return { ok: false, output: output || err.message };
      }
    };

    // --- Custom command ---
    if (input.command) {
      const result = run(input.command);
      return {
        kind: result.ok ? "text" : "error",
        value: result.output || "(no output)",
      };
    }

    // --- Detect test runner from package.json ---
    const pkgPath = path.join(repoPath, "package.json");
    let pkg = {};
    if (fs.existsSync(pkgPath)) {
      try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      } catch {}
    }

    const hasScript = (name) => !!pkg.scripts?.[name];
    const hasDep = (name) =>
      !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);

    const detectRunner = () => {
      if (hasScript("test")) return "npm test";
      if (hasDep("jest")) return "npx jest";
      if (hasDep("vitest")) return "npx vitest run";
      if (hasDep("mocha")) return "npx mocha";
      if (hasDep("tap")) return "npx tap";
      return null;
    };

    // --- Specific file ---
    if (input.file) {
      const filePath = path.resolve(repoPath, input.file);

      if (!fs.existsSync(filePath)) {
        return { kind: "error", value: `File not found: ${input.file}` };
      }

      let cmd;
      if (
        hasDep("jest") ||
        (hasScript("test") && pkg.scripts.test?.includes("jest"))
      ) {
        cmd = `npx jest ${input.file} --no-coverage`;
      } else if (hasDep("vitest")) {
        cmd = `npx vitest run ${input.file}`;
      } else if (hasDep("mocha")) {
        cmd = `npx mocha ${input.file}`;
      } else {
        // Fallback: just run it with Node
        cmd = `node ${input.file}`;
      }

      const result = run(cmd);
      return {
        kind: result.ok ? "text" : "error",
        value: result.output || "(no output)",
      };
    }

    // --- Full test suite ---
    const suiteCmd = detectRunner();
    if (!suiteCmd) {
      return {
        kind: "error",
        value:
          "Could not detect a test runner. No 'test' script in package.json and no known test framework (jest, vitest, mocha, tap) found in dependencies.",
      };
    }

    const result = run(suiteCmd);
    return {
      kind: result.ok ? "text" : "error",
      value: result.output || "(no output)",
    };
  },
});
