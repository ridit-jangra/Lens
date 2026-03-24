import type { Tool, ToolTag } from "@ridit/lens-sdk";
import type { Intent } from "../intentClassifier";

/**
 * Broad capability category for a tool.
 * Used to filter the system prompt based on classified user intent.
 *
 * "read"   — safe, purely observational (read-file, read-folder, grep, etc.)
 * "net"    — outbound network (fetch, search, clone, open-url)
 * "write"  — creates or overwrites file content (write-file, changes, generate-pdf)
 * "delete" — destructive removal (delete-file, delete-folder)
 * "shell"  — arbitrary shell execution
 */

/** Tools allowed for each intent level */
const INTENT_ALLOWED: Record<Intent, ToolTag[]> = {
  readonly: ["read", "net"],
  mutating: ["read", "net", "write", "delete", "shell"],
  any: ["read", "net", "write", "delete", "shell"],
};

class ToolRegistry {
  private tools = new Map<string, Tool<unknown>>();

  register<T>(tool: Tool<T>): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: "${tool.name}"`);
    }
    this.tools.set(tool.name, tool as Tool<unknown>);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool<unknown> | undefined {
    return this.tools.get(name);
  }

  all(): Tool<unknown>[] {
    return Array.from(this.tools.values());
  }

  names(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Returns tool names that are allowed for the given intent.
   * Falls back to all names when a tool has no tag (legacy / addons).
   */
  namesForIntent(intent: Intent): string[] {
    const allowed = new Set(INTENT_ALLOWED[intent]);
    return Array.from(this.tools.values())
      .filter((t) => {
        const tag = (t as any).tag as ToolTag | undefined;
        // No tag = addon / unknown → always allow (conservative)
        if (!tag) return true;
        return allowed.has(tag);
      })
      .map((t) => t.name);
  }

  /**
   * Build the TOOLS section of the system prompt from all registered tools,
   * optionally scoped to a specific intent.
   *
   * When intent is "readonly", write/delete/shell tools are omitted entirely
   * so the LLM never sees them and can't hallucinate calls to them.
   */
  buildSystemPromptSection(intent: Intent = "any"): string {
    const allowed = new Set(INTENT_ALLOWED[intent]);

    const visible = Array.from(this.tools.values()).filter((t) => {
      const tag = (t as any).tag as ToolTag | undefined;
      if (!tag) return true; // addon without tag → always show
      return allowed.has(tag);
    });

    const lines: string[] = ["## TOOLS\n"];

    if (intent === "readonly") {
      lines.push(
        `You have ${visible.length} tools available for this read-only request. ` +
          `Do NOT attempt to write, delete, or run shell commands — ` +
          `those tools are not available right now.\n`,
      );
    } else {
      lines.push(
        `You have exactly ${visible.length} tools. To use a tool you MUST wrap it ` +
          `in the exact XML tags shown below — no other format will work.\n`,
      );
    }

    let i = 1;
    for (const tool of visible) {
      lines.push(tool.systemPromptEntry(i++));
    }
    return lines.join("\n");
  }
}

export const registry = new ToolRegistry();

(globalThis as any).__lens_registry = registry;
