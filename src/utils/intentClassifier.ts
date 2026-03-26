export type Intent = "readonly" | "mutating" | "any";

const READONLY_PATTERNS: RegExp[] = [
  /\b(list|ls|dir|show|display|print|dump)\b/i,
  /\bwhat(('?s| is| are| does)\b| files| folder)/i,
  /\b(folder|directory|file) (structure|tree|layout|contents?)\b/i,
  /\bexplore\b/i,

  /\b(read|open|view|look at|check out|inspect|peek)\b/i,
  /\b(explain|describe|summarize|summarise|tell me about|walk me through)\b/i,
  /\bhow does\b/i,
  /\bwhat('?s| is) (in|inside|this|that|the)\b/i,

  /\b(find|search|grep|locate|where is|where are)\b/i,
  /\b(look for|scan|trace)\b/i,

  /\bunderstand\b/i,
  /\bshow me (how|what|where|why)\b/i,
];

const MUTATING_PATTERNS: RegExp[] = [
  /\b(write|create|make|generate|add|build|scaffold|init|initialize|setup|set up)\b/i,
  /\b(new file|new folder|new component|new page|new route)\b/i,

  /\b(edit|modify|update|change|refactor|rename|move|migrate)\b/i,
  /\b(fix|patch|resolve|correct|debug|repair)\b/i,
  /\b(implement|add .+ to|insert|inject|append|prepend)\b/i,

  /\b(delete|remove|drop|clean ?up|purge|wipe)\b/i,

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
