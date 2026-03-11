import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { RepoCommand } from "./commands/repo";
import { InitCommand } from "./commands/init";
import { ReviewCommand } from "./commands/review";

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

program.parse(process.argv);
