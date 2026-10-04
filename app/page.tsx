"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildUserPrompt } from "@/lib/prompt";
import {
  MODE_LABELS,
  SOURCE_LABELS,
  type Mode,
  type Region,
  type SearchResponse,
  type SourceId,
  type SourceResult,
} from "@/lib/types";

interface Status {
  sources: Record<SourceId, string | null>;
  redditMode: "oauth" | "publico";
  claude: boolean;
}

const ALL_SOURCES = Object.keys(SOURCE_LABELS) as SourceId[];

const fmt = new Intl.NumberFormat("pt-BR", { notation: "compact" });

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("validar");
  const [region, setRegion] = useState<Region>("br");
  const [selected, setSelected] = useState<SourceId[]>(ALL_SOURCES);
  const [searching, setSearching] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState<"relatorio" | SourceId>("relatorio");

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: Status) => {
        setStatus(s);
        setSelected(ALL_SOURCES.filter((id) => !s.sources[id]));
      })
      .catch(() => {});
  }, []);

  const refs = useMemo(() => (data ? buildUserPrompt(data).refs : []), [data]);

  // Turn "[12]" citations into links to the original source.
  const linkedReport = useMemo(
    () =>
      report.replace(/\[(\d+)\](?!\()/g, (m, n) => {
        const ref = refs[Number(n) - 1];
        return ref ? `[[${n}]](${ref.url})` : m;
      }),
    [report, refs],
  );

  async function analyze(payload: SearchResponse) {
    setAnalyzing(true);
    setReport("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        setReport(`> ❌ ${await res.text()}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setReport((r) => r + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      setReport(`> ❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalyzing(false);
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || selected.length === 0) return;
    setSearching(true);
    setError(null);
    setData(null);
    setReport("");
    setTab("relatorio");
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mode, region, sources: selected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro na pesquisa");
      setData(json);
      const total = (json as SearchResponse).results.reduce((s, r) => s + r.items.length, 0);
      if (status?.claude && total > 0) analyze(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  function toggle(id: SourceId) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function exportJson() {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ ...data, relatorio: report }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pesquisa-${data.query.replace(/\W+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="container">
      <header className="header">
        <h1>Pesquisador</h1>
        <p className="muted">
          Coleta dados reais do Reddit, YouTube, Google, notícias, Hacker News e Google Trends, e gera um relatório
          com fontes citadas.
        </p>
      </header>

      <form onSubmit={search} className="card form">
        <input
          className="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Ex.: "software para clínica veterinária", "Notion", "marmita fit"'
          maxLength={200}
          autoFocus
        />
        <div className="row">
          <label>
            Tipo de análise
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Região / idioma
            <select value={region} onChange={(e) => setRegion(e.target.value as Region)}>
              <option value="br">Brasil (pt-BR)</option>
              <option value="us">EUA (inglês)</option>
            </select>
          </label>
        </div>
        <div className="sources">
          {ALL_SOURCES.map((id) => {
            const reason = status?.sources[id];
            return (
              <label key={id} className={`chip ${reason ? "disabled" : ""}`} title={reason ?? ""}>
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  disabled={Boolean(reason)}
                  onChange={() => toggle(id)}
                />
                {SOURCE_LABELS[id]}
                {id === "reddit" && status?.redditMode === "publico" && <small> (público)</small>}
              </label>
            );
          })}
        </div>
        {status && !status.claude && (
          <p className="warn">ANTHROPIC_API_KEY não configurada: os dados serão coletados, mas sem relatório.</p>
        )}
        <button type="submit" disabled={searching || !query.trim() || selected.length === 0}>
          {searching ? "Coletando dados…" : "Pesquisar"}
        </button>
      </form>

      {error && <p className="card error">{error}</p>}

      {data && (
        <section className="card">
          <nav className="tabs">
            <button className={tab === "relatorio" ? "active" : ""} onClick={() => setTab("relatorio")}>
              Relatório
            </button>
            {data.results.map((r) => (
              <button key={r.source} className={tab === r.source ? "active" : ""} onClick={() => setTab(r.source)}>
                {SOURCE_LABELS[r.source]} <span className={`badge ${r.error ? "bad" : ""}`}>{badge(r)}</span>
              </button>
            ))}
            <span className="spacer" />
            <button onClick={exportJson} className="ghost">
              Exportar JSON
            </button>
          </nav>

          {tab === "relatorio" ? (
            <div className="report">
              {analyzing && !report && <p className="muted">Analisando os dados com Claude…</p>}
              {!analyzing && !report && !status?.claude && (
                <p className="muted">Configure ANTHROPIC_API_KEY para gerar o relatório. Os dados estão nas abas.</p>
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
              >
                {linkedReport}
              </ReactMarkdown>
              {!analyzing && report && status?.claude && (
                <button className="ghost" onClick={() => analyze(data)}>
                  Gerar de novo
                </button>
              )}
            </div>
          ) : (
            <SourcePanel result={data.results.find((r) => r.source === tab)!} />
          )}
        </section>
      )}
    </main>
  );
}

function badge(r: SourceResult) {
  if (r.skipped) return "—";
  if (r.error) return "erro";
  return r.items.length;
}

function SourcePanel({ result }: { result: SourceResult }) {
  if (result.skipped) return <p className="muted">Fonte pulada: {result.skipped}</p>;
  if (result.error) return <p className="error">Erro: {result.error}</p>;

  const timeline = result.extra?.timeline as { data: string; interesse: number }[] | undefined;

  return (
    <div>
      <p className="muted">
        {result.items.length} resultados em {(result.ms / 1000).toFixed(1)}s
      </p>
      {timeline && timeline.length > 0 && <Sparkline points={timeline} />}
      {result.extra && !timeline && <Extras extra={result.extra} />}
      <ul className="items">
        {result.items.map((it, i) => (
          <li key={i}>
            <a href={it.url} target="_blank" rel="noreferrer">
              {it.title}
            </a>
            <div className="meta">
              {[
                it.author,
                it.date && new Date(it.date).toString() !== "Invalid Date"
                  ? new Date(it.date).toLocaleDateString("pt-BR")
                  : it.date,
                ...Object.entries(it.metrics ?? {}).map(([k, v]) => `${fmt.format(v)} ${k}`),
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {it.text && <p>{it.text}</p>}
            {it.comments && it.comments.length > 0 && (
              <details>
                <summary>{it.comments.length} comentários principais</summary>
                <ul className="comments">
                  {it.comments.map((c, j) => (
                    <li key={j}>{c}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Extras({ extra }: { extra: Record<string, unknown> }) {
  const lists = Object.entries(extra).filter(([, v]) => Array.isArray(v) && v.length > 0) as [string, string[]][];
  const subs = extra.subreddits as Record<string, number> | undefined;
  return (
    <div className="extras">
      {lists.map(([k, v]) => (
        <div key={k}>
          <strong>{k === "perguntasRelacionadas" ? "Pessoas também perguntam" : "Buscas relacionadas"}</strong>
          <ul>
            {v.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ))}
      {subs && (
        <div>
          <strong>Subreddits</strong>
          <ul>
            {Object.entries(subs)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([s, n]) => (
                <li key={s}>
                  r/{s} ({n})
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Sparkline({ points }: { points: { data: string; interesse: number }[] }) {
  const w = 720;
  const h = 140;
  const pad = 4;
  const step = (w - pad * 2) / Math.max(points.length - 1, 1);
  const y = (v: number) => h - pad - (v / 100) * (h - pad * 2);
  const d = points.map((p, i) => `${i ? "L" : "M"}${(pad + i * step).toFixed(1)},${y(p.interesse).toFixed(1)}`).join(" ");
  return (
    <figure className="spark">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Interesse ao longo do tempo (Google Trends)">
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
      </svg>
      <figcaption className="muted">
        Interesse de busca (0–100) · {points[0].data} → {points[points.length - 1].data}
      </figcaption>
    </figure>
  );
}
