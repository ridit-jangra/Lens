export const FEW_SHOT_MESSAGES: { role: string; content: string }[] = [
  // ── create new file directly ──────────────────────────────────────────────
  {
    role: "user",
    content: "this codebase doesn't have a readme",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "README.md", "content": "# Project\\n\\nA brief description.\\n\\n## Getting Started\\n\\n```bash\\nbun install\\nbun run dev\\n```"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to README.md:\n\nWritten: /repo/README.md (10 lines, 128 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "Done — README.md has been created.",
  },

  // ── fix a single file (read once, write once, done) ───────────────────────
  {
    role: "user",
    content: "fix the bug in addons/clean-cache.js",
  },
  {
    role: "assistant",
    content: "<read-file>addons/clean-cache.js</read-file>",
  },
  {
    role: "user",
    content:
      'Here is the output from read-file of addons/clean-cache.js:\n\nFile: addons/clean-cache.js (42 lines)\n\nconst { defineTool } = require("@ridit/lens-sdk");\ndefineTool({ name: "clean-cache", execute: async (_, ctx) => { const { shell } = ctx.tools; await shell("rm -rf node_modules"); } });\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "addons/clean-cache.js", "content": "const { defineTool } = require(\\"@ridit/lens-sdk\\");\\nconst { execSync } = require(\\"child_process\\");\\n\\ndefineTool({\\n  name: \\"clean-cache\\",\\n  description: \\"Clean node_modules and bun cache\\",\\n  safe: false,\\n  permissionLabel: \\"Clean cache\\",\\n  systemPromptEntry: () => \\"<clean-cache>{}</clean-cache> — clean node_modules and bun cache\\",\\n  parseInput: () => ({}),\\n  summariseInput: () => \\"clean cache\\",\\n  execute: async (_, ctx) => {\\n    try {\\n      execSync(\\"rm -rf node_modules\\", { cwd: ctx.repoPath, stdio: \\"pipe\\" });\\n      return { kind: \\"text\\", value: \\"Cache cleaned!\\" };\\n    } catch (err) {\\n      return { kind: \\"error\\", value: err.message };\\n    }\\n  },\\n});"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to addons/clean-cache.js:\n\nWritten: /repo/addons/clean-cache.js (20 lines, 480 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "Done — clean-cache.js fixed. Now uses execSync instead of ctx.tools.shell.",
  },

  // ── modify existing file (read first, then write) ─────────────────────────
  {
    role: "user",
    content: "add a logout button to src/components/Header.tsx",
  },
  {
    role: "assistant",
    content: "<read-file>src/components/Header.tsx</read-file>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-file of src/components/Header.tsx:\n\nFile: src/components/Header.tsx (42 lines)\n\nimport React from 'react';\n// ... existing content ...\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      '<changes>\n{"summary": "Add logout button to Header — preserves all existing content", "patches": [{"path": "src/components/Header.tsx", "content": "// complete file with logout button added", "isNew": false}]}\n</changes>',
  },
  {
    role: "user",
    content:
      "Here is the output from changes:\n\nChanges applied.\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "Done — logout button added to Header.tsx.",
  },

  // ── fix multiple files (read-files first, write each once) ────────────────
  {
    role: "user",
    content: "fix addons/a.js, addons/b.js and addons/c.js",
  },
  {
    role: "assistant",
    content:
      '<read-files>\n["addons/a.js", "addons/b.js", "addons/c.js"]\n</read-files>',
  },
  {
    role: "user",
    content:
      "Here is the output from read-files:\n\n=== addons/a.js ===\nmodule.exports = { name: 'a', run: async () => {} }\n\n=== addons/b.js ===\nmodule.exports = { name: 'b', run: async () => {} }\n\n=== addons/c.js ===\nmodule.exports = { name: 'c', run: async () => {} }\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "addons/a.js", "content": "const { defineTool } = require(\\"@ridit/lens-sdk\\");\\n\\ndefineTool({\\n  name: \\"a\\",\\n  description: \\"Does A\\",\\n  safe: true,\\n  permissionLabel: \\"Run A\\",\\n  systemPromptEntry: () => \\"<a>{}</a> — run A\\",\\n  parseInput: () => ({}),\\n  summariseInput: () => \\"a\\",\\n  execute: async (_, ctx) => ({ kind: \\"text\\", value: \\"A done!\\" }),\\n});"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to addons/a.js:\n\nWritten: /repo/addons/a.js (12 lines, 280 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "addons/b.js", "content": "const { defineTool } = require(\\"@ridit/lens-sdk\\");\\n\\ndefineTool({\\n  name: \\"b\\",\\n  description: \\"Does B\\",\\n  safe: true,\\n  permissionLabel: \\"Run B\\",\\n  systemPromptEntry: () => \\"<b>{}</b> — run B\\",\\n  parseInput: () => ({}),\\n  summariseInput: () => \\"b\\",\\n  execute: async (_, ctx) => ({ kind: \\"text\\", value: \\"B done!\\" }),\\n});"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to addons/b.js:\n\nWritten: /repo/addons/b.js (12 lines, 280 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "addons/c.js", "content": "const { defineTool } = require(\\"@ridit/lens-sdk\\");\\n\\ndefineTool({\\n  name: \\"c\\",\\n  description: \\"Does C\\",\\n  safe: true,\\n  permissionLabel: \\"Run C\\",\\n  systemPromptEntry: () => \\"<c>{}</c> — run C\\",\\n  parseInput: () => ({}),\\n  summariseInput: () => \\"c\\",\\n  execute: async (_, ctx) => ({ kind: \\"text\\", value: \\"C done!\\" }),\\n});"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to addons/c.js:\n\nWritten: /repo/addons/c.js (12 lines, 280 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "Done — fixed all three addons. Each now uses defineTool from @ridit/lens-sdk correctly.",
  },

  // ── scaffold a project ────────────────────────────────────────────────────
  {
    role: "user",
    content:
      "scaffold a new project called myapp with package.json and src/index.tsx",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "myapp/package.json", "content": "{\\n  \\"name\\": \\"myapp\\",\\n  \\"version\\": \\"1.0.0\\",\\n  \\"scripts\\": { \\"dev\\": \\"bun run src/index.tsx\\" },\\n  \\"dependencies\\": { \\"react\\": \\"^18.2.0\\", \\"ink\\": \\"^4.4.1\\" }\\n}"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to myapp/package.json:\n\nWritten: /repo/myapp/package.json (8 lines, 180 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "myapp/src/index.tsx", "content": "/** @jsxImportSource react */\\nimport React from \'react\';\\nimport { render, Text } from \'ink\';\\n\\nfunction App() {\\n  return <Text>Hello from myapp!</Text>;\\n}\\n\\nrender(<App />);"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to myapp/src/index.tsx:\n\nWritten: /repo/myapp/src/index.tsx (9 lines, 210 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "Done — scaffolded myapp/package.json and myapp/src/index.tsx. Run cd myapp && bun install to get started.",
  },

  // ── grep ──────────────────────────────────────────────────────────────────
  {
    role: "user",
    content: "find all usages of useInput in the codebase",
  },
  {
    role: "assistant",
    content: '<grep>\n{"pattern": "useInput", "glob": "src/**/*.tsx"}\n</grep>',
  },
  {
    role: "user",
    content:
      'Here is the output from grep for "useInput":\n\ngrep /useInput/ src/**/*.tsx — 2 match(es) in 1 file(s)\n\nsrc/components/chat/ChatRunner.tsx\n  5: import { useInput } from "ink";\n  210: useInput((input, key) => {\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content:
      "useInput is used in src/components/chat/ChatRunner.tsx — imported on line 5 and called on line 210.",
  },

  // ── shell ─────────────────────────────────────────────────────────────────
  {
    role: "user",
    content: "what node version am I on",
  },
  {
    role: "assistant",
    content: "<shell>node -v</shell>",
  },
  {
    role: "user",
    content:
      "Here is the output from shell command `node -v`:\n\nv20.11.0\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "You're on Node.js v20.11.0.",
  },

  // ── memory ────────────────────────────────────────────────────────────────
  {
    role: "user",
    content: "remember that we always use bun in this project",
  },
  {
    role: "assistant",
    content:
      "<memory-add>Project uses bun as the package manager and runtime, not npm or node</memory-add>\n\nGot it — I'll always use bun for this project.",
  },

  // ── addon format ──────────────────────────────────────────────────────────
  {
    role: "user",
    content: "add a new addon that prints hello world",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "addons/hello-world.js", "content": "const { defineTool } = require(\\"@ridit/lens-sdk\\");\\n\\ndefineTool({\\n  name: \\"hello-world\\",\\n  description: \\"Prints hello world\\",\\n  safe: true,\\n  permissionLabel: \\"Print hello world\\",\\n  systemPromptEntry: () => \\"<hello-world>{}</hello-world> — print hello world\\",\\n  parseInput: () => ({}),\\n  summariseInput: () => \\"hello world\\",\\n  execute: async (_, ctx) => ({ kind: \\"text\\", value: \\"Hello world!\\" }),\\n});"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to addons/hello-world.js:\n\nWritten: /repo/addons/hello-world.js (14 lines, 320 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "Done — addons/hello-world.js created using defineTool from @ridit/lens-sdk.",
  },
];
