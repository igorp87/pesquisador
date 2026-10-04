export type SourceId =
  | "reddit"
  | "youtube"
  | "google"
  | "news"
  | "hackernews"
  | "trends";

export type Mode = "validar" | "mercado" | "concorrentes" | "tendencias";

export type Region = "br" | "us";

export interface ResultItem {
  source: SourceId;
  title: string;
  url: string;
  text?: string;
  author?: string;
  /** ISO date */
  date?: string;
  /** e.g. upvotes, comments, views, likes */
  metrics?: Record<string, number>;
  /** Top comments / replies, already plain text */
  comments?: string[];
}

export interface SourceResult {
  source: SourceId;
  items: ResultItem[];
  /** Extra non-item data, e.g. trends timeline or related searches */
  extra?: Record<string, unknown>;
  error?: string;
  skipped?: string;
  ms: number;
}

export interface SearchRequest {
  query: string;
  mode: Mode;
  region: Region;
  sources: SourceId[];
}

export interface SearchResponse {
  query: string;
  mode: Mode;
  region: Region;
  results: SourceResult[];
}

export interface SearchContext {
  query: string;
  region: Region;
}

export const SOURCE_LABELS: Record<SourceId, string> = {
  reddit: "Reddit",
  youtube: "YouTube",
  google: "Google",
  news: "Google Notícias",
  hackernews: "Hacker News",
  trends: "Google Trends",
};

export const MODE_LABELS: Record<Mode, string> = {
  validar: "Validar ideia de negócio",
  mercado: "Análise de mercado / nicho",
  concorrentes: "Monitorar concorrentes",
  tendencias: "Encontrar tendências",
};
