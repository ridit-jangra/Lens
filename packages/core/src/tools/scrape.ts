import { tool } from "ai";
import { z } from "zod";

function htmlToText(html: string): string {
  // Remove scripts, styles, and their contents
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");

  // Block elements → newline
  text = text.replace(/<\/?(p|div|section|article|h[1-6]|li|tr|br|blockquote)[^>]*>/gi, "\n");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/");

  // Collapse whitespace and blank lines
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

export const scrape = tool({
  description: "fetch a web page and return its readable text content",
  parameters: z.object({
    url: z.string().describe("URL to fetch"),
    maxLength: z.number().optional().describe("max characters to return, default 8000"),
  }),
  execute: async ({ url, maxLength = 8000 }) => {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; lens-cli/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });
      if (!res.ok) return `fetch failed: HTTP ${res.status}`;

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("html") && !contentType.includes("text")) {
        return `unsupported content type: ${contentType}`;
      }

      const html = await res.text();
      const text = htmlToText(html);
      return text.length > maxLength ? text.slice(0, maxLength) + "\n…[truncated]" : text;
    } catch (e) {
      return `scrape error: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});
