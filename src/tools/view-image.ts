// ── tools/view-image.ts ───────────────────────────────────────────────────────
//
// Display images in the terminal using the best available protocol:
//
//   1. iTerm2 inline image protocol (OSC 1337)
//      Supported by: iTerm2, WezTerm, VSCode integrated terminal,
//                    Windows Terminal (via some builds), Tabby, Hyper
//
//   2. Kitty graphics protocol
//      Supported by: Kitty, WezTerm
//
//   3. Sixel
//      Supported by: Windows Terminal 1.22+, xterm, mlterm, WezTerm
//      Requires: chafa or img2sixel on PATH (auto-detected)
//
//   4. Half-block fallback via terminal-image
//      Works everywhere that supports 256 colors.
//      Quality is limited to block characters (▄▀) — better than nothing.
//
// Protocol is auto-detected from environment variables and terminal responses.
// Can be overridden by passing "protocol" in the JSON input.

import path from "path";
import { existsSync, readFileSync } from "fs";
import type { Tool } from "@ridit/lens-sdk";
import { execSync } from "child_process";

// ── input ─────────────────────────────────────────────────────────────────────

type Protocol = "iterm2" | "kitty" | "sixel" | "halfblock" | "auto";

interface ViewImageInput {
  /** File path (repo-relative or absolute) or URL */
  src: string;
  /** Width: percentage "50%" or column count 40. Default "80%" */
  width?: string | number;
  /** Force a specific protocol instead of auto-detecting */
  protocol?: Protocol;
}

function parseViewImageInput(body: string): ViewImageInput | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const p = JSON.parse(trimmed) as {
        src?: string;
        path?: string;
        url?: string;
        width?: string | number;
        protocol?: Protocol;
      };
      const src = p.src ?? p.path ?? p.url ?? "";
      if (!src) return null;
      return { src, width: p.width ?? "80%", protocol: p.protocol ?? "auto" };
    } catch {
      return null;
    }
  }

  return { src: trimmed, width: "80%", protocol: "auto" };
}

// ── fetch image bytes ─────────────────────────────────────────────────────────

async function fetchBytes(src: string, repoPath: string): Promise<Buffer> {
  if (src.startsWith("http://") || src.startsWith("https://")) {
    const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const resolved = path.isAbsolute(src) ? src : path.join(repoPath, src);
  if (!existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  return readFileSync(resolved);
}

// ── protocol detection ────────────────────────────────────────────────────────

function detectProtocol(): Exclude<Protocol, "auto"> {
  const term = (process.env["TERM"] ?? "").toLowerCase();
  const termProgram = (process.env["TERM_PROGRAM"] ?? "").toLowerCase();
  const termEmulator = (process.env["TERM_EMULATOR"] ?? "").toLowerCase();

  // Kitty
  if (term === "xterm-kitty" || process.env["KITTY_WINDOW_ID"]) {
    return "kitty";
  }

  // iTerm2
  if (
    termProgram === "iterm.app" ||
    termProgram === "iterm2" ||
    process.env["ITERM_SESSION_ID"]
  ) {
    return "iterm2";
  }

  // WezTerm — supports both kitty and iterm2; prefer kitty
  if (termProgram === "wezterm" || process.env["WEZTERM_EXECUTABLE"]) {
    return "kitty";
  }

  // VSCode integrated terminal — supports iTerm2 protocol
  if (
    process.env["TERM_PROGRAM"] === "vscode" ||
    process.env["VSCODE_INJECTION"] ||
    process.env["VSCODE_GIT_ASKPASS_NODE"]
  ) {
    return "iterm2";
  }

  // Windows Terminal 1.22+ supports Sixel
  // WT_SESSION is set in Windows Terminal
  if (process.env["WT_SESSION"]) {
    // Check if chafa or img2sixel is available for sixel encoding
    if (commandExists("chafa") || commandExists("img2sixel")) {
      return "sixel";
    }
    // Fall through to halfblock — Windows Terminal also does colors fine
  }

  // Tabby / Hyper typically support iTerm2
  if (termEmulator.includes("tabby") || termEmulator.includes("hyper")) {
    return "iterm2";
  }

  // xterm with sixel support
  if (term.includes("xterm") && commandExists("img2sixel")) {
    return "sixel";
  }

  return "halfblock";
}

function commandExists(cmd: string): boolean {
  try {
    execSync(process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`, {
      stdio: "pipe",
      timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

// ── renderers ─────────────────────────────────────────────────────────────────

// iTerm2 inline image protocol (OSC 1337)
function renderITerm2(buf: Buffer, width: string | number): string {
  const b64 = buf.toString("base64");
  const widthParam =
    typeof width === "number" ? `width=${width}` : `width=${width}`;
  // ESC ] 1337 ; File=inline=1;width=...: <base64> BEL
  return `\x1b]1337;File=inline=1;${widthParam};preserveAspectRatio=1:${b64}\x07\n`;
}

// Kitty graphics protocol (APC, chunked base64)
function renderKitty(buf: Buffer, width: string | number): string {
  const b64 = buf.toString("base64");
  const chunkSize = 4096;
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += chunkSize) {
    chunks.push(b64.slice(i, i + chunkSize));
  }

  const cols =
    typeof width === "number"
      ? width
      : width.endsWith("%")
        ? Math.floor((process.stdout.columns ?? 80) * (parseInt(width) / 100))
        : parseInt(width);

  let result = "";
  chunks.forEach((chunk, idx) => {
    const isLast = idx === chunks.length - 1;
    const more = isLast ? 0 : 1;
    if (idx === 0) {
      // First chunk: f=100 (PNG), a=T (transmit+display), c=columns
      result += `\x1b_Ga=T,f=100,m=${more},c=${cols};${chunk}\x1b\\`;
    } else {
      result += `\x1b_Gm=${more};${chunk}\x1b\\`;
    }
  });
  return result + "\n";
}

// Sixel via chafa (preferred, auto-detects format) or img2sixel
function renderSixel(
  buf: Buffer,
  src: string,
  repoPath: string,
  width: string | number,
): string {
  const widthCols =
    typeof width === "number"
      ? width
      : width.endsWith("%")
        ? Math.floor((process.stdout.columns ?? 80) * (parseInt(width) / 100))
        : parseInt(width);

  // Write buf to a temp file so we can pass it to CLI tools
  const tmpPath = path.join(
    process.env["TEMP"] ?? process.env["TMPDIR"] ?? "/tmp",
    `lens_img_${Date.now()}.bin`,
  );
  const { writeFileSync, unlinkSync } = require("fs") as typeof import("fs");
  writeFileSync(tmpPath, buf);

  try {
    if (commandExists("chafa")) {
      const result = execSync(
        `chafa --format sixel --size ${widthCols}x40 "${tmpPath}"`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 },
      );
      return result + "\n";
    }
    if (commandExists("img2sixel")) {
      const result = execSync(`img2sixel -w ${widthCols * 8} "${tmpPath}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15_000,
      });
      return result + "\n";
    }
    throw new Error("no sixel encoder found");
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }
}

// Half-block fallback via terminal-image
async function renderHalfBlock(
  buf: Buffer,
  width: string | number,
): Promise<string> {
  let terminalImage: any;
  try {
    terminalImage = await import("terminal-image");
    terminalImage = terminalImage.default ?? terminalImage;
  } catch {
    return (
      "Error: terminal-image not installed (npm install terminal-image).\n" +
      "For better image display, install chafa: https://hpjansson.org/chafa/\n" +
      "  Windows: winget install hpjansson.chafa\n" +
      "  macOS:   brew install chafa\n" +
      "  Linux:   sudo apt install chafa"
    );
  }
  return await terminalImage.buffer(buf, {
    width,
    preserveAspectRatio: true,
  });
}

// ── main render ───────────────────────────────────────────────────────────────

async function renderImage(
  input: ViewImageInput,
  repoPath: string,
): Promise<string> {
  const buf = await fetchBytes(input.src, repoPath);
  const width = input.width ?? "80%";
  const protocol =
    input.protocol === "auto" || !input.protocol
      ? detectProtocol()
      : input.protocol;

  switch (protocol) {
    case "iterm2":
      return renderITerm2(buf, width);

    case "kitty":
      return renderKitty(buf, width);

    case "sixel":
      try {
        return renderSixel(buf, input.src, repoPath, width);
      } catch (e: any) {
        // Sixel encoder missing — fall through to halfblock
        return (
          `(sixel encoder not found — install chafa for better quality)\n` +
          (await renderHalfBlock(buf, width))
        );
      }

    case "halfblock":
    default:
      return await renderHalfBlock(buf, width);
  }
}

// ── tool ──────────────────────────────────────────────────────────────────────

export const viewImageTool: Tool<ViewImageInput> = {
  name: "view-image",
  description:
    "display an image in the terminal (auto-detects iTerm2/Kitty/Sixel/half-block)",
  safe: true,
  permissionLabel: "view image",

  systemPromptEntry: (i) =>
    [
      `### ${i}. view-image — display an image in the terminal`,
      `<view-image>screenshot.png</view-image>`,
      `<view-image>https://example.com/banner.jpg</view-image>`,
      `<view-image>{"src": "assets/logo.png", "width": "60%"}</view-image>`,
      `<view-image>{"src": "photo.jpg", "width": "80%", "protocol": "iterm2"}</view-image>`,
      `Protocols: auto (default), iterm2, kitty, sixel, halfblock`,
      `Width: percentage "50%" or column count 40. Default "80%"`,
      `Supported formats: PNG, JPG, GIF, WebP, BMP, TIFF`,
    ].join("\n"),

  parseInput: parseViewImageInput,

  summariseInput: ({ src, width }) =>
    `${path.basename(src)} (${width ?? "80%"})`,

  execute: async (input, ctx) => {
    try {
      const ansi = await renderImage(input, ctx.repoPath);
      return { kind: "image" as any, value: ansi };
    } catch (err) {
      return {
        kind: "text",
        value: `Error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
