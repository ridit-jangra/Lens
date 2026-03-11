import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { RepoCommand } from "./commands/repo";
import { InitCommand } from "./commands/init";
import { ReviewCommand } from "./commands/review";
import { TaskCommand } from "./commands/task";
import { ChatCommand } from "./commands/chat";

const program = new Command();

program
  .command("repo <url>")
  .description("Analyze a remote repository")
  .action((url) => {
    render(<RepoCommand url={url} />);
  });

program
  .command("init")
  .description("Initialize Lens — configure AI providers")
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

program.parse(process.argv);
