import path from "path";
import os from "os";
import { existsSync, readdirSync } from "fs";
import { pathToFileURL } from "url";

const ADDONS_DIR = path.join(os.homedir(), ".lens", "addons");

export async function loadAddons(): Promise<void> {
  if (!existsSync(ADDONS_DIR)) {
    return;
  }

  const files = readdirSync(ADDONS_DIR).filter(
    (f) => f.endsWith(".js") && !f.startsWith("_"),
  );

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) return;

    const fullPath = path.join(ADDONS_DIR, file);
    const fileUrl = pathToFileURL(fullPath).href;
    const isLast = i === files.length - 1;
    try {
      await import(fileUrl);
      console.log(`[addons] loaded: ${file}${isLast ? "\n" : ""}`);
    } catch (err) {
      console.error(
        `[addons] failed to load ${file}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
