// ── HTML helpers ──────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTables(html: string): string {
  const tables: string[] = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tMatch: RegExpExecArray | null;

  while ((tMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tMatch[0]!;
    const rows: string[][] = [];
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    let rMatch: RegExpExecArray | null;
    while ((rMatch = rowRe.exec(tableHtml)) !== null) {
      const cells: string[] = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = cellRe.exec(rMatch[0]!)) !== null) {
        cells.push(stripTags(cMatch[1] ?? ""));
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length < 2) continue;
    const cols = Math.max(...rows.map((r) => r.length));
    const padded = rows.map((r) => {
      while (r.length < cols) r.push("");
      return r;
    });
    const widths = Array.from({ length: cols }, (_, ci) =>
      Math.max(...padded.map((r) => (r[ci] ?? "").length), 3),
    );
    const fmt = (r: string[]) =>
      r.map((c, ci) => c.padEnd(widths[ci] ?? 0)).join(" | ");
    const header = fmt(padded[0]!);
    const sep = widths.map((w) => "-".repeat(w)).join("-|-");
    const body = padded.slice(1).map(fmt).join("\n");
    tables.push(`${header}\n${sep}\n${body}`);
  }

  return tables.length > 0
    ? `=== TABLES (${tables.length}) ===\n\n${tables.join("\n\n---\n\n")}`
    : "";
}

function extractLists(html: string): string {
  const lists: string[] = [];
  const listRe = /<[ou]l[\s\S]*?<\/[ou]l>/gi;
  let lMatch: RegExpExecArray | null;
  while ((lMatch = listRe.exec(html)) !== null) {
    const items: string[] = [];
    const itemRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let iMatch: RegExpExecArray | null;
    while ((iMatch = itemRe.exec(lMatch[0]!)) !== null) {
      const text = stripTags(iMatch[1] ?? "");
      if (text.length > 2) items.push(`• ${text}`);
    }
    if (items.length > 1) lists.push(items.join("\n"));
  }
  return lists.length > 0
    ? `=== LISTS ===\n\n${lists.slice(0, 5).join("\n\n")}`
    : "";
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await res.json();
    return JSON.stringify(json, null, 2).slice(0, 8000);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]!) : "No title";

  const tables = extractTables(html);
  const lists = extractLists(html);
  const bodyText = stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, ""),
  )
    .replace(/\s{3,}/g, "\n\n")
    .slice(0, 3000);

  const parts = [`PAGE: ${title}`, `URL: ${url}`];
  if (tables) parts.push(tables);
  if (lists) parts.push(lists);
  parts.push(`=== TEXT ===\n${bodyText}`);
  return parts.join("\n\n");
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function searchWeb(query: string): Promise<string> {
  const encoded = encodeURIComponent(query);

  const ddgUrl = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
  try {
    const res = await fetch(ddgUrl, {
      headers: { "User-Agent": "Lens/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: { Text?: string; FirstURL?: string }[];
        Answer?: string;
        Infobox?: { content?: { label: string; value: string }[] };
      };

      const parts: string[] = [`Search: ${query}`];
      if (data.Answer) parts.push(`Answer: ${data.Answer}`);
      if (data.AbstractText) {
        parts.push(`Summary: ${data.AbstractText}`);
        if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
      }
      if (data.Infobox?.content?.length) {
        const fields = data.Infobox.content
          .slice(0, 8)
          .map((f) => `  ${f.label}: ${f.value}`)
          .join("\n");
        parts.push(`Info:\n${fields}`);
      }
      if (data.RelatedTopics?.length) {
        const topics = (data.RelatedTopics as { Text?: string }[])
          .filter((t) => t.Text)
          .slice(0, 5)
          .map((t) => `  - ${t.Text}`)
          .join("\n");
        if (topics) parts.push(`Related:\n${topics}`);
      }

      const result = parts.join("\n\n");
      if (result.length > 60) return result;
    }
  } catch {
    // fall through to HTML scrape
  }

  try {
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;
    const res = await fetch(htmlUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const snippets: string[] = [];
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = snippetRe.exec(html)) !== null && snippets.length < 6) {
      const text = m[1]!
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 20) snippets.push(`- ${text}`);
    }

    const links: string[] = [];
    const linkRe = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    while ((m = linkRe.exec(html)) !== null && links.length < 5) {
      const title = m[2]!.replace(/<[^>]+>/g, "").trim();
      const href = m[1]!;
      if (title && href) links.push(`  ${title} \u2014 ${href}`);
    }

    if (snippets.length === 0 && links.length === 0)
      return `No results found for: ${query}`;

    const parts = [`Search results for: ${query}`];
    if (snippets.length > 0) parts.push(`Snippets:\n${snippets.join("\n")}`);
    if (links.length > 0) parts.push(`Links:\n${links.join("\n")}`);
    return parts.join("\n\n");
  } catch (err) {
    return `Search failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
