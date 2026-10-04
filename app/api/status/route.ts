import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/sources";
import type { SourceId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the UI which sources/features are configured, without exposing any key. */
export async function GET() {
  const sources = Object.fromEntries(
    (Object.keys(SOURCES) as SourceId[]).map((id) => [id, SOURCES[id].unavailable()]),
  );
  return NextResponse.json({
    sources,
    redditMode: process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET ? "oauth" : "publico",
    claude: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  });
}
