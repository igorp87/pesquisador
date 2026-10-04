import { clean, fetchJson } from "../http";
import type { ResultItem, SearchContext } from "../types";

interface AlgoliaHit {
  objectID: string;
  title?: string;
  url?: string;
  story_text?: string;
  comment_text?: string;
  story_title?: string;
  story_id?: number;
  author: string;
  points?: number;
  num_comments?: number;
  created_at: string;
}

const API = "https://hn.algolia.com/api/v1/search";

/** Hacker News via Algolia — free, no key. Strong for tech/SaaS/startup ideas. */
export async function searchHackerNews(ctx: SearchContext): Promise<{ items: ResultItem[] }> {
  const twoYearsAgo = Math.floor(Date.now() / 1000) - 2 * 365 * 24 * 3600;
  const common = { query: ctx.query, numericFilters: `created_at_i>${twoYearsAgo}` };

  const [stories, comments] = await Promise.all([
    fetchJson<{ hits: AlgoliaHit[] }>(`${API}?` + new URLSearchParams({ ...common, tags: "story", hitsPerPage: "20" })),
    fetchJson<{ hits: AlgoliaHit[] }>(`${API}?` + new URLSearchParams({ ...common, tags: "comment", hitsPerPage: "20" })),
  ]);

  const storyItems: ResultItem[] = stories.hits.map((h) => ({
    source: "hackernews",
    title: h.title ?? "(sem título)",
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    text: clean(h.story_text, 600) || (h.url ? `Link: ${h.url}` : ""),
    author: h.author,
    date: h.created_at,
    metrics: { pontos: h.points ?? 0, comentarios: h.num_comments ?? 0 },
  }));

  const commentItems: ResultItem[] = comments.hits.map((h) => ({
    source: "hackernews",
    title: `Comentário em: ${h.story_title ?? "thread"}`,
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    text: clean(h.comment_text, 600),
    author: h.author,
    date: h.created_at,
  }));

  return { items: [...storyItems, ...commentItems] };
}
