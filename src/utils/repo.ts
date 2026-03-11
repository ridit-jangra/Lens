import fs from "fs";
import os from "os";
import path from "path";
import { exec } from "child_process";

type CloneResult =
  | { done: true }
  | { done: false; folderExists: true; repoPath: string }
  | { done: false; folderExists?: false; error: string };

export function cloneRepo(
  url: string,
  repoPath: string,
): Promise<{ done: boolean; error?: string }> {
  return new Promise((resolve) => {
    exec(`git clone "${url}" "${repoPath}"`, (err) => {
      if (err) {
        resolve({ done: false, error: err.message });
      } else {
        resolve({ done: true });
      }
    });
  });
}

export function deleteRepoFolder(repoPath: string): void {
  fs.rmSync(repoPath, { recursive: true, force: true });
}

export async function startCloneRepo(
  url: string,
  opts: { forceReclone?: boolean } = {},
): Promise<CloneResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { done: false, error: `Invalid URL: ${url}` };
  }

  const repoName = path.basename(parsedUrl.pathname).replace(/\.git$/, "");
  if (!repoName) {
    return {
      done: false,
      error: "Could not determine repository name from URL.",
    };
  }

  const repoPath = path.join(os.tmpdir(), repoName);

  const firstTry = await cloneRepo(url, repoPath);
  if (!firstTry.error) {
    return { done: true };
  }

  if (firstTry.error.includes("already exists")) {
    if (!opts.forceReclone) {
      return { done: false, folderExists: true, repoPath };
    }

    deleteRepoFolder(repoPath);
    const secondTry = await cloneRepo(url, repoPath);
    return secondTry.error
      ? { done: false, error: secondTry.error }
      : { done: true };
  }

  return { done: false, error: firstTry.error };
}
