import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { ChatCommand } from "./commands/chat";
import { TimelineCommand } from "./commands/timeline";
import { RepoCommand } from "./commands/repo";
import { ProviderCommand } from "./commands/provider";
import {
  chat,
  createSession,
  createSessionWithId,
  addMessage,
  appendMessages,
  getMessages,
  getSystemPrompt,
  saveSession,
  loadSession,
  getLatestSession,
  addProvider,
  setActiveProvider,
  removeProvider,
  getConfiguredProviders,
  getActiveModelName,
  type Provider,
} from "@ridit/lens-core";

// ── Headless chat (--dev or --single + --prompt, no Ink UI) ──────────────────

// Safe (read-only) tools that never need approval
const HEADLESS_SAFE_TOOLS = new Set(["read", "grep", "ls", "remember", "search", "scrape"]);

// Words that mean "approve the last denied operation"
const APPROVAL_WORDS = new Set(["execute", "yes", "proceed", "do it", "confirm", "allow", "ok", "approve"]);

// Scan session messages for the last denied tool call (tool result containing "Permission denied")
function getLastDeniedAction(messages: ReturnType<typeof getMessages>): { tool: string; description: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || msg.role !== "tool") continue;
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const part of content) {
      if (
        typeof part === "object" && part !== null &&
        "type" in part && (part as { type: string }).type === "tool-result"
      ) {
        const r = part as unknown as { type: string; toolCallId: string; result: unknown };
        const result = r.result;
        const text = typeof result === "string" ? result : (result !== undefined ? JSON.stringify(result) : "");
        if (text.includes("Permission denied")) {
          // find the matching tool call in the assistant message before this
          for (let j = i - 1; j >= 0; j--) {
            const prev = messages[j];
            if (!prev || prev.role !== "assistant") continue;
            const calls = Array.isArray(prev.content) ? prev.content : [];
            for (const c of calls) {
              if (typeof c === "object" && c !== null && "type" in c && (c as { type: string }).type === "tool-call") {
                const call = c as { type: string; toolName: string; args: Record<string, unknown> };
                const desc =
                  call.toolName === "bash" ? String(call.args.command ?? call.args.cmd ?? "") :
                  String(call.args.path ?? call.args.file_path ?? "");
                return { tool: call.toolName, description: desc || call.toolName };
              }
            }
            break;
          }
        }
      }
    }
  }
  return null;
}

async function runHeadless(opts: {
  path: string;
  prompt?: string;
  sessionId?: string;
  single?: boolean;
  forceAll?: boolean;
  runtimeTools?: string;
  resume?: boolean;
}) {
  const repoPath = opts.path;

  let session = opts.sessionId
    ? (loadSession(opts.sessionId) ?? createSessionWithId(opts.sessionId, repoPath))
    : opts.single
      ? (getLatestSession(repoPath) ?? createSession(repoPath))
      : createSession(repoPath);

  if (opts.resume) {
    // Rewind the session: strip the last denied tool-call (assistant message),
    // its "Permission denied" tool result, and the assistant's text response after it.
    // This leaves the session ending at the last successful state so the agent
    // can re-attempt the denied tool with forceAll: true.
    const msgs = getMessages(session);
    let trimAt = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      if (!msg || msg.role !== "tool") continue;
      const content = Array.isArray(msg.content) ? msg.content : [];
      const isDenied = content.some(
        (p: unknown) =>
          typeof p === "object" && p !== null &&
          "type" in p && (p as { type: string }).type === "tool-result" &&
          "result" in p && typeof (p as { result: unknown }).result === "string" &&
          ((p as { result: string }).result).includes("Permission denied"),
      );
      if (isDenied) {
        // Find the assistant message immediately before this tool result (the tool-call message)
        for (let j = i - 1; j >= 0; j--) {
          if (msgs[j]?.role === "assistant") {
            trimAt = j;
            break;
          }
        }
        break;
      }
    }
    if (trimAt >= 0) {
      session = { ...session, messages: msgs.slice(0, trimAt) };
    }
    // Save trimmed session so context is clean for this run
    if (!opts.single || opts.sessionId) saveSession(session);
  } else {
    // if user is approving a prior denial, make the intent unambiguous
    let prompt = opts.prompt!;
    if (opts.forceAll && APPROVAL_WORDS.has(prompt.trim().toLowerCase())) {
      const pending = getLastDeniedAction(getMessages(session));
      if (pending) {
        prompt = `Proceed with the previously denied operation: use the ${pending.tool} tool on "${pending.description}".`;
      }
    }

    session = addMessage(session, "user", prompt);
    // save now so context is available on follow-up messages even if we exit early
    if (!opts.single || opts.sessionId) saveSession(session);
  }

  const toolLog: { tool: string; args: unknown; result: unknown }[] = [];
  const denied: { tool: string; description: string }[] = [];

  // runtime tools are explicitly user-provided — always approve them
  const runtimeToolNames = new Set<string>();
  if (opts.runtimeTools) {
    try {
      const raw = JSON.parse(require("fs").readFileSync(opts.runtimeTools, "utf-8"));
      if (Array.isArray(raw)) raw.forEach((t: { name: string }) => runtimeToolNames.add(t.name));
    } catch { /* ignore parse errors */ }
  }

  await chat({
    messages: getMessages(session),
    system: getSystemPrompt(repoPath),
    runtimeTools: opts.runtimeTools,
    // 2 steps: 1 tool attempt (or denial) + 1 text response
    maxSteps: opts.forceAll ? 50 : 2,
    onBeforeToolCall: (tool, args) => {
      if (opts.forceAll || HEADLESS_SAFE_TOOLS.has(tool) || runtimeToolNames.has(tool)) return Promise.resolve(true);
      // record denial — model will respond naturally explaining what it needs
      const a = args as Record<string, unknown>;
      const description =
        tool === "bash" ? String(a.command ?? a.cmd ?? "") :
        tool === "write" ? String(a.path ?? a.file_path ?? "") :
        String(a.path ?? a.file_path ?? "");
      denied.push({ tool, description: description || tool });
      return Promise.resolve(false);
    },
    onChunk: () => {},
    onToolCall: (tool, args) => toolLog.push({ tool, args, result: null }),
    onToolResult: (tool, result) => {
      const entry = [...toolLog].reverse().find((t) => t.tool === tool && t.result === null);
      if (entry) entry.result = result;
    },
    onFinish: (message, responseMessages, model) => {
      session = appendMessages(session, responseMessages);
      if (!opts.single || opts.sessionId) saveSession(session);

      const output: Record<string, unknown> = {
        message,
        model,
        sessionId: session.id,
        tools: toolLog,
      };
      if (denied.length > 0) output.permissionRequired = denied;

      process.stdout.write(JSON.stringify(output) + "\n");
      process.exit(denied.length > 0 ? 2 : 0);
    },
  });
}

// ── Commander setup ───────────────────────────────────────────────────────────

// enablePositionalOptions ensures options after a subcommand name are parsed by
// the subcommand, not the root — prevents root --dev from shadowing sub --dev.
const program = new Command().enablePositionalOptions();

// ── chat ──────────────────────────────────────────────────────────────────────

program
  .command("chat")
  .description("Chat with your codebase — ask questions or make changes")
  .option("-p, --path <path>", "Path to the repo", ".")
  .option("-d, --dev", "Output structured JSON (no UI)")
  .option("--single", "Single-shot: run one message then exit")
  .option("--session <id>", "Resume session by ID, or create one with that ID")
  .option("--id <id>", "Alias for --session")
  .option("--force-all", "Auto-approve all tools")
  .option("--prompt <text>", "Run a prompt non-interactively")
  .option("--resume", "Resume from last permission-denied tool call (no new prompt needed)")
  .option("--runtime-tools <path>", "path to runtime tools JSON file")
  .action(
    (opts: {
      path: string;
      dev?: boolean;
      single?: boolean;
      session?: string;
      id?: string;
      forceAll?: boolean;
      prompt?: string;
      resume?: boolean;
      runtimeTools?: string;
    }) => {
      const sessionId = opts.session ?? opts.id;
      // headless: dev+prompt, single+prompt, or --resume → no UI, output JSON and exit
      if ((opts.prompt || opts.resume) && (opts.dev || opts.single)) {
        runHeadless({ path: opts.path, prompt: opts.prompt, sessionId, single: opts.single, forceAll: opts.forceAll ?? opts.resume, runtimeTools: opts.runtimeTools, resume: opts.resume });
        return;
      }
      render(
        <ChatCommand
          path={opts.path}
          autoForce={opts.forceAll ?? false}
          dev={opts.dev ?? false}
          single={opts.single ?? false}
          sessionId={sessionId}
          initialMessage={opts.prompt}
          runtimeTools={opts.runtimeTools}
        />,
      );
    },
  );

// ── commit ────────────────────────────────────────────────────────────────────

program
  .command("commit [files...]")
  .description("Generate a smart conventional commit message from staged changes")
  .option("-p, --path <path>", "Path to the repo", ".")
  .option("--auto", "Stage all changes and commit without confirmation")
  .option("--push", "Push to remote after committing")
  .action(
    (files: string[], opts: { path: string; auto: boolean; push: boolean }) => {
      const fileList =
        (files ?? []).length > 0 ? ` for files: ${files.join(", ")}` : "";
      const extra = opts.auto ? " Commit automatically without confirmation." : "";
      const push = opts.push ? " Then push to remote." : "";
      render(
        <ChatCommand
          path={opts.path}
          autoForce={opts.auto ?? false}
          initialMessage={`Generate a smart conventional commit message from the staged changes${fileList}.${extra}${push}`}
        />,
      );
    },
  );

// ── review ────────────────────────────────────────────────────────────────────

program
  .command("review [path]")
  .description("Review a local codebase")
  .action((inputPath: string) => {
    render(
      <ChatCommand
        path={inputPath ?? "."}
        initialMessage="Review this codebase thoroughly. Identify strengths, weaknesses, potential bugs, and improvement opportunities."
      />,
    );
  });

// ── task ──────────────────────────────────────────────────────────────────────

program
  .command("task <text>")
  .description("Apply a natural language change to the codebase")
  .option("-p, --path <path>", "Path to the repo", ".")
  .action((text: string, opts: { path: string }) => {
    render(<ChatCommand path={opts.path} autoForce initialMessage={text} />);
  });

// ── repo ──────────────────────────────────────────────────────────────────────

program
  .command("repo <url>")
  .description("Analyze a remote repository")
  .action((url: string) => {
    render(<RepoCommand url={url} />);
  });

// ── timeline ──────────────────────────────────────────────────────────────────

program
  .command("timeline")
  .description("Explore your code history — see commits, changes, and evolution")
  .option("-p, --path <path>", "Path to the repo", ".")
  .action((opts: { path: string }) => {
    render(<TimelineCommand path={opts.path} />);
  });

// ── provider ──────────────────────────────────────────────────────────────────

program
  .command("provider")
  .description("Configure an AI provider")
  .option("--provider <name>", "Provider to add/update (anthropic, openai, google, groq, openrouter, ollama, custom)")
  .option("--api-key <key>", "API key")
  .option("--base-url <url>", "Base URL (ollama/custom)")
  .option("--model <model>", "Model to use")
  .option("--remove <name>", "Remove a configured provider")
  .option("--switch <name>", "Switch the active provider")
  .option("--list", "List all configured providers")
  .option("-d, --dev", "Output result as JSON")
  .action((opts: {
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    remove?: string;
    switch?: string;
    list?: boolean;
    dev?: boolean;
  }) => {
    const out = (data: object) => {
      if (opts.dev) {
        process.stdout.write(JSON.stringify(data) + "\n");
      } else {
        Object.entries(data).forEach(([k, v]) => v !== undefined && console.log(`✓ ${k}: ${v}`));
      }
    };

    if (opts.list) {
      const configured = getConfiguredProviders();
      if (opts.dev) {
        process.stdout.write(JSON.stringify({ providers: configured }) + "\n");
      } else if (configured.length === 0) {
        console.log("No providers configured.");
      } else {
        configured.forEach((p) => console.log(`  ${p}`));
      }
      process.exit(0);
    }

    if (opts.remove) {
      removeProvider(opts.remove as Provider);
      out({ removed: opts.remove });
      process.exit(0);
    }

    if (opts.switch) {
      setActiveProvider(opts.switch as Provider);
      out({ active: opts.switch });
      process.exit(0);
    }

    if (opts.provider && opts.model) {
      addProvider(opts.provider as Provider, {
        apiKey: opts.apiKey ?? "ollama",
        model: opts.model,
        baseURL: opts.baseUrl,
      });
      setActiveProvider(opts.provider as Provider);
      out({ provider: opts.provider, model: opts.model, baseUrl: opts.baseUrl });
      process.exit(0);
    }

    render(<ProviderCommand />);
  });

// ── run ───────────────────────────────────────────────────────────────────────

program
  .command("run <cmd>")
  .description("Run your dev server. Lens watches and helps fix errors")
  .option("-p, --path <path>", "Path to the repo", ".")
  .option("--fix-all", "Auto-apply fixes as errors are detected")
  .action((cmd: string, opts: { path: string; fixAll: boolean }) => {
    render(
      <ChatCommand
        path={opts.path}
        autoForce={opts.fixAll ?? false}
        initialMessage={`Run this command and help me fix any errors that appear: \`${cmd}\``}
      />,
    );
  });

// ── Default: no subcommand → parse flags with a fresh Command, open chat ──────

const firstArg = process.argv[2];
if (!firstArg || firstArg.startsWith("-")) {
  // Use a separate Command so root flags don't interfere with subcommands above
  const defaultFlags = new Command()
    .option("-p, --path <path>", "Path to the repo", ".")
    .option("--session <id>", "Resume session by ID")
    .option("--single", "Single-shot mode")
    .option("--prompt <text>", "Run a prompt")
    .option("-d, --dev", "Output JSON (no UI)")
    .option("--force-all", "Auto-approve all tools")
    .option("--resume", "Resume from last permission-denied tool call")
    .allowUnknownOption()
    .exitOverride();

  try { defaultFlags.parse(process.argv); } catch { /* ignore unknown options */ }

  const opts = defaultFlags.opts<{
    path: string;
    session?: string;
    single?: boolean;
    prompt?: string;
    dev?: boolean;
    forceAll?: boolean;
    resume?: boolean;
  }>();

  if ((opts.prompt || opts.resume) && (opts.dev || opts.single)) {
    runHeadless({ path: opts.path ?? ".", prompt: opts.prompt, sessionId: opts.session, single: opts.single, forceAll: opts.forceAll ?? opts.resume, resume: opts.resume });
  } else {
    render(
      <ChatCommand
        path={opts.path ?? "."}
        autoForce={opts.forceAll ?? false}
        dev={opts.dev ?? false}
        single={opts.single ?? false}
        sessionId={opts.session}
        initialMessage={opts.prompt}
      />,
    );
  }
} else {
  program.parse(process.argv);
}
