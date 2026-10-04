import { clean, fetchJson } from "../http";
import type { ResultItem, SearchContext } from "../types";

interface Listing<T> {
  data: { children: { kind: string; data: T }[] };
}

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  permalink: string;
  subreddit: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
}

interface RedditComment {
  body?: string;
  score?: number;
}

const userAgent = () =>
  process.env.REDDIT_USER_AGENT || "web:pesquisador:v0.1 (by /u/pesquisador)";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const res = await fetchJson<{ access_token: string; expires_in: number }>(
    "https://www.reddit.com/api/v1/access_token",
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent(),
      },
      body: "grant_type=client_credentials",
    },
  );
  cachedToken = {
    value: res.access_token,
    expiresAt: Date.now() + res.expires_in * 1000,
  };
  return cachedToken.value;
}

export async function searchReddit(ctx: SearchContext): Promise<{ items: ResultItem[]; extra: Record<string, unknown> }> {
  const token = await getToken();
  // With OAuth: oauth.reddit.com (100 req/min). Without: public .json endpoints (~10 req/min).
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const suffix = token ? "" : ".json";
  const headers: Record<string, string> = { "User-Agent": userAgent() };
  if (token) headers.Authorization = `Bearer ${token}`;

  const params = new URLSearchParams({
    q: ctx.query,
    sort: "relevance",
    t: "year",
    limit: "25",
    raw_json: "1",
  });
  const listing = await fetchJson<Listing<RedditPost>>(
    `${base}/search${suffix}?${params}`,
    { headers },
  );
  const posts = listing.data.children.map((c) => c.data);

  // Comments carry most of the "pain" signal; fetch them for the most discussed posts.
  const topDiscussed = [...posts]
    .sort((a, b) => b.num_comments - a.num_comments)
    .slice(0, 5)
    .filter((p) => p.num_comments > 0);

  const commentsById = new Map<string, string[]>();
  await Promise.all(
    topDiscussed.map(async (p) => {
      try {
        const data = await fetchJson<[unknown, Listing<RedditComment>]>(
          `${base}/comments/${p.id}${suffix}?limit=15&depth=1&sort=top&raw_json=1`,
          { headers },
        );
        const comments = data[1].data.children
          .filter((c) => c.kind === "t1" && c.data.body)
          .slice(0, 10)
          .map((c) => `(${c.data.score ?? 0}↑) ${clean(c.data.body, 400)}`);
        commentsById.set(p.id, comments);
      } catch {
        // A single post's comments failing shouldn't fail the whole source.
      }
    }),
  );

  const items: ResultItem[] = posts.map((p) => ({
    source: "reddit",
    title: `r/${p.subreddit}: ${p.title}`,
    url: `https://www.reddit.com${p.permalink}`,
    text: clean(p.selftext, 800),
    author: p.author,
    date: new Date(p.created_utc * 1000).toISOString(),
    metrics: { upvotes: p.score, comentarios: p.num_comments },
    comments: commentsById.get(p.id),
  }));

  const subreddits: Record<string, number> = {};
  for (const p of posts) subreddits[p.subreddit] = (subreddits[p.subreddit] ?? 0) + 1;

  return {
    items,
    extra: { modo: token ? "oauth" : "publico", subreddits },
  };
}
