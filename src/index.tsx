import React from "react";
import "./utils/tools/registry";
import { render } from "ink";
import { Command } from "commander";
import { RepoCommand } from "./commands/repo";
import { InitCommand } from "./commands/provider";
import { ReviewCommand } from "./commands/review";
import { TaskCommand } from "./commands/task";
import { ChatCommand } from "./commands/chat";
import { TimelineCommand } from "./commands/timeline";
import { CommitCommand } from "./commands/commit";
import { registerBuiltins } from "./utils/tools/builtins";
import { loadAddons } from "./utils/addons/loadAddons";

registerBuiltins();
await loadAddons();

const program = new Command();

program
  .command("repo <url>")
  .description("Analyze a remote repository")
  .action((url) => {
    render(<RepoCommand url={url} />);
  });

program
  .command("provider")
  .description("Configure AI providers")
  .action(() => {
    render(<InitCommand />);
  });

program
  .command("review [path]")
  .description("Review a local codebase")
  .action((inputPath) => {
    render(<ReviewCommand path={inputPath ?? "."} />);
  });

program
  .command("task <text>")
  .description("Apply a natural language change to the codebase")
  .option("-p, --path <path>", "Path to the repo", ".")
  .action((text: string, opts: { path: string }) => {
    render(<TaskCommand prompt={text} path={opts.path} />);
  });

program
  .command("chat")
  .description("Chat with your codebase — ask questions or make changes")
  .option("-p, --path <path>", "Path to the repo", ".")
  .action((opts: { path: string }) => {
    render(<ChatCommand path={opts.path} />);
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
  .command("commit [files...]")
  .description(
    "Generate a smart conventional commit message from staged changes or specific files",
  )
  .option("-p, --path <path>", "Path to the repo", ".")
  .option(
    "--auto",
    "Stage all changes (or the given files) and commit without confirmation",
  )
  .option("--preview", "Show the generated message without committing")
  .action(
    (
      files: string[],
      opts: { path: string; auto: boolean; preview: boolean },
    ) => {
      render(
        <CommitCommand
          path={opts.path}
          files={files ?? []}
          auto={opts.auto ?? false}
          preview={opts.preview ?? false}
        />,
      );
    },
  );

program.parse(process.argv);
