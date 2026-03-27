import { tool } from "ai";
import { z } from "zod";
import { loadGlobalMemory, saveGlobalMemory } from "../memory";

export const remember = tool({
  description:
    "save something to global memory ONLY when the user EXPLICITLY says 'remember that...' or 'don't forget...'. do NOT call this automatically.",
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
