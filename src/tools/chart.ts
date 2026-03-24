import type { Tool } from "@ridit/lens-sdk";

type ChartType = "bar" | "line" | "sparkline";

interface ChartInput {
  type: ChartType;
  title?: string;
  labels?: string[];
  values: number[];
  height?: number;
  fill?: string;
}

function parseChartInput(body: string): ChartInput | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<ChartInput> & {
      data?: number[];
      series?: number[];
    };
    const values = parsed.values ?? parsed.data ?? parsed.series ?? [];
    if (!Array.isArray(values) || values.length === 0) return null;
    return {
      type: parsed.type ?? "bar",
      title: parsed.title,
      labels: parsed.labels,
      values: values.map(Number),
      height: parsed.height ?? 10,
      fill: parsed.fill ?? "█",
    };
  } catch {
    return null;
  }
}

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  orange: "\x1b[38;2;218;119;88m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};

const PALETTE = [C.orange, C.cyan, C.green, C.yellow];
function color(i: number) {
  return PALETTE[i % PALETTE.length]!;
}

function renderBar(input: ChartInput): string {
  const { values, labels, title, fill = "█" } = input;
  const max = Math.max(...values, 1);
  const termW = process.stdout.columns ?? 80;
  const maxLabelLen = labels
    ? Math.max(...labels.map((l) => l.length), 0)
    : String(values.length).length + 1;
  const barMaxW = Math.max(20, termW - maxLabelLen - 12);

  const lines: string[] = [];
  if (title) lines.push(`${C.bold}${C.white}${title}${C.reset}\n`);

  values.forEach((v, i) => {
    const label = labels?.[i] ?? String(i + 1);
    const barLen = Math.round((v / max) * barMaxW);
    const bar = fill.repeat(barLen);
    const valueStr = String(v);
    lines.push(
      `${C.gray}${label.padStart(maxLabelLen)}${C.reset} ` +
        `${color(i)}${bar}${C.reset} ` +
        `${C.dim}${valueStr}${C.reset}`,
    );
  });

  lines.push(
    `${" ".repeat(maxLabelLen + 1)}${C.gray}${"─".repeat(barMaxW)}${C.reset}`,
  );
  lines.push(
    `${" ".repeat(maxLabelLen + 1)}${C.gray}0${" ".repeat(barMaxW - String(max).length)}${max}${C.reset}`,
  );

  return lines.join("\n");
}

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function renderSparkline(input: ChartInput): string {
  const { values, title } = input;
  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const range = max - min;
  const spark = values
    .map((v) => {
      const idx = Math.floor(((v - min) / range) * (SPARK_CHARS.length - 1));
      return `${color(0)}${SPARK_CHARS[idx] ?? "▁"}${C.reset}`;
    })
    .join("");

  const lines: string[] = [];
  if (title) lines.push(`${C.bold}${C.white}${title}${C.reset}`);
  lines.push(spark);
  lines.push(`${C.gray}min ${min}  max ${max}  n=${values.length}${C.reset}`);
  return lines.join("\n");
}

async function renderLine(input: ChartInput): Promise<string> {
  let asciichart: any;
  try {
    asciichart = await import("asciichart");
    asciichart = asciichart.default ?? asciichart;
  } catch {
    return (
      `${C.yellow}asciichart not installed (npm install asciichart). ` +
      `Falling back to sparkline:${C.reset}\n` +
      renderSparkline(input)
    );
  }

  const termW = process.stdout.columns ?? 80;
  const height = input.height ?? 10;

  const lines: string[] = [];
  if (input.title) {
    lines.push(`${C.bold}${C.white}${input.title}${C.reset}\n`);
  }

  const chart = asciichart.plot(input.values, {
    height,
    width: Math.min(input.values.length, termW - 14),
    colors: [asciichart.cyan],
  });

  lines.push(chart);

  if (input.labels && input.labels.length === input.values.length) {
    const step = Math.max(
      1,
      Math.floor(input.labels.length / Math.min(input.labels.length, 10)),
    );
    const labelRow = input.labels
      .filter((_, i) => i % step === 0)
      .map((l) => l.slice(0, 6).padEnd(6))
      .join(" ");
    lines.push(`${C.gray}${" ".repeat(8)}${labelRow}${C.reset}`);
  }

  return lines.join("\n");
}

async function renderChart(input: ChartInput): Promise<string> {
  switch (input.type) {
    case "bar":
      return renderBar(input);
    case "sparkline":
      return renderSparkline(input);
    case "line":
      return await renderLine(input);
    default:
      return renderBar(input);
  }
}

export const chartDataTool: Tool<ChartInput> = {
  name: "chart-data",
  description:
    "render a bar, line, or sparkline chart in the terminal from given data",
  safe: true,
  permissionLabel: "chart",

  systemPromptEntry: (i) =>
    `### ${i}. chart-data — render a chart in the terminal\n` +
    `Types: "bar" (default), "line", "sparkline"\n` +
    `<chart-data>\n` +
    `{"type": "bar", "title": "Commits per month", "labels": ["Jan","Feb","Mar"], "values": [12, 34, 21]}\n` +
    `</chart-data>\n` +
    `<chart-data>\n` +
    `{"type": "line", "title": "Stars over time", "values": [1,3,6,10,15,21,28], "height": 8}\n` +
    `</chart-data>\n` +
    `<chart-data>\n` +
    `{"type": "sparkline", "title": "Daily commits", "values": [2,5,1,8,3,7,4]}\n` +
    `</chart-data>`,

  parseInput: parseChartInput,

  summariseInput: ({ type, title }) =>
    title ? `${type} chart — ${title}` : `${type} chart`,

  execute: async (input, _ctx) => {
    try {
      const rendered = await renderChart(input);
      return { kind: "image" as any, value: rendered };
    } catch (err) {
      return {
        kind: "text",
        value: `Error rendering chart: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
