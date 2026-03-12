export const FEW_SHOT_MESSAGES: { role: string; content: string }[] = [
  // ── delete / open / pdf ───────────────────────────────────────────────────
  {
    role: "user",
    content: "delete src/old-component.tsx",
  },
  {
    role: "assistant",
    content: "<delete-file>src/old-component.tsx</delete-file>",
  },
  {
    role: "user",
    content:
      "Here is the output from delete-file of src/old-component.tsx:\n\nDeleted: /repo/src/old-component.tsx\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "Done — `src/old-component.tsx` has been deleted.",
  },
  {
    role: "user",
    content: "delete the legacy folder",
  },
  {
    role: "assistant",
    content: "<delete-folder>src/legacy</delete-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from delete-folder of src/legacy:\n\nDeleted folder: /repo/src/legacy\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "Done — the `src/legacy` folder and all its contents have been deleted.",
  },
  {
    role: "user",
    content: "open https://github.com/microsoft/typescript",
  },
  {
    role: "assistant",
    content: "<open-url>https://github.com/microsoft/typescript</open-url>",
  },
  {
    role: "user",
    content:
      "Here is the output from open-url https://github.com/microsoft/typescript:\n\nOpened: https://github.com/microsoft/typescript\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "Opened the TypeScript GitHub page in your browser.",
  },
  {
    role: "user",
    content:
      "generate a PDF report about the project and save it to docs/report.pdf",
  },
  {
    role: "assistant",
    content:
      '<generate-pdf>\n{"path": "docs/report.pdf", "content": "# Project Report\\n\\n## Overview\\n\\nThis document summarizes the project.\\n\\n## Details\\n\\nMore content here."}\n</generate-pdf>',
  },
  {
    role: "user",
    content:
      "Here is the output from generate-pdf to docs/report.pdf:\n\nPDF generated: /repo/docs/report.pdf\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "Done — the PDF report has been saved to `docs/report.pdf`.",
  },

  // ── grep ──────────────────────────────────────────────────────────────────
  {
    role: "user",
    content: 'grep -R "ChatRunner" -n src',
  },
  {
    role: "assistant",
    content: '<grep>\n{"pattern": "ChatRunner", "glob": "src/**/*"}\n</grep>',
  },
  {
    role: "user",
    content:
      'Here is the output from grep for "ChatRunner":\n\ngrep /ChatRunner/ src/**/* — 3 match(es) in 2 file(s)\n\nsrc/index.tsx\n  12: import { ChatRunner } from "./components/chat/ChatRunner";\n\nsrc/components/chat/ChatRunner.tsx\n  1: export const ChatRunner = ...\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content:
      "`ChatRunner` is defined in `src/components/chat/ChatRunner.tsx` and imported in `src/index.tsx`.",
  },
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
      "`useInput` is used in `src/components/chat/ChatRunner.tsx` — imported on line 5 and called on line 210.",
  },

  // ── showing tool usage as an example (bracket notation, NOT real tags) ────
  {
    role: "user",
    content: "show me how to use the read-file tool",
  },
  {
    role: "assistant",
    content:
      "To read a file, emit the tag alone in your response — nothing else on that turn:\n\n```text\n[read-file]src/components/Header.tsx[/read-file]\n```\n\nThe result comes back as the next user message and you can then analyze it.",
  },
  {
    role: "user",
    content: "show me an example of the shell tool",
  },
  {
    role: "assistant",
    content:
      "To run a shell command, emit only the tag:\n\n```text\n[shell]node -v[/shell]\n```\n\nThe stdout/stderr is returned and you can read it in the next turn.",
  },

  // ── read-folder ───────────────────────────────────────────────────────────
  {
    role: "user",
    content: "read src folder",
  },
  {
    role: "assistant",
    content: "<read-folder>src</read-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-folder of src:\n\nFolder: src (4 entries)\n\nFiles:\n  index.ts\n  App.tsx\n\nSubfolders:\n  components/\n  utils/\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "The `src` folder contains `index.ts`, `App.tsx`, plus subfolders `components/` and `utils/`.",
  },
  {
    role: "user",
    content: "what files are in src/components?",
  },
  {
    role: "assistant",
    content: "<read-folder>src/components</read-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-folder of src/components:\n\nFolder: src/components (5 entries)\n\nFiles:\n  Header.tsx\n  Footer.tsx\n  Button.tsx\n\nSubfolders:\n  ui/\n  forms/\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "The `src/components` folder has 3 files — `Header.tsx`, `Footer.tsx`, `Button.tsx` — plus two subfolders: `ui/` and `forms/`.",
  },
  {
    role: "user",
    content: "show me the project structure",
  },
  {
    role: "assistant",
    content: "<read-folder>.</read-folder>",
  },
  {
    role: "user",
    content:
      "Here is the output from read-folder of .:\n\nFolder: . (5 entries)\n\nFiles:\n  package.json\n  tsconfig.json\n  README.md\n\nSubfolders:\n  src/\n  node_modules/\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "The project root has 3 files (`package.json`, `tsconfig.json`, `README.md`) and the `src/` folder for source code.",
  },

  // ── fetch → write → done ─────────────────────────────────────────────────
  {
    role: "user",
    content: "fetch https://api.github.com/repos/microsoft/typescript",
  },
  {
    role: "assistant",
    content: "<fetch>https://api.github.com/repos/microsoft/typescript</fetch>",
  },
  {
    role: "user",
    content:
      'Here is the output from fetch of https://api.github.com/repos/microsoft/typescript:\n\n{"name":"TypeScript","stargazers_count":100000}\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content:
      "Found 1 object with fields: name, stargazers_count. Writing to ts-info.json now.",
  },
  {
    role: "user",
    content: "ok go ahead",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "ts-info.json", "content": "{\"name\":\"TypeScript\",\"stars\":100000}"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to ts-info.json:\n\nWritten: /repo/ts-info.json (1 lines, 44 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "Done — `ts-info.json` has been saved.",
  },

  // ── write it to a file → done ─────────────────────────────────────────────
  {
    role: "user",
    content: "write it to a file called hello.py",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "hello.py", "content": "# hello.py\\nprint(\'hello\')"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to hello.py:\n\nWritten: /repo/hello.py (2 lines, 32 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "Done — `hello.py` has been written.",
  },

  // ── read before write ─────────────────────────────────────────────────────
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
      "Here is the output from read-file of src/components/Header.tsx:\n\nFile: src/components/Header.tsx (42 lines)\n\nimport React from 'react';\n// ... full file content ...\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      '<changes>\n{"summary": "Add logout button to Header — preserves all existing nav items and imports", "patches": [{"path": "src/components/Header.tsx", "content": "// complete file with logout button added", "isNew": false}]}\n</changes>',
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
    content: "You're running Node.js v20.11.0.",
  },

  // ── clone ─────────────────────────────────────────────────────────────────
  {
    role: "user",
    content: "clone https://github.com/facebook/react",
  },
  {
    role: "assistant",
    content: "<clone>https://github.com/facebook/react</clone>",
  },
  {
    role: "user",
    content:
      "Cloned react to /tmp/react — 2847 files available. You can now read files from this repo using read-file with paths relative to /tmp/react.",
  },
  {
    role: "assistant",
    content:
      "Cloned! The React repo has 2847 files. I can read source files, explain how it works, or suggest improvements — just ask.",
  },

  // ── search ────────────────────────────────────────────────────────────────
  {
    role: "user",
    content: "what does the ?? operator do in typescript",
  },
  {
    role: "assistant",
    content: "<search>nullish coalescing operator ?? TypeScript</search>",
  },
  {
    role: "user",
    content:
      'Here is the output from web search for "nullish coalescing operator ?? TypeScript":\n\nAnswer: The ?? operator returns the right-hand side when the left-hand side is null or undefined.\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content:
      "The `??` operator is the nullish coalescing operator. It returns the right side only when the left side is `null` or `undefined`.",
  },

  // ── scaffolding ───────────────────────────────────────────────────────────
  {
    role: "user",
    content:
      "scaffold a new project called myapp with package.json and src/index.ts",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "myapp/package.json", "content": "{\"name\":\"myapp\",\"version\":\"1.0.0\"}"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to myapp/package.json:\n\nWritten: /repo/myapp/package.json (1 lines, 38 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "myapp/src/index.ts", "content": "console.log(\'hello\')"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to myapp/src/index.ts:\n\nWritten: /repo/myapp/src/index.ts (1 lines, 20 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content:
      "Done — scaffolded `myapp/package.json` and `myapp/src/index.ts`. Run `cd myapp && npm install` to get started.",
  },

  // ── memory-add example ────────────────────────────────────────────────────
  {
    role: "user",
    content: "remember that we always use bun in this project",
  },
  {
    role: "assistant",
    content:
      "<memory-add>Project uses bun as the package manager and runtime, not npm or node</memory-add>\n\nGot it — I'll always use bun for this project.",
  },
  {
    role: "user",
    content: "forget the bun preference",
  },
  {
    role: "assistant",
    content:
      "<memory-delete>MEMORY_ID</memory-delete>\n\nDone — removed that memory.",
  },
];
