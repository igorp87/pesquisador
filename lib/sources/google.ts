import { clean, fetchJson, regionParams } from "../http";
import type { ResultItem, SearchContext } from "../types";

type Out = { items: ResultItem[]; extra?: Record<string, unknown> };

export const googleProvider = () =>
  process.env.SERPER_API_KEY ? "serper" : process.env.SERPAPI_KEY ? "serpapi" : null;

// ---------- Serper.dev ----------

interface SerperSearch {
  organic?: { title: string; link: string; snippet?: string; date?: string }[];
  peopleAlsoAsk?: { question: string; snippet?: string }[];
  relatedSearches?: { query: string }[];
}

interface SerperNews {
  news?: { title: string; link: string; snippet?: string; date?: string; source?: string }[];
}

async function serper<T>(endpoint: "search" | "news", ctx: SearchContext): Promise<T> {
  const r = regionParams[ctx.region];
  return fetchJson<T>(`https://google.serper.dev/${endpoint}`, {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: ctx.query, gl: r.gl, hl: r.hl, num: 20 }),
  });
}

// ---------- SerpAPI ----------

interface SerpApiSearch {
  organic_results?: { title: string; link: string; snippet?: string; date?: string }[];
  related_questions?: { question: string; snippet?: string }[];
  related_searches?: { query: string }[];
}

interface SerpApiNews {
  news_results?: {
    title: string;
    link: string;
    snippet?: string;
    date?: string;
    iso_date?: string;
    source?: { name?: string };
  }[];
}

async function serpapi<T>(params: Record<string, string>): Promise<T> {
  return fetchJson<T>(
    "https://serpapi.com/search.json?" +
      new URLSearchParams({ ...params, api_key: process.env.SERPAPI_KEY! }),
    { timeoutMs: 30000 },
  );
}

// ---------- public ----------

export async function searchGoogle(ctx: SearchContext): Promise<Out> {
  const r = regionParams[ctx.region];
  let organic: { title: string; link: string; snippet?: string; date?: string }[] = [];
  let questions: { question: string; snippet?: string }[] = [];
  let related: string[] = [];

  if (googleProvider() === "serper") {
    const d = await serper<SerperSearch>("search", ctx);
    organic = d.organic ?? [];
    questions = d.peopleAlsoAsk ?? [];
    related = (d.relatedSearches ?? []).map((x) => x.query);
  } else {
    const d = await serpapi<SerpApiSearch>({ engine: "google", q: ctx.query, gl: r.gl, hl: r.hl, num: "20" });
    organic = d.organic_results ?? [];
    questions = d.related_questions ?? [];
    related = (d.related_searches ?? []).map((x) => x.query);
  }

  return {
    items: organic.map((o) => ({
      source: "google",
      title: clean(o.title, 200),
      url: o.link,
      text: clean(o.snippet, 400),
      date: o.date,
    })),
    extra: {
      perguntasRelacionadas: questions.map((q) => q.question),
      buscasRelacionadas: related,
    },
  };
}

export async function searchNews(ctx: SearchContext): Promise<Out> {
  const r = regionParams[ctx.region];
  if (googleProvider() === "serper") {
    const d = await serper<SerperNews>("news", ctx);
    return {
      items: (d.news ?? []).map((n) => ({
        source: "news",
        title: clean(n.title, 200),
        url: n.link,
        text: clean(n.snippet, 400),
        author: n.source,
        date: n.date,
      })),
    };
  }
  const d = await serpapi<SerpApiNews>({ engine: "google_news", q: ctx.query, gl: r.gl, hl: r.hl });
  return {
    items: (d.news_results ?? []).slice(0, 20).map((n) => ({
      source: "news",
      title: clean(n.title, 200),
      url: n.link,
      text: clean(n.snippet, 400),
      author: n.source?.name,
      date: n.iso_date ?? n.date,
    })),
  };
}

// ---------- Google Trends (SerpAPI only — Google has no public Trends API) ----------

interface TrendsTimeseries {
  interest_over_time?: {
    timeline_data?: { date: string; values: { extracted_value: number }[] }[];
  };
}

interface TrendsRelated {
  related_queries?: {
    rising?: { query: string; value: string }[];
    top?: { query: string; value: string }[];
  };
}

export async function searchTrends(ctx: SearchContext): Promise<Out> {
  const r = regionParams[ctx.region];
  const base = { engine: "google_trends", q: ctx.query, geo: r.geo, hl: r.hl, date: "today 5-y" };
  const [ts, rel] = await Promise.all([
    serpapi<TrendsTimeseries>({ ...base, data_type: "TIMESERIES" }),
    serpapi<TrendsRelated>({ ...base, data_type: "RELATED_QUERIES" }).catch(() => ({}) as TrendsRelated),
  ]);

  const timeline = (ts.interest_over_time?.timeline_data ?? []).map((p) => ({
    data: p.date,
    interesse: p.values[0]?.extracted_value ?? 0,
  }));

  // Summarize the 5-year weekly series so the model sees the shape, not 260 points.
  const avg = (arr: { interesse: number }[]) =>
    arr.length ? Math.round(arr.reduce((s, p) => s + p.interesse, 0) / arr.length) : 0;
  const last12m = timeline.slice(-52);
  const prev12m = timeline.slice(-104, -52);
  const resumo = {
    mediaUltimos12m: avg(last12m),
    media12mAnteriores: avg(prev12m),
    variacao:
      avg(prev12m) > 0 ? `${Math.round(((avg(last12m) - avg(prev12m)) / avg(prev12m)) * 100)}%` : "n/d",
    pico: timeline.reduce((m, p) => (p.interesse > m.interesse ? p : m), { data: "", interesse: -1 }),
  };

  const rising = rel.related_queries?.rising ?? [];
  const top = rel.related_queries?.top ?? [];

  return {
    items: [...rising.map((q) => ({ ...q, tipo: "em alta" })), ...top.map((q) => ({ ...q, tipo: "top" }))]
      .slice(0, 25)
      .map((q) => ({
        source: "trends" as const,
        title: `${q.query} (${q.tipo}: ${q.value})`,
        url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(q.query)}&geo=${r.geo}`,
      })),
    extra: { resumo, timeline },
  };
}
