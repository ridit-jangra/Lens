import React, { useState, useEffect } from "react";
import { Box, useInput } from "ink";
import { StepRow, type Step } from "../components/repo/StepRow";
import { ChatRunner } from "../components/chat/ChatRunner";
import { startCloneRepo } from "../utils/repo";

export function RepoCommand({ url }: { url: string }) {
  const [steps, setSteps] = useState<Step[]>([
    { type: "cloning", status: "pending" },
  ]);
  const [repoPath, setRepoPath] = useState<string | null>(null);

  const updateLastStep = (updated: Step) =>
    setSteps((prev) => [...prev.slice(0, -1), updated]);

  const pushStep = (step: Step) => setSteps((prev) => [...prev, step]);

  const doClone = (forceReclone = false) => {
    startCloneRepo(url, { forceReclone }).then((result) => {
      if (result.done) {
        updateLastStep({ type: "cloning", status: "done" });
        setRepoPath(result.repoPath);
      } else if (!result.done && result.folderExists) {
        updateLastStep({
          type: "folder-exists",
          status: "pending",
          repoPath: result.repoPath,
        });
      } else if (!result.done) {
        updateLastStep({ type: "error", message: result.error ?? "Clone failed" });
      }
    });
  };

  useEffect(() => {
    doClone();
  }, [url]);

  useInput((input) => {
    const last = steps[steps.length - 1];
    if (last?.type !== "folder-exists") return;
    if (input === "y" || input === "Y") {
      updateLastStep({ type: "cloning", status: "pending" });
      doClone(true);
    }
    if (input === "n" || input === "N") {
      updateLastStep({ type: "cloning", status: "done" });
      setRepoPath(last.repoPath);
    }
  });

  return (
    <Box flexDirection="column">
      {steps.map((step, i) => (
        <StepRow key={i} step={step} />
      ))}

      {repoPath && (
        <ChatRunner
          repoPath={repoPath}
          initialMessage={`I've cloned the repository from ${url}. Please analyze it — give me an overview of what it does, the tech stack, key architectural decisions, and anything interesting.`}
        />
      )}
    </Box>
  );
}
