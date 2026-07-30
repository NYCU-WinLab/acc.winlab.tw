import { NextResponse } from "next/server";

import { mapPool } from "@/lib/scan/fetch";
import { probeResource } from "@/lib/scan/probe";
import { target } from "@/lib/scan/target";
import type { ControlFingerprint, ResourceKind } from "@/lib/scan/types";
import { classify } from "@/lib/scan/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 80;

interface Body {
  urls?: unknown;
  control?: ControlFingerprint;
}

/** Existence check for one batch of non-page resources. */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const urls = Array.isArray(body.urls)
    ? body.urls.filter((u): u is string => typeof u === "string")
    : [];
  const control: ControlFingerprint = body.control ?? {
    missingAttachmentName: null,
    bogusPageStatus: 404,
  };
  const batch = urls.slice(0, MAX_BATCH);
  if (batch.length === 0) return NextResponse.json({ results: [] });

  const results = await mapPool(batch, target.concurrency.resources, (url) =>
    probeResource(url, classify(url) as ResourceKind, control)
  );

  return NextResponse.json({ results });
}
