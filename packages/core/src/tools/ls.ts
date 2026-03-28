import { tool } from "ai";
import { z } from "zod";
import { readdirSync, statSync } from "fs";
import { join } from "path";

export const ls = tool({
  description: "list files and directories at a path",
  parameters: z.object({
    path: z.string().optional().describe("path to list, default ."),
  }),
  execute: async ({ path = "." }) => {
    try {
      const entries = readdirSync(path);
      return entries
        .map((entry) => {
          const isDir = statSync(join(path, entry)).isDirectory();
          if (isDir) return `🗀 ${entry}`;
          const ext = entry.slice(entry.lastIndexOf(".")).toLowerCase();
          const icon =
            [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext) ? "⌨" :
            [".json", ".yaml", ".yml", ".toml", ".env"].includes(ext) ? "⚙" :
            [".md", ".mdx", ".txt", ".rst"].includes(ext) ? "≡" :
            [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp"].includes(ext) ? "⬚" :
            [".css", ".scss", ".sass", ".less"].includes(ext) ? "◈" :
            [".html", ".htm", ".xml"].includes(ext) ? "⌂" :
            [".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd"].includes(ext) ? "▷" :
            [".zip", ".tar", ".gz", ".rar", ".7z"].includes(ext) ? "⊟" :
            [".exe", ".msi", ".dmg"].includes(ext) ? "▶" :
            "☰";
          return `${icon} ${entry}`;
        })
        .join("\n");
    } catch {
      return `error listing ${path}`;
    }
  },
});
