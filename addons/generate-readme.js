const { defineTool } = require("@ridit/lens-sdk");
const fs = require("fs");

const readmeTemplate = `# {name}

{description}

## Getting Started

\`\`\`bash
bun install
bun run dev
\`\`\`

## Features

- Feature one
- Feature two

## Contributing

Pull requests welcome.`;

defineTool({
  name: "generate-readme",
  description: "Generate a README.md file for the project",
  safe: true,
  permissionLabel: "Generate README",

  systemPromptEntry: () =>
    `<generate-readme>{}</generate-readme> — generate a README.md`,

  parseInput: (body) => {
    const trimmed = body.trim();
    if (!trimmed || trimmed === "{}") return {};
    return JSON.parse(trimmed);
  },

  summariseInput: () => "generate README",

  execute: async (input, ctx) => {
    const repoPath = ctx.repoPath;
    const pkgPath = `${repoPath}/package.json`;
    
    let name = "Project";
    let description = "A brief description.";
    
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        name = pkg.name || name;
        description = pkg.description || description;
      } catch {}
    }
    
    const content = readmeTemplate
      .replace("{name}", name)
      .replace("{description}", description);
    
    fs.writeFileSync(`${repoPath}/README.md`, content);
    
    return {
      kind: "text",
      value: "README.md generated successfully!"
    };
  }
});