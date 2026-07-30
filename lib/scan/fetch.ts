import { target, userAgent } from "./target";

export interface Peek {
  status: number;
  finalUrl: string;
  contentType: string;
  contentLength: number | null;
  filename: string;
  /** First bytes of the body, capped at the peek size. */
  head: Uint8Array;
  /** Decoded text, only when the response looks textual. */
  text: string;
  error?: string;
}

const PEEK_BYTES = 12_288;

/**
 * The site's WAF answers every HEAD with 403, so existence has to be proven
 * with a GET. A byte range keeps that cheap; servers that ignore Range get cut
 * off by cancelling the stream once enough has arrived.
 */
export async function peek(
  url: string,
  options: { referer?: string; bytes?: number; retries?: number } = {}
): Promise<Peek> {
  return withRetry(
    () => peekOnce(url, options),
    options.retries ?? 2,
    (result) => result.status
  );
}

/**
 * A single timeout must not be reported as a dead link. Transient failures
 * (timeout, reset, 5xx, 429) get another try with a growing pause; anything
 * else is a real answer and returns immediately.
 */
async function withRetry<T>(
  run: () => Promise<T>,
  retries: number,
  statusOf: (result: T) => number
): Promise<T> {
  let last = await run();
  for (let attempt = 0; attempt < retries; attempt++) {
    const status = statusOf(last);
    const retryable = status === -1 || status === 429 || status >= 500;
    if (!retryable) return last;
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    last = await run();
  }
  return last;
}

async function peekOnce(
  url: string,
  options: { referer?: string; bytes?: number } = {}
): Promise<Peek> {
  const limit = options.bytes ?? PEEK_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), target.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "*/*",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        Range: `bytes=0-${limit - 1}`,
        ...(options.referer ? { Referer: options.referer } : {}),
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const rawLength = response.headers.get("content-length");
    const head = await readCapped(response, limit);
    const textual =
      /text\/|html|xml|json|javascript|csv/i.test(contentType) ||
      contentType === "";

    return {
      status: response.status,
      finalUrl: response.url || url,
      contentType,
      contentLength: rawLength === null ? null : Number(rawLength),
      filename: filenameFrom(response, url),
      head,
      text: textual ? new TextDecoder("utf-8").decode(head) : "",
    };
  } catch (error) {
    return {
      status: -1,
      finalUrl: url,
      contentType: "",
      contentLength: null,
      filename: "",
      head: new Uint8Array(),
      text: "",
      error: describe(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Full download, used where only the whole file answers the question. */
export interface Downloaded {
  status: number;
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  error?: string;
}

export async function download(
  url: string,
  options: { referer?: string; maxBytes?: number; retries?: number } = {}
): Promise<Downloaded> {
  return withRetry(
    () => downloadOnce(url, options),
    options.retries ?? 2,
    (result) => result.status
  );
}

async function downloadOnce(
  url: string,
  options: { referer?: string; maxBytes?: number } = {}
): Promise<Downloaded> {
  const cap = options.maxBytes ?? 32 * 1024 * 1024;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    target.requestTimeoutMs * 3
  );
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "*/*",
        ...(options.referer ? { Referer: options.referer } : {}),
      },
    });
    const bytes = await readCapped(response, cap);
    return {
      status: response.status,
      bytes,
      contentType: response.headers.get("content-type") ?? "",
      filename: filenameFrom(response, url),
    };
  } catch (error) {
    return {
      status: -1,
      bytes: new Uint8Array(),
      contentType: "",
      filename: "",
      error: describe(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(
  response: Response,
  limit: number
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    // Stop the transfer instead of paying for the rest of a large file.
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= out.length) break;
    const slice = chunk.subarray(0, out.length - offset);
    out.set(slice, offset);
    offset += slice.byteLength;
  }
  return out;
}

function filenameFrom(response: Response, url: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(
    /filename\*?=(?:UTF-8''|utf-8'')?"?([^";]+)"?/i
  );
  const raw = match?.[1];
  if (raw) return safeDecode(raw.trim());
  try {
    const path = new URL(url).pathname;
    return safeDecode(path.slice(path.lastIndexOf("/") + 1));
  } catch {
    return "";
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "逾時";
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ? `${error.message} (${cause.code})` : error.message;
  }
  return String(error);
}

/** Bounded parallelism; keeps the target's server and the function budget sane. */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!, index);
      }
    })()
  );
  await Promise.all(runners);
  return results;
}
