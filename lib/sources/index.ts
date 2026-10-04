import type { SearchContext, SourceId, SourceResult, ResultItem } from "../types";
import { searchReddit } from "./reddit";
import { searchYouTube } from "./youtube";
import { googleProvider, searchGoogle, searchNews, searchTrends } from "./google";
import { searchHackerNews } from "./hackernews";

type Runner = (ctx: SearchContext) => Promise<{ items: ResultItem[]; extra?: Record<string, unknown> }>;

interface SourceDef {
  run: Runner;
  /** Returns a reason string when the source can't run (missing key), or null. */
  unavailable: () => string | null;
}

export const SOURCES: Record<SourceId, SourceDef> = {
  reddit: { run: searchReddit, unavailable: () => null },
  youtube: {
    run: searchYouTube,
    unavailable: () => (process.env.YOUTUBE_API_KEY ? null : "YOUTUBE_API_KEY não configurada"),
  },
  google: {
    run: searchGoogle,
    unavailable: () => (googleProvider() ? null : "SERPER_API_KEY ou SERPAPI_KEY não configurada"),
  },
  news: {
    run: searchNews,
    unavailable: () => (googleProvider() ? null : "SERPER_API_KEY ou SERPAPI_KEY não configurada"),
  },
  hackernews: { run: searchHackerNews, unavailable: () => null },
  trends: {
    run: searchTrends,
    unavailable: () => (process.env.SERPAPI_KEY ? null : "Google Trends requer SERPAPI_KEY"),
  },
};

export async function runSources(ids: SourceId[], ctx: SearchContext): Promise<SourceResult[]> {
  return Promise.all(
    ids.map(async (source): Promise<SourceResult> => {
      const def = SOURCES[source];
      const start = Date.now();
      const reason = def.unavailable();
      if (reason) return { source, items: [], skipped: reason, ms: 0 };
      try {
        const { items, extra } = await def.run(ctx);
        return { source, items, extra, ms: Date.now() - start };
      } catch (err) {
        return {
          source,
          items: [],
          error: err instanceof Error ? err.message : String(err),
          ms: Date.now() - start,
        };
      }
    }),
  );
}
