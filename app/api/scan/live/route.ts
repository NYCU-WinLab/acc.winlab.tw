import { NextResponse } from "next/server";

import { clearLive, readLive, writeLive } from "@/lib/scan/store";
import type { LiveScan } from "@/lib/scan/types";
import { visitorFrom } from "@/lib/scan/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * The broadcast channel for a scan in flight.
 *
 * The browser driving the scan POSTs its progress here; every other visitor
 * reads it from `/api/scan/result` and watches instead of starting a second
 * pass against the same target.
 */
export async function POST(request: Request) {
  const visitor = visitorFrom(request.headers);
  let body: Partial<LiveScan>;
  try {
    body = (await request.json()) as Partial<LiveScan>;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const current = await readLive();
  // Someone else already holds the channel: tell the caller rather than
  // overwriting a scan that is still running.
  if (current && current.by !== visitor) {
    return NextResponse.json({ error: "busy", live: current }, { status: 409 });
  }

  const state: LiveScan = {
    startedAt: body.startedAt ?? current?.startedAt ?? new Date().toISOString(),
    label: body.label ?? "",
    done: Number(body.done ?? 0),
    total: Number(body.total ?? 0),
    note: body.note ?? "",
    by: visitor,
  };
  await writeLive(state);
  return NextResponse.json({ live: state });
}

export async function DELETE(request: Request) {
  await clearLive(visitorFrom(request.headers));
  return NextResponse.json({ live: null });
}
