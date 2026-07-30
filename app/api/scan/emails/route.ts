import { NextResponse } from "next/server";

import { probeEmails } from "@/lib/scan/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 120;

/** DNS-level deliverability for one batch of addresses. */
export async function POST(request: Request) {
  let addresses: string[];
  try {
    const body = (await request.json()) as { addresses?: unknown };
    addresses = Array.isArray(body.addresses)
      ? body.addresses.filter((a): a is string => typeof a === "string")
      : [];
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const batch = addresses.slice(0, MAX_BATCH);
  if (batch.length === 0) return NextResponse.json({ results: [] });

  return NextResponse.json({ results: await probeEmails(batch) });
}
