import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { ChatCommand } from "./commands/chat";
import { TimelineCommand } from "./commands/timeline";
import { RepoCommand } from "./commands/repo";

const program = new Command();

program
  .command("chat")
  .description("Chat with your codebase — ask questions or make changes")
  .option("-p, --path <path>", "Path to the repo", ".")
  .option("-d, --dev", "Output structured JSON for SDK/tooling use")
  .option("--single", "Run in single-shot mode, no session persistence")
  .option("--id <sessionId>", "Resume a specific session by ID")
  .option("--force-all", "Auto-approve all tools, skip confirmation prompts")
  .option("--prompt <text>", "Run a single prompt non-interactively")
  .action(
    (opts: {
      path: string;
      dev?: boolean;
      single?: boolean;
      id?: string;
      forceAll?: boolean;
      prompt?: string;
    }) => {
      render(
        <ChatCommand
          path={opts.path}
          autoForce={opts.forceAll ?? false}
          dev={opts.dev ?? false}
          single={opts.single ?? false}
          sessionId={opts.id}
          initialMessage={opts.prompt}
        />,
      );
    },
  );

program
  .command("commit [files...]")
  .description(
    "Generate a smart conventional commit message from staged changes",
  )
  .option("-p, --path <path>", "Path to the repo", ".")
  .option("--auto", "Stage all changes and commit without confirmation")
  .option("--push", "Push to remote after committing")
  .action(
    (files: string[], opts: { path: string; auto: boolean; push: boolean }) => {
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
    render(
      <ChatCommand
        path={inputPath ?? "."}
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
    render(<RepoCommand url={url} />);
  });

program
  .command("timeline")
  .description(
    "Explore your code history — see commits, changes, and evolution",
  )
  .option("-p, --path <path>", "Path to the repo", ".")
  .action((opts: { path: string }) => {
    render(<TimelineCommand path={opts.path} />);
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

if (process.argv.length <= 2 || process.argv[2]?.startsWith("-")) {
  render(<ChatCommand path="." />);
} else {
  program.parse(process.argv);
}
