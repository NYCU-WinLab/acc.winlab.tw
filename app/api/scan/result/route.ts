import { NextResponse } from "next/server";

import {
  cooldownRemaining,
  readLastScan,
  saveScan,
  storeConfigured,
} from "@/lib/scan/store";
import { target } from "@/lib/scan/target";
import type { ScanSummary } from "@/lib/scan/types";
import { visitorFrom } from "@/lib/scan/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The cached result plus whether this visitor may start a fresh scan. */
export async function GET(request: Request) {
  const visitor = visitorFrom(request.headers);
  const [lastScan, remaining] = await Promise.all([
    readLastScan(),
    cooldownRemaining(visitor),
  ]);
  return NextResponse.json({
    lastScan,
    cooldownRemaining: remaining,
    cooldownSeconds: target.cooldownSeconds,
    shared: storeConfigured(),
    target: { origin: target.origin, label: target.label },
  });
}

export async function POST(request: Request) {
  let summary: ScanSummary;
  try {
    summary = (await request.json()) as ScanSummary;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!summary || typeof summary.finishedAt !== "string") {
    return NextResponse.json({ error: "invalid summary" }, { status: 400 });
  }
  await saveScan(summary);
  return NextResponse.json({ saved: storeConfigured() });
}
