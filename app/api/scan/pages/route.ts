import { NextResponse } from "next/server";

import { extract } from "@/lib/scan/extract";
import { mapPool, peek } from "@/lib/scan/fetch";
import { target } from "@/lib/scan/target";
import type { PageResult } from "@/lib/scan/types";
import { isInternal } from "@/lib/scan/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 40;

/** Fetches one batch of pages: status, soft-404 check, links, emails, mailto audit. */
export async function POST(request: Request) {
  let urls: string[];
  try {
    const body = (await request.json()) as { urls?: unknown };
    urls = Array.isArray(body.urls)
      ? body.urls.filter((u): u is string => typeof u === "string")
      : [];
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const batch = urls.filter(isInternal).slice(0, MAX_BATCH);
  if (batch.length === 0) return NextResponse.json({ results: [] });

  const collected = await mapPool(
    batch,
    target.concurrency.pages,
    async (url): Promise<{ result: PageResult; undefinedSubjects: number }> => {
      const response = await peek(url, { bytes: 512 * 1024 });
      if (response.status !== 200) {
        return {
          undefinedSubjects: 0,
          result: {
            url,
            status: response.status,
            softNotFound: false,
            title: "",
            error: response.error,
            links: [],
            newPages: [],
            emails: [],
            findings: [],
          },
        };
      }
      const parsed = extract(url, response.text, response.contentType);
      const findings = [...parsed.findings];
      if (parsed.softNotFound) {
        findings.push({
          id: `soft404:${url}`,
          severity: "dead",
          category: "頁面",
          title: `${parsed.title || url}：伺服器回 200，內容卻是查無資料`,
          detail: "頁面本身能開，但顯示的是錯誤或空資料訊息。",
          url,
          pages: [url],
        });
      }
      return {
        undefinedSubjects: parsed.undefinedSubjects,
        result: {
          url,
          status: response.status,
          softNotFound: parsed.softNotFound,
          title: parsed.title,
          links: parsed.links,
          newPages: parsed.newPages,
          emails: parsed.emails,
          findings,
        },
      };
    }
  );

  return NextResponse.json({
    results: collected.map((entry) => entry.result),
    undefinedSubjects: collected.reduce(
      (total, entry) => total + entry.undefinedSubjects,
      0
    ),
  });
}
