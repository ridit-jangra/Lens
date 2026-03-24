/**
 * Classifies user message intent to scope which tools the LLM is allowed to use.
 *
 * readonly  → only read/search/fetch tools exposed (no write, delete, shell)
 * mutating  → all tools exposed
 * any       → all tools exposed (ambiguous / can't tell)
 */
export type Intent = "readonly" | "mutating" | "any";

const READONLY_PATTERNS: RegExp[] = [
  // listing / exploring
  /\b(list|ls|dir|show|display|print|dump)\b/i,
  /\bwhat(('?s| is| are| does)\b| files| folder)/i,
  /\b(folder|directory|file) (structure|tree|layout|contents?)\b/i,
  /\bexplore\b/i,

  // reading / explaining
  /\b(read|open|view|look at|check out|inspect|peek)\b/i,
  /\b(explain|describe|summarize|summarise|tell me about|walk me through)\b/i,
  /\bhow does\b/i,
  /\bwhat('?s| is) (in|inside|this|that|the)\b/i,

  // searching
  /\b(find|search|grep|locate|where is|where are)\b/i,
  /\b(look for|scan|trace)\b/i,

  // understanding
  /\bunderstand\b/i,
  /\bshow me (how|what|where|why)\b/i,
];

const MUTATING_PATTERNS: RegExp[] = [
  // writing
  /\b(write|create|make|generate|add|build|scaffold|init|initialize|setup|set up)\b/i,
  /\b(new file|new folder|new component|new page|new route)\b/i,

  // editing
  /\b(edit|modify|update|change|refactor|rename|move|migrate)\b/i,
  /\b(fix|patch|resolve|correct|debug|repair)\b/i,
  /\b(implement|add .+ to|insert|inject|append|prepend)\b/i,

  // deleting
  /\b(delete|remove|drop|clean ?up|purge|wipe)\b/i,

  // running
  /\b(run|execute|install|deploy|build|test|start|launch|compile|lint|format)\b/i,
];

export function classifyIntent(userMessage: string): Intent {
  const text = userMessage.trim();

  const mutatingScore = MUTATING_PATTERNS.filter((p) => p.test(text)).length;
  const readonlyScore = READONLY_PATTERNS.filter((p) => p.test(text)).length;

  if (mutatingScore === 0 && readonlyScore > 0) return "readonly";
  if (mutatingScore > 0) return "mutating";
  return "any";
}
