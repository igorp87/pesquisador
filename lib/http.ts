export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 15000, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(res.status, `HTTP ${res.status} em ${new URL(url).host}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export function clean(text: string | undefined | null, max = 800): string {
  if (!text) return "";
  const t = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export const regionParams = {
  br: { gl: "br", hl: "pt-BR", lang: "pt", geo: "BR" },
  us: { gl: "us", hl: "en", lang: "en", geo: "US" },
} as const;
