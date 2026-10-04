# Pesquisador

App web (Next.js) que coleta **dados reais** de várias fontes sobre um tema de negócio e gera um relatório com o Claude, com **cada afirmação ligada à fonte original**.

| Fonte | O que traz | Chave |
|---|---|---|
| Reddit | Posts + comentários principais dos posts mais discutidos | Opcional (ver abaixo) |
| YouTube | Vídeos, views/likes e comentários principais dos mais vistos | `YOUTUBE_API_KEY` |
| Google | Resultados orgânicos, "pessoas também perguntam", buscas relacionadas | `SERPER_API_KEY` **ou** `SERPAPI_KEY` |
| Google Notícias | Notícias recentes | mesma do Google |
| Google Trends | Interesse em 5 anos + buscas em alta | `SERPAPI_KEY` |
| Hacker News | Discussões e comentários (bom pra SaaS/tech) | Não precisa |
| Claude | Relatório com dores, demanda, concorrentes, tendências | `ANTHROPIC_API_KEY` |

Tipos de análise: **validar ideia**, **mercado/nicho**, **concorrentes**, **tendências**. Região: Brasil (pt-BR) ou EUA (inglês).

## Rodando

```bash
npm install
cp .env.example .env.local   # preencha as chaves que tiver
npm run dev                  # http://localhost:3000
```

Fontes sem chave ficam desabilitadas na tela, e o resto funciona normal.

## Como conseguir cada chave

### Claude (Anthropic)
1. https://console.anthropic.com → **API Keys** → *Create Key*.
2. Adicione créditos em *Billing*. O custo de cada relatório depende do volume de dados coletados; acompanhe em *Usage* no console.

### YouTube Data API v3 (grátis, 10.000 unidades/dia)
1. https://console.cloud.google.com → crie um projeto.
2. *APIs e serviços → Biblioteca* → ative **YouTube Data API v3**.
3. *Credenciais → Criar credenciais → Chave de API*. Restrinja a chave à YouTube Data API.
4. Cada pesquisa gasta umas 106 unidades (a busca custa 100), o que dá umas 90 pesquisas por dia.

### Google Search: escolha um
A **Custom Search JSON API do Google foi fechada para novos clientes** (e desliga em 01/01/2027), por isso o app usa provedores de SERP:
- **Serper.dev** (mais barato): https://serper.dev → cadastro → buscas grátis pra começar → copie a API key para `SERPER_API_KEY`.
- **SerpAPI**: https://serpapi.com → plano grátis com cota mensal pequena → `SERPAPI_KEY`. **É a única opção que também habilita o Google Trends**, já que o Google não tem API pública de Trends.

Se as duas estiverem configuradas, o Google e as Notícias usam o Serper e o Trends usa o SerpAPI.

### Reddit
Desde nov/2025 o Reddit **não libera mais chaves self-service**: toda credencial nova de API passa por aprovação manual pela *Responsible Builder Policy* (pedido pelo formulário de Developer Support; leva semanas).

- **Sem credenciais (padrão):** o app usa os endpoints públicos `.json` (`/search.json`, `/comments/{id}.json`). Funciona pra uso pessoal, mas o limite é baixo e o Reddit costuma bloquear IPs de datacenter, então é bom rodar local.
- **Com credenciais aprovadas:** em https://www.reddit.com/prefs/apps crie o app e preencha `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` e `REDDIT_USER_AGENT` (formato `web:pesquisador:v0.1 (by /u/seu_usuario)`). O app passa a usar `oauth.reddit.com` com OAuth `client_credentials`. Endpoints usados ([doc](https://www.reddit.com/dev/api/)): `GET /search` e `GET /comments/{article}`.

## Arquitetura

```
app/
  page.tsx              UI: formulário, abas por fonte, relatório em streaming
  api/search/route.ts   roda as fontes em paralelo, e cada uma falha isolada
  api/analyze/route.ts  manda os dados numerados pro Claude e faz stream do relatório
  api/status/route.ts   informa quais fontes estão configuradas (sem expor chaves)
lib/
  sources/*.ts          um arquivo por fonte
  prompt.ts             prompts por tipo de análise + numeração das fontes [n]
```

## ⚠️ Antes de publicar

O app não tem login. Se você subir na Vercel com as chaves configuradas, qualquer pessoa com o link vai gastar seus créditos (Anthropic, Serper/SerpAPI, cota do YouTube). Coloque autenticação antes de deixar público.
