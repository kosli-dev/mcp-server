import type { CatalogEntry } from "../types.js";

export interface SearchResult {
  id: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
  parameters: CatalogEntry["parameters"];
  requestBody: CatalogEntry["requestBody"];
}

export function searchActions(
  catalog: CatalogEntry[],
  query: string,
  limit: number = 10,
): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored: Array<{ entry: CatalogEntry; score: number }> = [];

  for (const entry of catalog) {
    let score = 0;
    for (const term of terms) {
      if (entry.searchText.includes(term)) {
        score += 1;
      }
      // Bonus for exact match in summary (most relevant signal)
      if (entry.summary.toLowerCase().includes(term)) {
        score += 2;
      }
    }
    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ entry }) => ({
    id: entry.id,
    method: entry.method,
    path: entry.path,
    summary: entry.summary,
    tags: entry.tags,
    parameters: entry.parameters,
    requestBody: entry.requestBody,
  }));
}
