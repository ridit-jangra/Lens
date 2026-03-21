// ── commands/commit.tsx ───────────────────────────────────────────────────────
//
// lens commit              — staged diff → AI message → preview → y/e/n
// lens commit --auto       — git add -A → AI message → commit immediately
// lens commit --preview    — generate message, print it, don't commit

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import figures from "figures";
import { ACCENT } from "../colors";
import { ProviderPicker } from "../components/repo/ProviderPicker";
import { callChat } from "../utils/chat";
import type { Provider } from "../types/config";
import type { Message } from "../types/chat";

// ── git helpers ───────────────────────────────────────────────────────────────

function gitRun(cmd: string, cwd: string): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    }).trim();
    return { ok: true, out };
  } catch (e: any) {
    const msg =
      [e.stdout, e.stderr].filter(Boolean).join("\n").trim() || e.message;
    return { ok: false, out: msg };
  }
}

function getStagedDiff(cwd: string): string {
  return gitRun("git diff --staged", cwd).out;
}

function getUnstagedDiff(cwd: string): string {
  const tracked = gitRun("git diff HEAD", cwd).out;
  const untracked = gitRun("git ls-files --others --exclude-standard", cwd)
    .out.split("\n")
    .filter(Boolean)
    .slice(0, 10)
    .map((f) => `=== new file: ${f} ===`)
    .join("\n");
  return [tracked, untracked].filter(Boolean).join("\n\n");
}

function hasStagedChanges(cwd: string): boolean {
  // exit 1 means there ARE staged changes
  return !gitRun("git diff --staged --quiet", cwd).ok;
}

function hasAnyChanges(cwd: string): boolean {
  return gitRun("git status --porcelain", cwd).out.trim().length > 0;
}

// ── split detection ───────────────────────────────────────────────────────────

function detectSplitOpportunity(diff: string): string[] {
  const fileMatches = [...diff.matchAll(/^diff --git a\/.+ b\/(.+)$/gm)];
  const files = fileMatches.map((m) => m[1]!);
  if (files.length <= 3) return [];

  const groups = new Map<string, string[]>();
  for (const f of files) {
    const parts = f.split("/");
    const group =
      parts[0] === "src" && parts.length > 1 ? parts[1]! : parts[0]!;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(f);
  }

  const meaningful = [...groups.entries()].filter(([, fs]) => fs.length >= 2);
  return meaningful.length >= 2
    ? meaningful.map(([g, fs]) => `${g}/ (${fs.length} files)`)
    : [];
}

// ── AI generation ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert at writing conventional commit messages.
Given a git diff, analyze the changes and write a single commit message.

Rules:
- Use conventional commits format: type(scope): description
- Types: feat, fix, refactor, perf, docs, style, test, chore, ci, build
- First line: max 72 chars, imperative mood (add, fix, update — not added/fixed)
- After the first line, add a blank line then bullet points for each logical change
- Bullet format: "- <what changed and why>"
- Group related changes into 2–5 bullets max
- Be specific — mention file names, feature names, component names
- No markdown, no backticks, no code blocks
- Output ONLY the commit message, nothing else

Example output:
feat(editor): add syntax highlighting for TypeScript

- add Monaco tokenizer for .ts and .tsx files
- configure theme tokens to match dark mode palette
- expose highlight API for external extensions`;

async function generateCommitMessage(
  provider: Provider,
  diff: string,
): Promise<string> {
  const msgs: Message[] = [
    {
      role: "user",
      content: `Write a conventional commit message for this diff:\n\n${diff.slice(0, 8000)}`,
      type: "text",
    },
  ];
  const raw = await callChat(provider, SYSTEM_PROMPT, msgs);
  return typeof raw === "string" ? raw.trim() : "chore: update files";
}

// ── helpers ───────────────────────────────────────────────────────────────────

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const PHRASES = [
  "reading your crimes…",
  "sniffing the diff…",
  "crafting the perfect message…",
  "turning chaos into conventional commits…",
  "pretending this was intentional…",
  "72 chars or bust…",
  "making main proud…",
  "git blame: not it…",
  "this commit brought to you by AI…",
];

function randomPhrase() {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)]!;
}

// ── phases ────────────────────────────────────────────────────────────────────

type Phase =
  | { type: "pick-provider" }
  | { type: "checking" }
  | { type: "no-changes" }
  | { type: "no-staged"; hasUnstaged: boolean }
  | { type: "staging" }
  | { type: "generating"; phrase: string }
  | { type: "preview"; message: string; splitGroups: string[]; diff: string }
  | { type: "editing"; message: string; diff: string }
  | { type: "committing"; message: string }
  | { type: "done"; message: string; hash: string }
  | { type: "preview-only"; message: string }
  | { type: "error"; message: string };

// ── CommitRunner ──────────────────────────────────────────────────────────────

function CommitRunner({
  cwd,
  provider,
  auto,
  preview,
}: {
  cwd: string;
  provider: Provider;
  auto: boolean;
  preview: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ type: "checking" });
  const [phraseText, setPhraseText] = useState(randomPhrase());

  useEffect(() => {
    if (phase.type !== "generating") return;
    const id = setInterval(() => setPhraseText(randomPhrase()), 2800);
    return () => clearInterval(id);
  }, [phase.type]);

  useEffect(() => {
    (async () => {
      // Check git repo
      if (!gitRun("git rev-parse --git-dir", cwd).ok) {
        setPhase({ type: "error", message: "not a git repository" });
        return;
      }

      // --auto: stage everything first
      if (auto) {
        if (!hasAnyChanges(cwd)) {
          setPhase({ type: "no-changes" });
          return;
        }
        setPhase({ type: "staging" });
        gitRun("git add -A", cwd);
      }

      // Check staged
      if (!hasStagedChanges(cwd)) {
        const unstaged = hasAnyChanges(cwd);
        setPhase({ type: "no-staged", hasUnstaged: unstaged });
        return;
      }

      // Get diff
      const diff = getStagedDiff(cwd) || getUnstagedDiff(cwd);
      if (!diff.trim()) {
        setPhase({ type: "no-changes" });
        return;
      }

      // Generate
      setPhase({ type: "generating", phrase: phraseText });
      try {
        const message = await generateCommitMessage(provider, diff);
        const splitGroups = detectSplitOpportunity(diff);

        if (preview) {
          setPhase({ type: "preview-only", message });
          return;
        }

        if (auto) {
          setPhase({ type: "committing", message });
          const r = gitRun(`git commit -m ${JSON.stringify(message)}`, cwd);
          if (!r.ok) {
            setPhase({ type: "error", message: r.out });
            return;
          }
          const hash = gitRun("git rev-parse --short HEAD", cwd).out || "?";
          setPhase({ type: "done", message, hash });
          return;
        }

        setPhase({ type: "preview", message, splitGroups, diff });
      } catch (e: any) {
        setPhase({
          type: "error",
          message: `AI error: ${e.message ?? String(e)}`,
        });
      }
    })();
  }, []);

  useInput((inp, key) => {
    if (phase.type === "preview") {
      if (inp === "y" || inp === "Y" || key.return) {
        setPhase({ type: "committing", message: phase.message });
        const r = gitRun(`git commit -m ${JSON.stringify(phase.message)}`, cwd);
        if (!r.ok) {
          setPhase({ type: "error", message: r.out });
          return;
        }
        const hash = gitRun("git rev-parse --short HEAD", cwd).out || "?";
        setPhase({ type: "done", message: phase.message, hash });
        return;
      }
      if (inp === "e" || inp === "E") {
        setPhase({
          type: "editing",
          message: phase.message,
          diff: phase.diff,
        });
        return;
      }
      if (inp === "n" || inp === "N" || key.escape) {
        process.exit(0);
      }
    }

    if (phase.type === "editing" && key.escape) {
      setPhase((prev) =>
        prev.type === "editing"
          ? {
              type: "preview",
              message: prev.message,
              splitGroups: [],
              diff: prev.diff,
            }
          : prev,
      );
    }

    if (
      (phase.type === "done" ||
        phase.type === "no-changes" ||
        phase.type === "no-staged" ||
        phase.type === "preview-only" ||
        phase.type === "error") &&
      (key.return || key.escape || inp === "q")
    ) {
      process.exit(0);
    }
  });

  const w = process.stdout.columns ?? 80;
  const div = "─".repeat(w);

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box gap={2} marginBottom={1}>
        <Text color={ACCENT} bold>
          ◈ COMMIT
        </Text>
        <Text color="gray" dimColor>
          {cwd}
        </Text>
      </Box>
      <Text color="gray" dimColor>
        {div}
      </Text>

      {(phase.type === "checking" || phase.type === "staging") && (
        <Box gap={1} marginTop={1}>
          <Text color={ACCENT}>*</Text>
          <Text color="gray" dimColor>
            {phase.type === "staging"
              ? "staging all changes…"
              : "checking changes…"}
          </Text>
        </Box>
      )}

      {phase.type === "no-changes" && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Box gap={1}>
            <Text color="yellow">{figures.warning}</Text>
            <Text color="white">nothing to commit — working tree is clean</Text>
          </Box>
        </Box>
      )}

      {phase.type === "no-staged" && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Box gap={1}>
            <Text color="yellow">{figures.warning}</Text>
            <Text color="white">no staged changes found</Text>
          </Box>
          {phase.hasUnstaged && (
            <Box flexDirection="column" marginLeft={2} gap={1}>
              <Text color="gray" dimColor>
                you have unstaged changes. stage them first:
              </Text>
              <Text color="gray" dimColor>
                {"  "}
                <Text color={ACCENT}>git add {"<files>"}</Text>
                {"  "}or{"  "}
                <Text color={ACCENT}>lens commit --auto</Text>
              </Text>
            </Box>
          )}
        </Box>
      )}

      {phase.type === "generating" && (
        <Box gap={1} marginTop={1}>
          <Text color={ACCENT}>●</Text>
          <Text color="gray" dimColor>
            {phraseText}
          </Text>
        </Box>
      )}

      {phase.type === "preview" && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Text color={ACCENT} bold>
            GENERATED MESSAGE
          </Text>
          <Box
            flexDirection="column"
            marginLeft={2}
            marginTop={1}
            marginBottom={1}
          >
            {phase.message.split("\n").map((line, i) => (
              <Text key={i} color={i === 0 ? "white" : "gray"} bold={i === 0}>
                {line || " "}
              </Text>
            ))}
          </Box>

          {phase.splitGroups.length > 0 && (
            <Box flexDirection="column" marginLeft={2} marginBottom={1}>
              <Text color="yellow" dimColor>
                ⚡ large diff — consider splitting into{" "}
                {phase.splitGroups.length} commits:
              </Text>
              {phase.splitGroups.map((g, i) => (
                <Text key={i} color="gray" dimColor>
                  {"  · "}
                  {g}
                </Text>
              ))}
            </Box>
          )}

          <Text color="gray" dimColor>
            {div}
          </Text>
          <Box gap={3} marginTop={1}>
            <Text color="green">y/enter commit</Text>
            <Text color="cyan">e edit</Text>
            <Text color="gray" dimColor>
              n/esc cancel
            </Text>
          </Box>
        </Box>
      )}

      {phase.type === "editing" && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Text color={ACCENT} bold>
            EDIT MESSAGE
          </Text>
          <Box marginLeft={2} marginTop={1} flexDirection="column" gap={1}>
            <TextInput
              value={phase.message}
              onChange={(msg) =>
                setPhase((prev) =>
                  prev.type === "editing" ? { ...prev, message: msg } : prev,
                )
              }
              onSubmit={(msg) =>
                setPhase((prev) =>
                  prev.type === "editing"
                    ? {
                        type: "preview",
                        message: msg,
                        splitGroups: [],
                        diff: prev.diff,
                      }
                    : prev,
                )
              }
            />
            <Text color="gray" dimColor>
              enter confirm · esc back
            </Text>
          </Box>
        </Box>
      )}

      {phase.type === "committing" && (
        <Box gap={1} marginTop={1}>
          <Text color={ACCENT}>*</Text>
          <Text color="gray" dimColor>
            committing…
          </Text>
        </Box>
      )}

      {phase.type === "done" && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Box gap={2}>
            <Text color="green">{figures.tick}</Text>
            <Text color={ACCENT}>{phase.hash}</Text>
            <Text color="white" bold>
              {trunc(phase.message.split("\n")[0]!, 65)}
            </Text>
          </Box>
          {phase.message
            .split("\n")
            .slice(2)
            .filter(Boolean)
            .map((line, i) => (
              <Text key={i} color="gray" dimColor>
                {line}
              </Text>
            ))}
          <Text color="gray" dimColor>
            press any key to exit
          </Text>
        </Box>
      )}

      {phase.type === "preview-only" && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Text color={ACCENT} bold>
            GENERATED MESSAGE
          </Text>
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            {phase.message.split("\n").map((line, i) => (
              <Text key={i} color={i === 0 ? "white" : "gray"} bold={i === 0}>
                {line || " "}
              </Text>
            ))}
          </Box>
          <Text color="gray" dimColor>
            (preview only — not committed)
          </Text>
        </Box>
      )}

      {phase.type === "error" && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Box gap={1}>
            <Text color="red">{figures.cross}</Text>
            <Text color="white">{phase.message.split("\n")[0]}</Text>
          </Box>
          {phase.message
            .split("\n")
            .slice(1)
            .map((line, i) => (
              <Text key={i} color="gray" dimColor>
                {line}
              </Text>
            ))}
        </Box>
      )}
    </Box>
  );
}

// ── CommitCommand ─────────────────────────────────────────────────────────────

interface Props {
  path: string;
  auto: boolean;
  preview: boolean;
}

export function CommitCommand({ path: inputPath, auto, preview }: Props) {
  const cwd = path.resolve(inputPath);
  const [provider, setProvider] = useState<Provider | null>(null);

  if (!existsSync(cwd)) {
    return (
      <Box marginTop={1}>
        <Text color="red">
          {figures.cross} path not found: {cwd}
        </Text>
      </Box>
    );
  }

  if (!provider) {
    return <ProviderPicker onDone={setProvider} />;
  }

  return (
    <CommitRunner cwd={cwd} provider={provider} auto={auto} preview={preview} />
  );
}
