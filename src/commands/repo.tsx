import { Box, Text, useInput } from "ink";
import figures from "figures";
import { useEffect, useState } from "react";
import path from "path";
import os from "os";
import { startCloneRepo } from "../utils/repo";
import { fetchFileTree, readImportantFiles } from "../utils/files";
import { StepRow } from "../components/repo/StepRow";
import { FileReviewer } from "../components/repo/FileReviewer";
import { RepoAnalysis } from "../components/repo/RepoAnalysis";
import type { Step, ImportantFile } from "../types/repo";

function flattenTree(files: string[]): string[] {
  return files;
}

export const RepoCommand = ({ url }: { url: string }) => {
  const [steps, setSteps] = useState<Step[]>([
    { type: "cloning", status: "pending" },
  ]);
  const [importantFiles, setImportantFiles] = useState<ImportantFile[]>([]);
  const [fileTree, setFileTree] = useState<string[]>([]);
  const [repoPath, setRepoPath] = useState<string>("");
  const [reviewDone, setReviewDone] = useState(false);

  const updateLastStep = (updated: Step) =>
    setSteps((prev) => [...prev.slice(0, -1), updated]);

  const pushStep = (step: Step) => setSteps((prev) => [...prev, step]);

  const handleCloneSuccess = (rPath: string) => {
    setRepoPath(rPath);
    updateLastStep({ type: "cloning", status: "done" });
    pushStep({ type: "fetching-tree", status: "pending" });

    fetchFileTree(rPath)
      .then((files) => {
        updateLastStep({ type: "fetching-tree", status: "done" });
        pushStep({ type: "reading-files", status: "pending" });
        setFileTree(files);
        const found = readImportantFiles(rPath, files);
        setImportantFiles(found);
        updateLastStep({ type: "reading-files", status: "done" });
      })
      .catch(() => updateLastStep({ type: "fetching-tree", status: "done" }));
  };

  useEffect(() => {
    startCloneRepo(url).then((result) => {
      if (result.done) {
        const repoName = path
          .basename(new URL(url).pathname)
          .replace(/\.git$/, "");
        handleCloneSuccess(path.join(os.tmpdir(), repoName));
      } else if (result.folderExists) {
        updateLastStep({
          type: "folder-exists",
          status: "pending",
          repoPath: result.repoPath,
        });
      } else {
        updateLastStep({
          type: "error",
          message: result.error ?? "Unknown error",
        });
      }
    });
  }, [url]);

  useInput((input) => {
    const last = steps[steps.length - 1];
    if (last?.type !== "folder-exists") return;
    const rPath = last.repoPath;

    if (input === "y" || input === "Y") {
      updateLastStep({ type: "cloning", status: "pending" });
      startCloneRepo(url, { forceReclone: true }).then((result) => {
        if (result.done) {
          handleCloneSuccess(rPath);
        } else if (!result.folderExists) {
          updateLastStep({
            type: "error",
            message: result.error ?? "Unknown error",
          });
        }
      });
    }

    if (input === "n" || input === "N") handleCloneSuccess(rPath);
  });

  const allDone =
    steps[steps.length - 1]?.type === "reading-files" &&
    (steps[steps.length - 1] as Extract<Step, { type: "reading-files" }>)
      .status === "done";

  return (
    <Box flexDirection="column">
      {steps.map((step, i) => (
        <StepRow key={i} step={step} />
      ))}

      {allDone && !reviewDone && importantFiles.length > 0 && (
        <FileReviewer
          files={importantFiles}
          onDone={() => setReviewDone(true)}
        />
      )}

      {allDone && importantFiles.length === 0 && !reviewDone && (
        <Text color="gray">{figures.info} No important files found</Text>
      )}

      {(reviewDone || (allDone && importantFiles.length === 0)) && (
        <RepoAnalysis
          repoUrl={url}
          repoPath={repoPath}
          fileTree={fileTree}
          files={importantFiles}
        />
      )}
    </Box>
  );
};
