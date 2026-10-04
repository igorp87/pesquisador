import Anthropic from "@anthropic-ai/sdk";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/prompt";
import type { SearchResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const client = new Anthropic();

export async function POST(req: Request) {
  const data = (await req.json().catch(() => null)) as SearchResponse | null;
  if (!data?.results?.length) {
    return new Response("Nada para analisar — rode uma pesquisa primeiro.", { status: 400 });
  }
  const totalItems = data.results.reduce((s, r) => s + r.items.length, 0);
  if (totalItems === 0) {
    return new Response("Nenhuma fonte retornou resultados para analisar.", { status: 400 });
  }

  const { prompt } = buildUserPrompt(data);
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = client.beta.messages.stream({
          model: "claude-opus-5-5",
          max_tokens: 32000,
          output_config: { effort: "medium" },
          // On a safety decline, the API re-runs the request on Anthropic's recommended fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n> ⚠️ O modelo recusou analisar este conteúdo."));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n> ⚠️ Relatório cortado por limite de tamanho."));
        }
      } catch (err) {
        let msg = "Erro ao gerar análise.";
        if (err instanceof Anthropic.AuthenticationError) {
          msg = "ANTHROPIC_API_KEY inválida ou ausente.";
        } else if (err instanceof Anthropic.RateLimitError) {
          msg = "Limite de requisições da Anthropic atingido. Tente de novo em instantes.";
        } else if (err instanceof Anthropic.APIError) {
          msg = `Erro da API Anthropic (${err.status}): ${err.message}`;
        } else if (err instanceof Error) {
          msg = err.message;
        }
        controller.enqueue(encoder.encode(`\n\n> ❌ ${msg}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
