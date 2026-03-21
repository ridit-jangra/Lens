import type { Tool } from "@ridit/lens-sdk";

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
   * Build the TOOLS section of the system prompt from all registered tools.
   */
  buildSystemPromptSection(): string {
    const lines: string[] = ["## TOOLS\n"];
    lines.push(
      "You have exactly " +
        this.tools.size +
        " tools. To use a tool you MUST wrap it in the exact XML tags shown below — no other format will work.\n",
    );
    let i = 1;
    for (const tool of this.tools.values()) {
      lines.push(tool.systemPromptEntry(i++));
    }
    return lines.join("\n");
  }
}

export const registry = new ToolRegistry();

(globalThis as any).__lens_registry = registry;
