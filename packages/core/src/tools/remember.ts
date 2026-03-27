import { tool } from "ai";
import { z } from "zod";
import { loadGlobalMemory, saveGlobalMemory } from "../memory";

export const remember = tool({
  description:
    "save something to global memory to remember across all codebases and sessions. use this when the user explicitly asks you to remember something, or when you notice something important about the user's preferences or coding style.",
  parameters: z.object({
    content: z.string().describe("what to remember"),
  }),
  execute: async ({ content }) => {
    const existing = loadGlobalMemory();
    const updated = existing ? `${existing}\n- ${content}` : `- ${content}`;
    saveGlobalMemory(updated);
    return `remembered: ${content}`;
  },
});
