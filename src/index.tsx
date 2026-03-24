import React from "react";
import "./utils/tools/registry";
import { render } from "ink";
import { Command } from "commander";
import { RepoCommand } from "./commands/repo";
import { InitCommand } from "./commands/provider";
import { ReviewCommand } from "./commands/review";
import { TaskCommand } from "./commands/task";
import { ChatCommand } from "./commands/chat";
import { WatchCommand } from "./commands/watch";
import { TimelineCommand } from "./commands/timeline";
import { CommitCommand } from "./commands/commit";
import { registerBuiltins } from "./utils/tools/builtins";
import { loadAddons } from "./utils/addons/loadAddons";

registerBuiltins();
await loadAddons();

const program = new Command();

console.log("Tip: Star Lens on GitHub ⭐");

program
  .command("stalk <url>")
  .alias("repo")
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
  .command("judge [path]")
  .alias("review")
  .description("Review a local codebase")
  .action((inputPath) => {
    render(<ReviewCommand path={inputPath ?? "."} />);
  });

program
  .command("cook <text>")
  .alias("task")
  .description("Apply a natural language change to the codebase")
  .option("-p, --path <path>", "Path to the repo", ".")
  .action((text: string, opts: { path: string }) => {
    render(<TaskCommand prompt={text} path={opts.path} />);
  });

program
  .command("vibe")
  .alias("chat")
  .description("Chat with your codebase — ask questions or make changes")
  .option("-p, --path <path>", "Path to the repo", ".")
  .action((opts: { path: string }) => {
    render(<ChatCommand path={opts.path} />);
  });

program
  .command("history")
  .alias("timeline")
  .description(
    "Explore your code history — see commits, changes, and evolution",
  )
  .option("-p, --path <path>", "Path to the repo", ".")
  .action((opts: { path: string }) => {
    render(<TimelineCommand path={opts.path} />);
  });

program
  .command("crimes [files...]")
  .alias("commit")
  .description(
    "Generate a smart conventional commit message from staged changes or specific files",
  )
  .option("-p, --path <path>", "Path to the repo", ".")
  .option(
    "--auto",
    "Stage all changes (or the given files) and commit without confirmation",
  )
  .option("--confirm", "Show preview before committing even when using --auto")
  .option("--preview", "Show the generated message without committing")
  .option("--push", "Push to remote after committing")
  .action(
    (
      files: string[],
      opts: {
        path: string;
        auto: boolean;
        confirm: boolean;
        preview: boolean;
        push: boolean;
      },
    ) => {
      render(
        <CommitCommand
          path={opts.path}
          files={files ?? []}
          auto={opts.auto ?? false}
          confirm={opts.confirm ?? false}
          preview={opts.preview ?? false}
          push={opts.push ?? false}
        />,
      );
    },
  );

program
  .command("run <cmd>")
  .alias("spy")
  .description("run a dev command and get AI suggestions for errors")
  .option("-p, --path <path>", "Path to the repo", ".")
  .option("--clean", "Only show AI suggestions, hide raw logs")
  .option("--fix-all", "Auto-apply fixes as errors are detected")
  .option("--auto-restart", "Automatically re-run the command after a crash")
  .option("--prompt <text>", "Extra context for the AI about your project")
  .action(
    (
      cmd: string,
      opts: {
        path: string;
        clean: boolean;
        fixAll: boolean;
        autoRestart: boolean;
        prompt?: string;
      },
    ) => {
      render(
        <WatchCommand
          cmd={cmd}
          path={opts.path}
          clean={opts.clean ?? false}
          fixAll={opts.fixAll ?? false}
          autoRestart={opts.autoRestart ?? false}
          prompt={opts.prompt}
        />,
      );
    },
  );

program.parse(process.argv);
