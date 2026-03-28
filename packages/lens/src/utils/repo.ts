import fs from "fs";
import os from "os";
import path from "path";
import { exec } from "child_process";

export type CloneResult =
  | { done: true; repoPath: string }
  | { done: false; folderExists: true; repoPath: string }
  | { done: false; folderExists?: false; error: string };

function cloneRepo(
  url: string,
  repoPath: string,
): Promise<{ done: boolean; error?: string }> {
  return new Promise((resolve) => {
    exec(`git clone "${url}" "${repoPath}"`, (err) => {
      if (err) resolve({ done: false, error: err.message });
      else resolve({ done: true });
    });
  });
}

function deleteRepoFolder(repoPath: string): void {
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
    return { done: false, error: "Could not determine repository name from URL." };
  }

  const repoPath = path.join(os.tmpdir(), repoName);

  const firstTry = await cloneRepo(url, repoPath);
  if (!firstTry.error) {
    return { done: true, repoPath };
  }

  if (firstTry.error.includes("already exists")) {
    if (!opts.forceReclone) {
      return { done: false, folderExists: true, repoPath };
    }
    deleteRepoFolder(repoPath);
    const secondTry = await cloneRepo(url, repoPath);
    return secondTry.error
      ? { done: false, error: secondTry.error }
      : { done: true, repoPath };
  }

  return { done: false, error: firstTry.error };
}
