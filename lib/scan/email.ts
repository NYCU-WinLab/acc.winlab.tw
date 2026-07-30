import { promises as dns } from "node:dns";

import type { EmailResult, Finding } from "./types";

const SYNTAX_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Domain-level reachability only.
 *
 * Whether a specific mailbox exists cannot be settled from outside: SMTP RCPT
 * probing is unreliable against catch-all and Google Workspace domains, and it
 * looks like abuse. So this answers "can this domain receive mail" and leaves
 * per-account verification to the owner's staff list.
 */
export async function probeEmails(
  addresses: readonly string[]
): Promise<EmailResult[]> {
  const domains = new Map<string, Promise<{ mx: string[]; a: string[] }>>();

  const lookup = (domain: string) => {
    const cached = domains.get(domain);
    if (cached) return cached;
    const pending = resolveDomain(domain);
    domains.set(domain, pending);
    return pending;
  };

  return Promise.all(
    addresses.map(async (raw): Promise<EmailResult> => {
      const address = raw
        .normalize("NFKC")
        .trim()
        .replace(/^[.,;]+|[.,;]+$/g, "");
      if (!SYNTAX_RE.test(address)) {
        return {
          address: raw,
          verdict: "dead",
          note: "格式不合法",
          mx: [],
        };
      }
      const domain = address.slice(address.lastIndexOf("@") + 1).toLowerCase();
      const { mx, a } = await lookup(domain);
      if (mx.length > 0) {
        return { address, verdict: "ok", note: `MX ${mx[0]}`, mx };
      }
      if (a.length > 0) {
        return {
          address,
          verdict: "suspect",
          note: "網域沒有 MX 記錄，只有 A 記錄，可能收不到信",
          mx: [],
        };
      }
      return {
        address,
        verdict: "dead",
        note: `網域 ${domain} 無法解析`,
        mx: [],
      };
    })
  );
}

async function resolveDomain(
  domain: string
): Promise<{ mx: string[]; a: string[] }> {
  const mx: string[] = [];
  const a: string[] = [];
  try {
    const records = await dns.resolveMx(domain);
    records.sort((left, right) => left.priority - right.priority);
    mx.push(...records.map((r) => `${r.priority} ${r.exchange}`));
  } catch {
    // No MX is not fatal on its own; RFC 5321 allows an address record fallback.
  }
  if (mx.length === 0) {
    for (const resolver of [dns.resolve4, dns.resolve6]) {
      try {
        a.push(...(await resolver(domain)));
      } catch {
        // ignore, the caller treats an empty result as unresolvable
      }
    }
  }
  return { mx, a };
}

export function emailFinding(
  result: EmailResult,
  pages: string[]
): Finding | null {
  if (result.verdict === "ok") return null;
  return {
    id: `email:${result.address}`,
    severity: result.verdict === "dead" ? "dead" : "suspect",
    category: "Email",
    title: `${result.address}：${result.note}`,
    detail: result.note,
    url: `mailto:${result.address}`,
    label: result.address,
    pages,
  };
}
