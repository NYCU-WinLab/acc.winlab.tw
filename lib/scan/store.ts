import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

import { target } from "./target";
import type { LiveScan, ScanSummary } from "./types";

const LAST_SCAN_KEY = "acc:last-scan";
const LIVE_KEY = "acc:live";
const COOLDOWN_PREFIX = "acc:cooldown:";

/**
 * How long a published live scan survives without a refresh. Long enough to
 * cover one slow batch, short enough that an abandoned tab stops blocking the
 * next scan. The client refreshes far more often than this.
 */
const LIVE_TTL_SECONDS = 90;

/**
 * Redis is optional on purpose. Without it the app still scans; it just cannot
 * share a cached result between visitors or enforce the cooldown server-side.
 * That keeps local development and a first deploy unblocked.
 */
function client(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function storeConfigured(): boolean {
  return client() !== null;
}

/** Visitors are identified by a salted hash, never by a stored raw IP. */
export function visitorKey(ip: string): string {
  const salt = process.env.SCAN_IP_SALT ?? "acc.winlab.tw";
  return createHash("sha256")
    .update(`${salt}:${ip}`)
    .digest("hex")
    .slice(0, 16);
}

export async function readLastScan(): Promise<ScanSummary | null> {
  const redis = client();
  if (!redis) return null;
  try {
    return (await redis.get<ScanSummary>(LAST_SCAN_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function saveScan(summary: ScanSummary): Promise<void> {
  const redis = client();
  if (!redis) return;
  try {
    await redis.set(LAST_SCAN_KEY, summary);
  } catch {
    // A failed cache write must not fail the scan the user just waited for.
  }
}

export async function readLive(): Promise<LiveScan | null> {
  const redis = client();
  if (!redis) return null;
  try {
    return (await redis.get<LiveScan>(LIVE_KEY)) ?? null;
  } catch {
    return null;
  }
}

/** Publishes (or refreshes) the in-flight scan. The TTL is the heartbeat. */
export async function writeLive(state: LiveScan): Promise<void> {
  const redis = client();
  if (!redis) return;
  try {
    await redis.set(LIVE_KEY, state, { ex: LIVE_TTL_SECONDS });
  } catch {
    // Best-effort: losing the broadcast must not stop the scan itself.
  }
}

/** Only the visitor who started the scan may retract it. */
export async function clearLive(visitor: string): Promise<void> {
  const redis = client();
  if (!redis) return;
  try {
    const current = await redis.get<LiveScan>(LIVE_KEY);
    if (current && current.by !== visitor) return;
    await redis.del(LIVE_KEY);
  } catch {
    // The TTL will clear it anyway.
  }
}

/** Remaining cooldown in seconds; 0 means a scan may start. */
export async function cooldownRemaining(visitor: string): Promise<number> {
  const redis = client();
  if (!redis) return 0;
  try {
    const ttl = await redis.ttl(`${COOLDOWN_PREFIX}${visitor}`);
    return ttl > 0 ? ttl : 0;
  } catch {
    return 0;
  }
}

export async function startCooldown(visitor: string): Promise<void> {
  const redis = client();
  if (!redis) return;
  try {
    await redis.set(`${COOLDOWN_PREFIX}${visitor}`, Date.now(), {
      ex: target.cooldownSeconds,
    });
  } catch {
    // Same reasoning as saveScan: best-effort.
  }
}
