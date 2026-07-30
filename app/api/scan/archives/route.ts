import { NextResponse } from "next/server";

import { probeArchive } from "@/lib/scan/archive";
import { mapPool } from "@/lib/scan/fetch";
import { target } from "@/lib/scan/target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60s is the Hobby-plan ceiling; a batch of 8 archives finishes well inside it.
export const maxDuration = 60;

const MAX_BATCH = 12;

/** Downloads and opens one batch of archives to see whether they hold anything. */
export async function POST(request: Request) {
  let urls: string[];
  try {
    const body = (await request.json()) as { urls?: unknown };
    urls = Array.isArray(body.urls)
      ? body.urls.filter((u): u is string => typeof u === "string")
      : [];
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const batch = urls.slice(0, MAX_BATCH);
  if (batch.length === 0) return NextResponse.json({ results: [] });

  const results = await mapPool(batch, target.concurrency.archives, (url) =>
    probeArchive(url)
  );
  return NextResponse.json({ results });
}
