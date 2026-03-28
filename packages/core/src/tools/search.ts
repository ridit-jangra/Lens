import { tool } from "ai";
import { z } from "zod";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2F;/g, "/").replace(/&quot;/g, '"').trim();
}

export const search = tool({
  description: "search the internet and return top results with titles, URLs, and snippets",
  parameters: z.object({
    query: z.string().describe("search query"),
    count: z.number().optional().describe("number of results to return, default 5"),
  }),
  execute: async ({ query, count = 5 }) => {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; lens-cli/1.0)",
        },
      });
      if (!res.ok) return `search failed: HTTP ${res.status}`;
      const html = await res.text();

      const results: { title: string; url: string; snippet: string }[] = [];
      // Each result block is wrapped in <div class="result ...">
      const blockRe = /<div class="result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
      let block: RegExpExecArray | null;
      while ((block = blockRe.exec(html)) !== null && results.length < count) {
        const inner = block[1];

        const titleMatch = inner.match(/<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/);
        const hrefMatch = inner.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/);
        const snippetMatch = inner.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

        const title = titleMatch ? stripHtml(titleMatch[1]) : "";
        const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";
        let url = hrefMatch ? hrefMatch[1] : "";

        // DDG wraps URLs — extract uddg param if present
        if (url.includes("uddg=")) {
          const uddg = new URLSearchParams(url.split("?")[1]).get("uddg");
          if (uddg) url = decodeURIComponent(uddg);
        }

        if (title && url) results.push({ title, url, snippet });
      }

      if (results.length === 0) return "no results found";

      return results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`)
        .join("\n\n");
    } catch (e) {
      return `search error: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});
