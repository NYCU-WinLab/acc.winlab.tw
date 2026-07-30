import { NextResponse } from "next/server";

import { extract } from "@/lib/scan/extract";
import { mapPool, peek } from "@/lib/scan/fetch";
import { sampleControl } from "@/lib/scan/probe";
import {
  cooldownRemaining,
  readLastScan,
  startCooldown,
  storeConfigured,
} from "@/lib/scan/store";
import { absolute, target } from "@/lib/scan/target";
import { normalize } from "@/lib/scan/url";
import { visitorFrom } from "@/lib/scan/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Opens a scan: enforces the cooldown, samples how the site reports missing
 * things, and returns the seed page list (sitemaps included) for the client to
 * work through in batches.
 */
export async function POST(request: Request) {
  const visitor = visitorFrom(request.headers);
  const remaining = await cooldownRemaining(visitor);
  if (remaining > 0) {
    return NextResponse.json(
      {
        error: "cooldown",
        remaining,
        lastScan: await readLastScan(),
      },
      { status: 429 }
    );
  }

  const control = await sampleControl();
  const seeds = target.seeds.map((path) => absolute(path));
  const discovered = new Set<string>();
  for (const seed of seeds) {
    const normalized = normalize(seed);
    if (normalized) discovered.add(normalized);
  }

  await mapPool(seeds, target.concurrency.pages, async (url) => {
    const response = await peek(url, { bytes: 512 * 1024 });
    if (response.status !== 200 || !response.text) return;
    const { newPages } = extract(url, response.text, response.contentType);
    for (const page of newPages) discovered.add(page);
  });

  await startCooldown(visitor);

  return NextResponse.json({
    control,
    pages: [...discovered],
    cooldownSeconds: target.cooldownSeconds,
    cachedResults: storeConfigured(),
    target: { origin: target.origin, label: target.label },
  });
}
