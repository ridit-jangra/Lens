import { existsSync, readFileSync } from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import type { PackageManager, PreviewInfo } from "../types/repo";

export function detectPreview(repoPath: string): PreviewInfo | null {
  // Node / JS
  const pkgPath = path.join(repoPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = pkg.scripts ?? {};

      const pm: PackageManager = existsSync(
        path.join(repoPath, "pnpm-lock.yaml"),
      )
        ? "pnpm"
        : existsSync(path.join(repoPath, "yarn.lock"))
          ? "yarn"
          : "npm";

      const devScript =
        scripts["dev"] ?? scripts["start"] ?? scripts["serve"] ?? null;
      if (!devScript) return null;

      const devCmd =
        pm === "npm" ? "npm run dev" : pm === "yarn" ? "yarn dev" : "pnpm dev";

      // Try to sniff port from dev script
      const portMatch = devScript.match(/--port[= ](\d+)/);
      const port = portMatch ? parseInt(portMatch[1]!, 10) : 5173;

      return {
        packageManager: pm,
        installCmd:
          pm === "npm"
            ? "npm install"
            : pm === "yarn"
              ? "yarn install"
              : "pnpm install",
        devCmd,
        port,
      };
    } catch {
      return null;
    }
  }

  // Python
  if (
    existsSync(path.join(repoPath, "requirements.txt")) ||
    existsSync(path.join(repoPath, "pyproject.toml"))
  ) {
    return {
      packageManager: "pip",
      installCmd: "pip install -r requirements.txt",
      devCmd: existsSync(path.join(repoPath, "manage.py"))
        ? "python manage.py runserver"
        : "python main.py",
      port: 8000,
    };
  }

  return null;
}

export type PreviewProcess = {
  kill: () => void;
  onLog: (cb: (line: string) => void) => void;
  onError: (cb: (line: string) => void) => void;
  onExit: (cb: (code: number | null) => void) => void;
};

export function runInstall(
  repoPath: string,
  installCmd: string,
): PreviewProcess {
  return spawnProcess(repoPath, installCmd);
}

export function runDev(repoPath: string, devCmd: string): PreviewProcess {
  return spawnProcess(repoPath, devCmd);
}

function spawnProcess(cwd: string, cmd: string): PreviewProcess {
  const [bin, ...args] = cmd.split(" ") as [string, ...string[]];
  const child: ChildProcess = spawn(bin, args, {
    cwd,
    shell: true,
    env: { ...process.env },
  });

  const logCallbacks: ((line: string) => void)[] = [];
  const errorCallbacks: ((line: string) => void)[] = [];
  const exitCallbacks: ((code: number | null) => void)[] = [];

  child.stdout?.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(Boolean);
    lines.forEach((line) => logCallbacks.forEach((cb) => cb(line)));
  });

  child.stderr?.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(Boolean);
    lines.forEach((line) => errorCallbacks.forEach((cb) => cb(line)));
  });

  child.on("exit", (code) => {
    exitCallbacks.forEach((cb) => cb(code));
  });

  return {
    kill: () => child.kill(),
    onLog: (cb) => logCallbacks.push(cb),
    onError: (cb) => errorCallbacks.push(cb),
    onExit: (cb) => exitCallbacks.push(cb),
  };
}
