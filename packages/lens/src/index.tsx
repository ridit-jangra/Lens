import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { ChatCommand } from "./commands/chat";

const program = new Command();

program
  .command("chat")
  .description("Chat with your codebase — ask questions or make changes")
  .option("-p, --path <path>", "Path to the repo", ".")
  .option(
    "--auto-force",
    "Start with force-all mode enabled (auto-approves all tools)",
  )
  .action((opts: { path: string; autoForce: boolean }) => {
    render(
      <ChatCommand path={opts.path} autoForce={opts.autoForce ?? false} />,
    );
  });

program
  .command("commit [files...]")
  .description(
    "Generate a smart conventional commit message from staged changes",
  )
  .option("-p, --path <path>", "Path to the repo", ".")
  .option("--auto", "Stage all changes and commit without confirmation")
  .option("--push", "Push to remote after committing")
  .action(
    (
      files: string[],
      opts: { path: string; auto: boolean; push: boolean },
    ) => {
      const fileList =
        (files ?? []).length > 0 ? ` for files: ${files.join(", ")}` : "";
      const extra = opts.auto
        ? " Commit automatically without confirmation."
        : "";
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

program
  .command("review [path]")
  .description("Review a local codebase")
  .action((inputPath: string) => {
    const repoPath = inputPath ?? ".";
    render(
      <ChatCommand
        path={repoPath}
        initialMessage="Review this codebase thoroughly. Identify strengths, weaknesses, potential bugs, and improvement opportunities."
      />,
    );
  });

program
  .command("task <text>")
  .description("Apply a natural language change to the codebase")
  .option("-p, --path <path>", "Path to the repo", ".")
  .action((text: string, opts: { path: string }) => {
    render(<ChatCommand path={opts.path} autoForce initialMessage={text} />);
  });

program
  .command("repo <url>")
  .description("Analyze a remote repository")
  .action((url: string) => {
    render(
      <ChatCommand
        path="."
        initialMessage={`I want to analyze the repository at ${url}. Please fetch and explore it, then give me an overview of what it does, the tech stack, and key architectural decisions.`}
      />,
    );
  });

program
  .command("timeline")
  .description(
    "Explore your code history — see commits, changes, and evolution",
  )
  .option("-p, --path <path>", "Path to the repo", ".")
  .action((opts: { path: string }) => {
    render(
      <ChatCommand
        path={opts.path}
        initialMessage="Show me the recent commit history for this repo. Summarize what changed in each commit and highlight any important trends or patterns."
      />,
    );
  });

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

// Default: no subcommand → open chat
if (process.argv.length <= 2 || process.argv[2]?.startsWith("-")) {
  render(<ChatCommand path="." />);
} else {
  program.parse(process.argv);
}
