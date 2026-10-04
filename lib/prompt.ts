import type { Mode, SearchResponse } from "./types";
import { MODE_LABELS, SOURCE_LABELS } from "./types";

export const SYSTEM_PROMPT = `Você é um analista de pesquisa de mercado. Recebe dados brutos coletados agora de fontes reais (Reddit, YouTube, Google, Google Notícias, Hacker News, Google Trends) e escreve um relatório em português do Brasil, em Markdown.

Regras de evidência:
- Baseie cada afirmação nos dados fornecidos e cite as fontes com o número entre colchetes, ex.: [3] ou [3][12]. Toda conclusão importante precisa de pelo menos uma citação.
- Não invente números, tamanhos de mercado, preços ou empresas que não aparecem nos dados. Se precisar de um dado que não foi coletado, diga que ele falta e sugira como obtê-lo.
- Diferencie sinal forte (vários relatos independentes, alto engajamento) de sinal fraco (um post isolado). Diga explicitamente quando a amostra é pequena ou enviesada (ex.: Hacker News é muito tech; Reddit é majoritariamente em inglês).
- Use as métricas (upvotes, views, comentários, interesse no Trends) para ponderar relevância.
- Seja direto. Prefira listas e tabelas a parágrafos longos.`;

const MODE_INSTRUCTIONS: Record<Mode, string> = {
  validar: `Objetivo: validar a ideia de negócio. Estruture assim:
## Veredito rápido (demanda: forte / moderada / fraca / sem evidência — e por quê)
## Dores reais encontradas (tabela: dor | frequência/intensidade | citações)
## O que as pessoas já usam hoje e reclamam (alternativas e soluções improvisadas)
## Disposição para pagar (sinais explícitos de pagamento, preços mencionados)
## Riscos e sinais contrários
## Próximos passos de validação (experimentos baratos e concretos)`,
  mercado: `Objetivo: análise de mercado/nicho. Estruture assim:
## Resumo do nicho
## Tamanho e direção da demanda (Trends, volume de discussão, engajamento)
## Segmentos de público e o que cada um busca
## Principais players e posicionamento (somente os que aparecem nos dados)
## Lacunas e oportunidades
## Perguntas que o público faz (de "pessoas também perguntam", títulos e comentários)
## Dados que faltam para decidir`,
  concorrentes: `Objetivo: monitorar o(s) concorrente(s) pesquisado(s). Estruture assim:
## Resumo da percepção pública
## Elogios recorrentes (tabela: ponto | citações)
## Reclamações recorrentes (tabela: problema | gravidade | citações)
## Notícias e movimentos recentes
## Alternativas que as pessoas mencionam
## Oportunidades para competir`,
  tendencias: `Objetivo: identificar tendências. Estruture assim:
## Resumo
## Direção da tendência (crescendo / estável / caindo — use o Trends e a data dos posts/vídeos)
## Subtemas e buscas em alta
## Quem está falando disso (comunidades, canais, veículos)
## Oportunidades de produto/conteúdo derivadas
## Sinais de que pode ser modismo passageiro`,
};

/** Compact, numbered rendering of collected data so the model can cite [n]. */
export function buildUserPrompt(data: SearchResponse): { prompt: string; refs: { n: number; url: string; title: string }[] } {
  const refs: { n: number; url: string; title: string }[] = [];
  const parts: string[] = [];

  for (const r of data.results) {
    const label = SOURCE_LABELS[r.source];
    if (r.skipped || r.error) {
      parts.push(`### ${label}\n(indisponível: ${r.skipped ?? r.error})`);
      continue;
    }
    const lines: string[] = [`### ${label} — ${r.items.length} resultados`];
    if (r.extra && r.source !== "trends") {
      lines.push(`Dados extras: ${JSON.stringify(r.extra)}`);
    }
    if (r.source === "trends" && r.extra) {
      lines.push(`Resumo do interesse (escala 0-100, últimos 5 anos): ${JSON.stringify(r.extra.resumo)}`);
    }
    for (const it of r.items) {
      const n = refs.length + 1;
      refs.push({ n, url: it.url, title: it.title });
      const meta = [
        it.author && `por ${it.author}`,
        it.date && it.date.slice(0, 10),
        it.metrics &&
          Object.entries(it.metrics)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", "),
      ]
        .filter(Boolean)
        .join(" | ");
      let block = `[${n}] ${it.title}${meta ? ` (${meta})` : ""}`;
      if (it.text) block += `\n${it.text}`;
      if (it.comments?.length) block += `\nComentários:\n- ${it.comments.join("\n- ")}`;
      lines.push(block);
    }
    parts.push(lines.join("\n\n"));
  }

  const prompt = `Tema pesquisado: "${data.query}"
Tipo de análise: ${MODE_LABELS[data.mode]}
Região/idioma priorizado: ${data.region === "br" ? "Brasil (pt-BR)" : "EUA (en)"}

${MODE_INSTRUCTIONS[data.mode]}

<dados_coletados>
${parts.join("\n\n---\n\n")}
</dados_coletados>

Escreva o relatório agora, seguindo a estrutura pedida e citando as fontes por número.`;

  return { prompt, refs };
}
