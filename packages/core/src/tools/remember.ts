import { tool } from "ai";
import { z } from "zod";
import { loadGlobalMemory, saveGlobalMemory } from "../memory";

export const remember = tool({
  description:
    "save something to global memory to remember across all codebases and sessions. use this when the user explicitly asks you to remember something, or when you notice something important about the user's preferences or coding style. before saving, check existing memories and avoid saving duplicate or similar entries.",
  parameters: z.object({
    content: z.string().describe("what to remember"),
  }),
  execute: async ({ content }) => {
    const existing = loadGlobalMemory();
    const lines =
      existing
        ?.split("\n")
        .map((l) => l.replace("- ", "").toLowerCase().trim()) ?? [];

    const isDuplicate = lines.some(
      (line) =>
        line.includes(content.toLowerCase().trim()) ||
        content.toLowerCase().trim().includes(line),
    );

    if (isDuplicate) return `already in memory: ${content}`;

    const updated = existing ? `${existing}\n- ${content}` : `- ${content}`;
    saveGlobalMemory(updated);
    return `remembered: ${content}`;
  },
});
