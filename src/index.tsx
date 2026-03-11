import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { RepoCommand } from "./commands/repo";
import { InitCommand } from "./commands/init";

const program = new Command();

program
  .command("repo <url>")
  .description("Analyze a repository")
  .action((url) => {
    render(<RepoCommand url={url} />);
  });

program
  .command("init")
  .description("Initialize Lens in the current project")
  .action(() => {
    render(<InitCommand />);
  });

program.parse(process.argv);
