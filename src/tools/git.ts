import { execSync } from "child_process";
import type { Tool } from "@ridit/lens-sdk";
import { registry } from "../utils/tools/registry";

function gitRun(cmd: string, cwd: string): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    }).trim();
    return { ok: true, out: out || "(done)" };
  } catch (e: any) {
    const msg =
      [e.stdout, e.stderr].filter(Boolean).join("\n").trim() || e.message;
    return { ok: false, out: msg };
  }
}

type GitArgs = string;

function parseArgs(body: string): GitArgs | null {
  return body ?? "";
}

export const gitStatusTool: Tool<GitArgs> = {
  name: "git-status",
  description: "show working tree status",
  safe: true,
  permissionLabel: "git status",
  systemPromptEntry: (i) =>
    `### ${i}. git-status — show working tree status (staged, unstaged, untracked)\n<git-status></git-status>`,
  parseInput: parseArgs,
  summariseInput: () => "git status",
  execute: async (_args, ctx) => {
    const r = gitRun("git status --short", ctx.repoPath);
    return {
      kind: "text",
      value: r.out || "nothing to commit, working tree clean",
    };
  },
};

export const gitLogTool: Tool<GitArgs> = {
  name: "git-log",
  description: "show commit log",
  safe: true,
  permissionLabel: "git log",
  systemPromptEntry: (i) =>
    `### ${i}. git-log — show commit log with optional flags\n<git-log>-20</git-log>\n<git-log>--author=Ridit --since=1.week</git-log>\n<git-log>--pretty=format:"%h %ad %s" --date=short</git-log>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git log ${args}`.trim(),
  execute: async (args, ctx) => {
    const r = gitRun(`git log --oneline ${args}`.trim(), ctx.repoPath);
    return { kind: "text", value: r.out.slice(0, 4000) || "(no commits)" };
  },
};

export const gitDiffTool: Tool<GitArgs> = {
  name: "git-diff",
  description: "show changes between commits, working tree, or staged files",
  safe: true,
  permissionLabel: "git diff",
  systemPromptEntry: (i) =>
    `### ${i}. git-diff — show changes\n<git-diff></git-diff>\n<git-diff>--cached</git-diff>\n<git-diff>HEAD~1 HEAD</git-diff>\n<git-diff>-- src/foo.ts</git-diff>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git diff ${args}`.trim(),
  execute: async (args, ctx) => {
    const r = gitRun(`git diff ${args}`.trim(), ctx.repoPath);
    return { kind: "text", value: r.out.slice(0, 5000) || "(no diff)" };
  },
};

export const gitShowTool: Tool<GitArgs> = {
  name: "git-show",
  description: "show a commit's details and stat",
  safe: true,
  permissionLabel: "git show",
  systemPromptEntry: (i) =>
    `### ${i}. git-show — show a commit's details\n<git-show>HEAD</git-show>\n<git-show>abc1234</git-show>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git show ${args}`.trim(),
  execute: async (args, ctx) => {
    const r = gitRun(`git show --stat ${args}`.trim(), ctx.repoPath);
    return { kind: "text", value: r.out.slice(0, 4000) };
  },
};

export const gitBranchTool: Tool<GitArgs> = {
  name: "git-branch",
  description: "list branches",
  safe: true,
  permissionLabel: "git branch",
  systemPromptEntry: (i) =>
    `### ${i}. git-branch — list branches\n<git-branch></git-branch>\n<git-branch>-a</git-branch>\n<git-branch>--show-current</git-branch>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git branch ${args}`.trim(),
  execute: async (args, ctx) => {
    const r = gitRun(`git branch ${args}`.trim(), ctx.repoPath);
    return { kind: "text", value: r.out || "(no branches)" };
  },
};

export const gitRemoteTool: Tool<GitArgs> = {
  name: "git-remote",
  description: "list or inspect remotes",
  safe: true,
  permissionLabel: "git remote",
  systemPromptEntry: (i) =>
    `### ${i}. git-remote — list remotes\n<git-remote>-v</git-remote>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git remote ${args}`.trim(),
  execute: async (args, ctx) => {
    const r = gitRun(`git remote ${args}`.trim(), ctx.repoPath);
    return { kind: "text", value: r.out || "(no remotes)" };
  },
};

export const gitTagTool: Tool<GitArgs> = {
  name: "git-tag",
  description: "list tags",
  safe: true,
  permissionLabel: "git tag",
  systemPromptEntry: (i) =>
    `### ${i}. git-tag — list tags\n<git-tag></git-tag>\n<git-tag>-l "v2.*"</git-tag>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git tag ${args}`.trim(),
  execute: async (args, ctx) => {
    const r = gitRun(`git tag ${args}`.trim(), ctx.repoPath);
    return { kind: "text", value: r.out || "(no tags)" };
  },
};

export const gitBlameTool: Tool<GitArgs> = {
  name: "git-blame",
  description: "show who last modified each line of a file",
  safe: true,
  permissionLabel: "git blame",
  systemPromptEntry: (i) =>
    `### ${i}. git-blame — show per-line authorship\n<git-blame>src/main.ts</git-blame>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git blame ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim()) return { kind: "text", value: "Error: pass a file path" };
    const r = gitRun(`git blame --line-porcelain ${args.trim()}`, ctx.repoPath);
    if (!r.ok) return { kind: "text", value: `Error: ${r.out}` };

    const lines = r.out.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.startsWith("author ") && lines[i + 9]?.startsWith("\t")) {
        out.push(`${lines[i]!.slice(7).trim()}: ${lines[i + 9]!.slice(1)}`);
        i += 10;
      }
      if (out.length >= 80) {
        out.push("… (truncated)");
        break;
      }
    }
    return {
      kind: "text",
      value: out.join("\n").slice(0, 4000) || r.out.slice(0, 4000),
    };
  },
};

export const gitStashListTool: Tool<GitArgs> = {
  name: "git-stash-list",
  description: "list stashed changes",
  safe: true,
  permissionLabel: "git stash list",
  systemPromptEntry: (i) =>
    `### ${i}. git-stash-list — list stashes\n<git-stash-list></git-stash-list>`,
  parseInput: parseArgs,
  summariseInput: () => "git stash list",
  execute: async (_args, ctx) => {
    const r = gitRun("git stash list", ctx.repoPath);
    return { kind: "text", value: r.out || "(no stashes)" };
  },
};

export const gitAddTool: Tool<GitArgs> = {
  name: "git-add",
  description: "stage files for commit",
  safe: false,
  permissionLabel: "git add",
  systemPromptEntry: (i) =>
    `### ${i}. git-add — stage files\n<git-add>-A</git-add>\n<git-add>src/foo.ts src/bar.ts</git-add>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git add ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim()) return { kind: "text", value: "Error: pass paths or -A" };
    const r = gitRun(`git add ${args}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? `staged: ${args.trim()}` : `Error: ${r.out}`,
    };
  },
};

export const gitCommitTool: Tool<GitArgs> = {
  name: "git-commit",
  description: "commit staged changes with a message",
  safe: false,
  permissionLabel: "git commit",
  systemPromptEntry: (i) =>
    `### ${i}. git-commit — commit staged changes (stage with git-add first)\n<git-commit>feat: add dark mode toggle</git-commit>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git commit -m "${args.slice(0, 60)}"`,
  execute: async (args, ctx) => {
    const msg = args.replace(/^["']|["']$/g, "").trim();
    if (!msg) return { kind: "text", value: "Error: pass a commit message" };
    const r = gitRun(`git commit -m ${JSON.stringify(msg)}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? `committed: ${msg}` : `Error: ${r.out}`,
    };
  },
};

export const gitCommitAmendTool: Tool<GitArgs> = {
  name: "git-commit-amend",
  description: "amend the last commit message",
  safe: false,
  permissionLabel: "git commit --amend",
  systemPromptEntry: (i) =>
    `### ${i}. git-commit-amend — amend the last commit message\n<git-commit-amend>fix: correct typo in header</git-commit-amend>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git commit --amend "${args.slice(0, 60)}"`,
  execute: async (args, ctx) => {
    const msg = args.replace(/^["']|["']$/g, "").trim();
    if (!msg) return { kind: "text", value: "Error: pass a new message" };
    const r = gitRun(
      `git commit --amend --no-edit -m ${JSON.stringify(msg)}`,
      ctx.repoPath,
    );
    return {
      kind: "text",
      value: r.ok ? `amended: ${msg}` : `Error: ${r.out}`,
    };
  },
};

export const gitRevertTool: Tool<GitArgs> = {
  name: "git-revert",
  description:
    "revert a commit by hash (creates a new revert commit, history preserved)",
  safe: false,
  permissionLabel: "git revert",
  systemPromptEntry: (i) =>
    `### ${i}. git-revert — revert a commit (safe, creates new commit)\n<git-revert>abc1234</git-revert>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git revert ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim())
      return { kind: "text", value: "Error: pass a commit hash" };
    const r = gitRun(`git revert --no-edit ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? `reverted: ${args.trim()}` : `Error: ${r.out}`,
    };
  },
};

export const gitResetTool: Tool<GitArgs> = {
  name: "git-reset",
  description: "reset HEAD or unstage files",
  safe: false,
  permissionLabel: "git reset",
  systemPromptEntry: (i) =>
    `### ${i}. git-reset — reset HEAD or unstage files\n<git-reset>--soft HEAD~1</git-reset>\n<git-reset>HEAD src/foo.ts</git-reset>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git reset ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim()) return { kind: "text", value: "Error: pass reset args" };
    const r = gitRun(`git reset ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? r.out || "(done)" : `Error: ${r.out}`,
    };
  },
};

export const gitCheckoutTool: Tool<GitArgs> = {
  name: "git-checkout",
  description: "switch branches or restore files",
  safe: false,
  permissionLabel: "git checkout",
  systemPromptEntry: (i) =>
    `### ${i}. git-checkout — switch branch or restore file\n<git-checkout>main</git-checkout>\n<git-checkout>-- src/foo.ts</git-checkout>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git checkout ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim())
      return { kind: "text", value: "Error: pass a branch or path" };
    const r = gitRun(`git checkout ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? r.out || "(done)" : `Error: ${r.out}`,
    };
  },
};

export const gitSwitchTool: Tool<GitArgs> = {
  name: "git-switch",
  description: "switch or create branches",
  safe: false,
  permissionLabel: "git switch",
  systemPromptEntry: (i) =>
    `### ${i}. git-switch — switch or create branches\n<git-switch>main</git-switch>\n<git-switch>-c feature/my-branch</git-switch>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git switch ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim())
      return { kind: "text", value: "Error: pass a branch name" };
    const r = gitRun(`git switch ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? r.out || "(done)" : `Error: ${r.out}`,
    };
  },
};

export const gitMergeTool: Tool<GitArgs> = {
  name: "git-merge",
  description: "merge a branch into the current branch",
  safe: false,
  permissionLabel: "git merge",
  systemPromptEntry: (i) =>
    `### ${i}. git-merge — merge a branch into HEAD\n<git-merge>feature/my-branch</git-merge>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git merge ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim())
      return { kind: "text", value: "Error: pass a branch name" };
    const r = gitRun(`git merge ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? r.out || "(done)" : `Error: ${r.out}`,
    };
  },
};

export const gitPullTool: Tool<GitArgs> = {
  name: "git-pull",
  description: "pull from remote",
  safe: false,
  permissionLabel: "git pull",
  systemPromptEntry: (i) =>
    `### ${i}. git-pull — pull from remote\n<git-pull></git-pull>\n<git-pull>origin main</git-pull>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git pull ${args}`.trim(),
  execute: async (args, ctx) => {
    const r = gitRun(`git pull ${args}`.trim(), ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? r.out || "(up to date)" : `Error: ${r.out}`,
    };
  },
};

export const gitPushTool: Tool<GitArgs> = {
  name: "git-push",
  description: "push commits to remote",
  safe: false,
  permissionLabel: "git push",
  systemPromptEntry: (i) =>
    `### ${i}. git-push — push to remote\n<git-push></git-push>\n<git-push>origin main</git-push>\n<git-push>--force-with-lease</git-push>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git push ${args}`.trim(),
  execute: async (args, ctx) => {
    const r = gitRun(`git push ${args}`.trim(), ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? r.out || "(done)" : `Error: ${r.out}`,
    };
  },
};

export const gitStashTool: Tool<GitArgs> = {
  name: "git-stash",
  description: "stash or apply stashed changes",
  safe: false,
  permissionLabel: "git stash",
  systemPromptEntry: (i) =>
    `### ${i}. git-stash — stash/apply/pop/drop changes\n<git-stash>push -m "work in progress"</git-stash>\n<git-stash>pop</git-stash>\n<git-stash>drop stash@{0}</git-stash>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git stash ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim())
      return { kind: "text", value: "Error: pass a stash subcommand" };
    const r = gitRun(`git stash ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? r.out || "(done)" : `Error: ${r.out}`,
    };
  },
};

export const gitBranchCreateTool: Tool<GitArgs> = {
  name: "git-branch-create",
  description: "create a new branch without switching to it",
  safe: false,
  permissionLabel: "git branch (create)",
  systemPromptEntry: (i) =>
    `### ${i}. git-branch-create — create a branch\n<git-branch-create>feature/my-feature</git-branch-create>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git branch ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim())
      return { kind: "text", value: "Error: pass a branch name" };
    const r = gitRun(`git branch ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? `created: ${args.trim()}` : `Error: ${r.out}`,
    };
  },
};

export const gitBranchDeleteTool: Tool<GitArgs> = {
  name: "git-branch-delete",
  description: "delete a branch",
  safe: false,
  permissionLabel: "git branch -d",
  systemPromptEntry: (i) =>
    `### ${i}. git-branch-delete — delete a branch\n<git-branch-delete>feature/old</git-branch-delete>\n<git-branch-delete>-D feature/old</git-branch-delete>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git branch -d ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim())
      return { kind: "text", value: "Error: pass a branch name" };
    const isForce = args.trim().startsWith("-D");
    const flag = isForce ? "-D" : "-d";
    const name = args.trim().replace(/^-D\s*/, "");
    const r = gitRun(`git branch ${flag} ${name}`.trim(), ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? `deleted: ${name}` : `Error: ${r.out}`,
    };
  },
};

export const gitCherryPickTool: Tool<GitArgs> = {
  name: "git-cherry-pick",
  description: "apply a specific commit from another branch",
  safe: false,
  permissionLabel: "git cherry-pick",
  systemPromptEntry: (i) =>
    `### ${i}. git-cherry-pick — apply a commit by hash\n<git-cherry-pick>abc1234</git-cherry-pick>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git cherry-pick ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim())
      return { kind: "text", value: "Error: pass a commit hash" };
    const r = gitRun(`git cherry-pick ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok
        ? r.out || `cherry-picked: ${args.trim()}`
        : `Error: ${r.out}`,
    };
  },
};

export const gitTagCreateTool: Tool<GitArgs> = {
  name: "git-tag-create",
  description: "create a lightweight or annotated tag",
  safe: false,
  permissionLabel: "git tag (create)",
  systemPromptEntry: (i) =>
    `### ${i}. git-tag-create — create a tag\n<git-tag-create>v1.0.0</git-tag-create>\n<git-tag-create>v1.0.0 -m "release 1.0.0"</git-tag-create>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git tag ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim()) return { kind: "text", value: "Error: pass a tag name" };
    const r = gitRun(`git tag ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? `tagged: ${args.trim().split(" ")[0]}` : `Error: ${r.out}`,
    };
  },
};

export const gitRestoreTool: Tool<GitArgs> = {
  name: "git-restore",
  description:
    "discard working directory changes for a file (cannot be undone)",
  safe: false,
  permissionLabel: "git restore",
  systemPromptEntry: (i) =>
    `### ${i}. git-restore — discard changes in a file (irreversible)\n<git-restore>src/foo.ts</git-restore>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git restore ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim()) return { kind: "text", value: "Error: pass a file path" };
    const r = gitRun(`git restore ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? `restored: ${args.trim()}` : `Error: ${r.out}`,
    };
  },
};

export const gitCleanTool: Tool<GitArgs> = {
  name: "git-clean",
  description: "remove untracked files (cannot be undone)",
  safe: false,
  permissionLabel: "git clean",
  systemPromptEntry: (i) =>
    `### ${i}. git-clean — remove untracked files (irreversible)\n<git-clean>-fd</git-clean>`,
  parseInput: parseArgs,
  summariseInput: (args) => `git clean ${args}`.trim(),
  execute: async (args, ctx) => {
    if (!args.trim())
      return { kind: "text", value: "Error: pass flags like -fd" };
    const r = gitRun(`git clean ${args.trim()}`, ctx.repoPath);
    return {
      kind: "text",
      value: r.ok ? r.out || "(done)" : `Error: ${r.out}`,
    };
  },
};

const ALL_GIT_TOOLS: Tool<GitArgs>[] = [
  gitStatusTool,
  gitLogTool,
  gitDiffTool,
  gitShowTool,
  gitBranchTool,
  gitRemoteTool,
  gitTagTool,
  gitBlameTool,
  gitStashListTool,
  gitAddTool,
  gitCommitTool,
  gitCommitAmendTool,
  gitRevertTool,
  gitResetTool,
  gitCheckoutTool,
  gitSwitchTool,
  gitMergeTool,
  gitPullTool,
  gitPushTool,
  gitStashTool,
  gitBranchCreateTool,
  gitBranchDeleteTool,
  gitCherryPickTool,
  gitTagCreateTool,
  gitRestoreTool,
  gitCleanTool,
];

export function registerGitTools(): void {
  for (const tool of ALL_GIT_TOOLS) {
    registry.register(tool);
  }
}

export function buildGitToolsPromptSection(): string {
  const read = ALL_GIT_TOOLS.filter((t) => t.safe);
  const write = ALL_GIT_TOOLS.filter((t) => !t.safe);

  const lines: string[] = [
    "## Git Tools\n",
    "To use a tool emit its XML tag — the result is returned to you before you continue.\n",
    "### Read-only (auto-approved)",
  ];

  let i = 1;
  for (const t of read) lines.push(t.systemPromptEntry(i++));

  lines.push("\n### Write operations (require user confirmation)");
  for (const t of write) lines.push(t.systemPromptEntry(i++));

  return lines.join("\n");
}
