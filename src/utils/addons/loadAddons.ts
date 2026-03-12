import path from "path";
import os from "os";
import { existsSync, readdirSync } from "fs";

const ADDONS_DIR = path.join(os.homedir(), ".lens", "addons");

export async function loadAddons(): Promise<void> {
  if (!existsSync(ADDONS_DIR)) {
    // Silently skip — no addons directory yet
    return;
  }

  const files = readdirSync(ADDONS_DIR).filter(
    (f) => f.endsWith(".js") && !f.startsWith("_"),
  );

  for (const file of files) {
    const fullPath = path.join(ADDONS_DIR, file);
    try {
      await import(fullPath);
      console.log(`[addons] loaded: ${file}\n`);
    } catch (err) {
      console.error(
        `[addons] failed to load ${file}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
