import { clean, fetchJson, regionParams } from "../http";
import type { ResultItem, SearchContext } from "../types";

const API = "https://www.googleapis.com/youtube/v3";

interface SearchList {
  items: {
    id: { videoId: string };
    snippet: {
      title: string;
      description: string;
      channelTitle: string;
      publishedAt: string;
    };
  }[];
}

interface VideoList {
  items: {
    id: string;
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  }[];
}

interface CommentThreads {
  items: {
    snippet: {
      topLevelComment: {
        snippet: { textDisplay: string; likeCount: number };
      };
    };
  }[];
}

/**
 * Quota cost per search: search.list = 100 units, videos.list = 1,
 * commentThreads.list = 1 each. Free tier is 10,000 units/day (~95 searches).
 */
export async function searchYouTube(ctx: SearchContext): Promise<{ items: ResultItem[] }> {
  const key = process.env.YOUTUBE_API_KEY!;
  const r = regionParams[ctx.region];

  const search = await fetchJson<SearchList>(
    `${API}/search?` +
      new URLSearchParams({
        part: "snippet",
        type: "video",
        q: ctx.query,
        maxResults: "15",
        order: "relevance",
        relevanceLanguage: r.lang,
        regionCode: r.geo,
        key,
      }),
  );
  const ids = search.items.map((v) => v.id.videoId).filter(Boolean);
  if (ids.length === 0) return { items: [] };

  const stats = await fetchJson<VideoList>(
    `${API}/videos?` + new URLSearchParams({ part: "statistics", id: ids.join(","), key }),
  );
  const statsById = new Map(stats.items.map((v) => [v.id, v.statistics]));
  const num = (s?: string) => (s ? Number(s) : 0);

  const topViewed = [...ids]
    .sort((a, b) => num(statsById.get(b)?.viewCount) - num(statsById.get(a)?.viewCount))
    .slice(0, 5);

  const commentsById = new Map<string, string[]>();
  await Promise.all(
    topViewed.map(async (videoId) => {
      try {
        const threads = await fetchJson<CommentThreads>(
          `${API}/commentThreads?` +
            new URLSearchParams({
              part: "snippet",
              videoId,
              maxResults: "20",
              order: "relevance",
              textFormat: "plainText",
              key,
            }),
        );
        commentsById.set(
          videoId,
          threads.items.slice(0, 12).map((t) => {
            const s = t.snippet.topLevelComment.snippet;
            return `(${s.likeCount}♥) ${clean(s.textDisplay, 400)}`;
          }),
        );
      } catch {
        // Comments disabled on this video (403) — ignore.
      }
    }),
  );

  const items: ResultItem[] = search.items.map((v) => {
    const st = statsById.get(v.id.videoId);
    return {
      source: "youtube",
      title: clean(v.snippet.title, 200),
      url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
      text: clean(v.snippet.description, 400),
      author: v.snippet.channelTitle,
      date: v.snippet.publishedAt,
      metrics: {
        views: num(st?.viewCount),
        likes: num(st?.likeCount),
        comentarios: num(st?.commentCount),
      },
      comments: commentsById.get(v.id.videoId),
    };
  });
  return { items };
}
