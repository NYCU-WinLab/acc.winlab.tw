import { visitorKey } from "./store";

/** Vercel puts the client address in x-forwarded-for; Next 16 dropped request.ip. */
export function visitorFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const ip =
    forwarded.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  return visitorKey(ip);
}
