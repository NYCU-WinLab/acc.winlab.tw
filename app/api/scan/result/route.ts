import { NextResponse } from "next/server";

import {
  clearLive,
  cooldownRemaining,
  readLastScan,
  readLive,
  saveScan,
  storeConfigured,
} from "@/lib/scan/store";
import { target } from "@/lib/scan/target";
import type { ScanSummary } from "@/lib/scan/types";
import { visitorFrom } from "@/lib/scan/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Everything a page load needs: the last scan, any scan running right now, and
 * whether this visitor may start a fresh one.
 */
export async function GET(request: Request) {
  const visitor = visitorFrom(request.headers);
  const [lastScan, remaining, live] = await Promise.all([
    readLastScan(),
    cooldownRemaining(visitor),
    readLive(),
  ]);
  return NextResponse.json({
    lastScan,
    live,
    /** Whether the running scan is this visitor's own, e.g. after a refresh. */
    liveMine: live !== null && live.by === visitor,
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
  // Saving a result ends the scan, so retract the broadcast in the same call
  // rather than relying on the client to make a second one.
  await Promise.all([
    saveScan(summary),
    clearLive(visitorFrom(request.headers)),
  ]);
  return NextResponse.json({ saved: storeConfigured() });
}
