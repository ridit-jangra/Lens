import { execSync } from "child_process";

export async function runShell(command: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const { spawn } =
      require("child_process") as typeof import("child_process");
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const shellFlag = isWin ? "/c" : "-c";

    const proc = spawn(shell, [shellFlag, command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));

    const killTimer = setTimeout(
      () => {
        proc.kill();
        resolve("(command timed out after 5 minutes)");
      },
      5 * 60 * 1000,
    );

    proc.on("close", (code: number | null) => {
      clearTimeout(killTimer);
      const stdout = Buffer.concat(chunks).toString("utf-8").trim();
      const stderr = Buffer.concat(errChunks).toString("utf-8").trim();
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      resolve(combined || (code === 0 ? "(no output)" : `exit code ${code}`));
    });

    proc.on("error", (err: Error) => {
      clearTimeout(killTimer);
      resolve(`Error: ${err.message}`);
    });
  });
}

export function readClipboard(): string {
  try {
    const platform = process.platform;
    if (platform === "win32") {
      return execSync("powershell -noprofile -command Get-Clipboard", {
        encoding: "utf-8",
        timeout: 2000,
      })
        .replace(/\r\n/g, "\n")
        .trimEnd();
    }
    if (platform === "darwin") {
      return execSync("pbpaste", {
        encoding: "utf-8",
        timeout: 2000,
      }).trimEnd();
    }
    for (const cmd of [
      "xclip -selection clipboard -o",
      "xsel --clipboard --output",
      "wl-paste",
    ]) {
      try {
        return execSync(cmd, { encoding: "utf-8", timeout: 2000 }).trimEnd();
      } catch {
        continue;
      }
    }
    return "";
  } catch {
    return "";
  }
}

export function openUrl(url: string): string {
  try {
    const { execSync: exec } =
      require("child_process") as typeof import("child_process");
    const platform = process.platform;
    if (platform === "win32") {
      exec(`start "" "${url}"`, { stdio: "ignore" });
    } else if (platform === "darwin") {
      exec(`open "${url}"`, { stdio: "ignore" });
    } else {
      exec(`xdg-open "${url}"`, { stdio: "ignore" });
    }
    return `Opened: ${url}`;
  } catch (err) {
    return `Error opening URL: ${err instanceof Error ? err.message : String(err)}`;
  }
}
