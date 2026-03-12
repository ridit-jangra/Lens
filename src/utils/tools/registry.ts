// ── Tool Plugin System ────────────────────────────────────────────────────────
//
// To create a new tool:
//
//   1. Implement the Tool interface
//   2. Call registry.register(myTool) before the app starts
//
// External addon example:
//
//   import { registry } from "lens/tools/registry";
//   registry.register({ name: "my-tool", ... });

export interface ToolContext {
  repoPath: string;
  /** All messages in the current conversation so far */
  messages: unknown[];
}

export type ToolResult =
  | { kind: "text"; value: string }
  | { kind: "error"; value: string };

export interface Tool<TInput = string> {
  /**
   * Tag name used in XML: <name>...</name>
   * Must be lowercase, hyphens allowed. Must be unique.
   */
  name: string;

  /**
   * Short description shown in system prompt and /help.
   */
  description: string;

  /**
   * System prompt snippet explaining how to invoke this tool.
   * Return the full ### N. name — description block.
   */
  systemPromptEntry(index: number): string;

  /**
   * Parse the raw inner text of the XML tag into a typed input.
   * Throw or return null to signal a parse failure (tool will be skipped).
   */
  parseInput(body: string): TInput | null;

  /**
   * Execute the tool. May be async.
   * Return a ToolResult — the value is fed back to the model as the tool result.
   */
  execute(input: TInput, ctx: ToolContext): Promise<ToolResult> | ToolResult;

  /**
   * Whether this tool is safe to auto-approve (read-only, no side effects).
   * Defaults to false.
   */
  safe?: boolean;

  /**
   * Optional: permission prompt label shown to the user before execution.
   * e.g. "run", "read", "write", "delete"
   * Defaults to the tool name.
   */
  permissionLabel?: string;

  /**
   * Optional: summarise the input for display in the chat history.
   * Defaults to showing the raw input string.
   */
  summariseInput?(input: TInput): string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

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
