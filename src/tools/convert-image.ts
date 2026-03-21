// this tool will be used by view-image tool for conversion of unsupported image formats

import path from "path";
import { existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import type { Tool } from "@ridit/lens-sdk";

interface ConvertImageInput {
  input: string | string[];

  output: string;

  resize?: string;

  crop?: string;

  rotate?: 90 | 180 | 270;

  flip?: "h" | "v" | "both";

  quality?: number;

  grayscale?: boolean;

  blur?: number;

  sharpen?: number;

  strip?: boolean;

  watermark?: string;

  frames?: number;

  gifDelay?: number;

  gifLoop?: number;
}

function parseInput(body: string): ConvertImageInput | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as ConvertImageInput;
    if (!parsed.input || !parsed.output) return null;
    return parsed;
  } catch {
    return null;
  }
}

function ffmpegAvailable(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function resolve(p: string, repoPath: string): string {
  return path.isAbsolute(p) ? p : path.join(repoPath, p);
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function buildVfFilters(input: ConvertImageInput): string[] {
  const filters: string[] = [];

  if (input.resize) {
    const [w, h] = input.resize.split("x");
    const fw = w === "-1" ? "-2" : (w ?? "-2");
    const fh = h === "-1" ? "-2" : (h ?? "-2");
    filters.push(`scale=${fw}:${fh}`);
  }

  if (input.crop) {
    const parts = input.crop.split(/[x:]/);
    const [cw, ch, cx = "0", cy = "0"] = parts;
    filters.push(`crop=${cw}:${ch}:${cx}:${cy}`);
  }

  if (input.rotate) {
    const transposeMap: Record<number, string> = {
      90: "transpose=1",
      180: "transpose=2,transpose=2",
      270: "transpose=2",
    };
    if (transposeMap[input.rotate]) filters.push(transposeMap[input.rotate]!);
  }

  if (input.flip) {
    if (input.flip === "h" || input.flip === "both") filters.push("hflip");
    if (input.flip === "v" || input.flip === "both") filters.push("vflip");
  }

  if (input.grayscale) {
    filters.push("hue=s=0");
  }

  if (input.blur && input.blur > 0) {
    filters.push(`gblur=sigma=${input.blur}`);
  }

  if (input.sharpen && input.sharpen > 0) {
    filters.push(`unsharp=5:5:${input.sharpen}:5:5:0`);
  }

  return filters;
}

function buildArgs(
  input: ConvertImageInput,
  resolvedInput: string,
  resolvedOutput: string,
  repoPath: string,
): string[] {
  const args: string[] = ["-y"];

  if (Array.isArray(input.input)) {
    const delay = input.gifDelay ?? 10;
    const loop = input.gifLoop ?? 0;

    for (const src of input.input) {
      args.push("-i", resolve(src, repoPath));
    }
    args.push(
      "-filter_complex",
      `concat=n=${input.input.length}:v=1:a=0,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      "-loop",
      String(loop),
      resolvedOutput,
    );
    return args;
  }

  if (input.frames) {
    args.push("-i", resolvedInput);
    args.push("-vframes", String(input.frames));

    args.push(resolvedOutput);
    return args;
  }

  if (input.watermark) {
    const wmPath = resolve(input.watermark, repoPath);
    args.push("-i", resolvedInput, "-i", wmPath);
    args.push(
      "-filter_complex",
      "[1:v]scale=iw/4:-1[wm];[0:v][wm]overlay=W-w-10:H-h-10",
    );
    const vf = buildVfFilters(input);
    if (vf.length) args.push("-vf", vf.join(","));
  } else {
    args.push("-i", resolvedInput);
    const vf = buildVfFilters(input);
    if (vf.length) args.push("-vf", vf.join(","));
  }

  const ext = path.extname(resolvedOutput).toLowerCase();
  if (input.quality !== undefined) {
    if (ext === ".jpg" || ext === ".jpeg") {
      const q = Math.round(2 + ((100 - input.quality) / 100) * 29);
      args.push("-q:v", String(q));
    } else if (ext === ".webp") {
      args.push("-quality", String(input.quality));
    }
  }

  if (input.strip) {
    args.push("-map_metadata", "-1");
  }

  const imageExts = [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".avif",
    ".bmp",
    ".tiff",
    ".gif",
  ];
  if (imageExts.includes(ext) && !input.frames) {
    args.push("-frames:v", "1");
  }

  args.push(resolvedOutput);
  return args;
}

function runConvert(input: ConvertImageInput, repoPath: string): string {
  if (!ffmpegAvailable()) {
    return (
      "Error: ffmpeg is not installed or not on PATH.\n" +
      "Install it from https://ffmpeg.org/download.html or:\n" +
      "  Windows: winget install ffmpeg\n" +
      "  macOS:   brew install ffmpeg\n" +
      "  Linux:   sudo apt install ffmpeg"
    );
  }

  const resolvedOutput = resolve(input.output, repoPath);
  ensureDir(resolvedOutput);

  const resolvedInput = Array.isArray(input.input)
    ? resolve(input.input[0]!, repoPath)
    : resolve(input.input, repoPath);

  if (!Array.isArray(input.input) && !input.input.startsWith("http")) {
    if (!existsSync(resolvedInput)) {
      return `Error: input file not found — ${resolvedInput}`;
    }
  }

  const args = buildArgs(input, resolvedInput, resolvedOutput, repoPath);
  const cmd = `ffmpeg ${args.map((a) => `"${a}"`).join(" ")}`;

  try {
    const stderr = execSync(cmd, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
      encoding: "utf-8",
    });

    const lines = (stderr || "")
      .split("\n")
      .filter((l) => l.includes("video:") || l.includes("frame="))
      .slice(-3)
      .join("\n");

    const inputLabel = Array.isArray(input.input)
      ? `${input.input.length} files`
      : path.basename(input.input as string);

    return (
      `✓ converted ${inputLabel} → ${input.output}\n` +
      (lines ? `\n${lines}` : "")
    ).trim();
  } catch (e: any) {
    const errOut = (e.stderr ?? e.stdout ?? e.message ?? String(e))
      .split("\n")
      .filter((l: string) => l.trim() && !l.startsWith("ffmpeg version"))
      .slice(-6)
      .join("\n");
    return `Error: ${errOut}`;
  }
}

export const convertImageTool: Tool<ConvertImageInput> = {
  name: "convert-image",
  description:
    "convert, resize, crop, rotate, compress, or reformat images using ffmpeg",
  safe: false,
  permissionLabel: "convert image",

  systemPromptEntry: (i) =>
    [
      `### ${i}. convert-image — image conversion and manipulation via ffmpeg`,
      `<convert-image>`,
      `{"input": "photo.png", "output": "photo.webp", "quality": 85, "resize": "1280x-1"}`,
      `</convert-image>`,
      `Fields (all optional except input/output):`,
      `  input       — source path or array of paths (for gif assembly)`,
      `  output      — destination path; extension sets format (png/jpg/webp/avif/gif/bmp/tiff)`,
      `  resize      — "WxH" or "Wx-1" (keep aspect) e.g. "800x-1" or "400x300"`,
      `  crop        — "WxH:X:Y" e.g. "400x300:100:50"`,
      `  rotate      — 90 | 180 | 270`,
      `  flip        — "h" | "v" | "both"`,
      `  quality     — 1–100 (jpg/webp)`,
      `  grayscale   — true`,
      `  blur        — gaussian blur radius e.g. 5`,
      `  sharpen     — unsharp strength e.g. 1.5`,
      `  strip       — true to remove EXIF metadata`,
      `  watermark   — path to overlay image (bottom-right, 25% size)`,
      `  frames      — extract N frames from video/gif (output must contain %04d e.g. frame%04d.png)`,
      `  gifDelay    — frame delay in centiseconds for gif assembly (default 10)`,
      `  gifLoop     — gif loop count, 0 = infinite (default 0)`,
      `Examples:`,
      `  Convert format:    {"input":"a.png","output":"a.jpg","quality":90}`,
      `  Resize:            {"input":"big.jpg","output":"thumb.jpg","resize":"400x-1"}`,
      `  Rotate + grayscale:{"input":"photo.jpg","output":"out.jpg","rotate":90,"grayscale":true}`,
      `  Strip EXIF:        {"input":"photo.jpg","output":"clean.jpg","strip":true}`,
      `  Assemble gif:      {"input":["f1.png","f2.png","f3.png"],"output":"anim.gif","gifDelay":15}`,
      `  Extract frames:    {"input":"clip.gif","output":"frame%04d.png","frames":10}`,
      `  Watermark:         {"input":"photo.jpg","output":"marked.jpg","watermark":"logo.png"}`,
    ].join("\n"),

  parseInput,

  summariseInput: ({ input, output }) => {
    const src = Array.isArray(input)
      ? `${input.length} files`
      : path.basename(input as string);
    return `${src} → ${path.basename(output)}`;
  },

  execute: async (input, ctx) => {
    try {
      const result = runConvert(input, ctx.repoPath);
      return { kind: "text", value: result };
    } catch (err) {
      return {
        kind: "text",
        value: `Error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
