import { NextResponse } from "next/server";
import { runSources, SOURCES } from "@/lib/sources";
import type { Mode, Region, SearchRequest, SearchResponse, SourceId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODES: Mode[] = ["validar", "mercado", "concorrentes", "tendencias"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<SearchRequest> | null;
  const query = body?.query?.trim();
  if (!query || query.length > 200) {
    return NextResponse.json({ error: "Informe um tema de até 200 caracteres." }, { status: 400 });
  }
  const mode: Mode = MODES.includes(body?.mode as Mode) ? (body!.mode as Mode) : "validar";
  const region: Region = body?.region === "us" ? "us" : "br";
  const sources = (body?.sources ?? []).filter((s): s is SourceId => s in SOURCES);
  if (sources.length === 0) {
    return NextResponse.json({ error: "Selecione pelo menos uma fonte." }, { status: 400 });
  }

  const results = await runSources(sources, { query, region });
  const response: SearchResponse = { query, mode, region, results };
  return NextResponse.json(response);
}
