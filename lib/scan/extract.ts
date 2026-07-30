import * as cheerio from "cheerio";

import { target } from "./target";
import type { Finding, PageLink } from "./types";
import { classify, isListEndpoint, normalize, withPage } from "./url";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export interface Extracted {
  title: string;
  softNotFound: boolean;
  links: PageLink[];
  newPages: string[];
  emails: string[];
  findings: Finding[];
  /** Count of mailto links carrying the CMS's `subject=undefined` bug. */
  undefinedSubjects: number;
}

export function extract(
  pageUrl: string,
  body: string,
  contentType: string
): Extracted {
  const xml = /xml/i.test(contentType) && !/html/i.test(contentType);
  const $ = cheerio.load(body, xml ? { xml: true } : undefined);

  const title = ($("title").first().text() || "").trim().slice(0, 200);
  const links = new Map<string, PageLink>();
  const newPages = new Set<string>();
  const emails = new Set<string>();
  const findings: Finding[] = [];
  let undefinedSubjects = 0;

  const addLink = (raw: string | undefined) => {
    if (!raw) return;
    const value = raw.trim();
    if (
      !value ||
      value.startsWith("#") ||
      /^(javascript|tel|data|about):/i.test(value)
    ) {
      return;
    }
    const url = normalize(value, pageUrl);
    if (!url) return;
    const kind = classify(url);
    if (kind === "skip" || kind === "share") return;
    links.set(url, { url, kind });
    if (kind === "page") {
      newPages.add(url);
      // Older rows hide behind pagination, so enumerate a few pages up front.
      if (isListEndpoint(url)) {
        for (let page = 0; page < target.listPagesToProbe; page++) {
          const paged = withPage(url, page);
          if (paged) newPages.add(paged);
        }
      }
    }
  };

  $("a[href], area[href], link[href]").each((_, element) => {
    const node = $(element);
    const href = node.attr("href");
    if (href && /^mailto:/i.test(href.trim())) {
      const outcome = auditMailto(
        {
          href,
          shown: node.text(),
          titleAttr: node.attr("title") ?? "",
          pageUrl,
        },
        emails
      );
      if (outcome === "undefined-subject") undefinedSubjects++;
      else if (outcome) findings.push(outcome);
      return;
    }
    addLink(href);
  });

  $("img[src], iframe[src], script[src], source[src], embed[src]").each(
    (_, element) => addLink($(element).attr("src"))
  );
  $("img[data-src]").each((_, element) => addLink($(element).attr("data-src")));

  // Sitemap XML lists pages that nothing links to.
  $("loc").each((_, element) => addLink($(element).text()));

  const visible = visibleText($);
  for (const match of visible.matchAll(EMAIL_RE)) {
    const address = match[0].toLowerCase().replace(/[.,;]+$/, "");
    if (!/\.(png|jpe?g|gif|svg|css|js|webp)$/i.test(address)) {
      emails.add(address);
    }
  }

  return {
    title,
    softNotFound: looksMissing(visible),
    links: [...links.values()],
    newPages: [...newPages],
    emails: [...emails],
    findings,
    undefinedSubjects,
  };
}

/**
 * A mailto whose target differs from the address printed beside it is a real
 * defect: one of the two is wrong, and a reader who copies the visible text (or
 * clicks) reaches the wrong inbox. Reported regardless of which side is right.
 */
export interface MailtoLink {
  href: string;
  /** Link text as a reader sees it. */
  shown: string;
  /** title attribute, which this CMS also fills with the address. */
  titleAttr: string;
  pageUrl: string;
}

export function auditMailto(
  link: MailtoLink,
  emails: Set<string>
): Finding | "undefined-subject" | null {
  const { href, pageUrl } = link;
  const raw = href.trim().slice(7);
  const decoded = safeDecode(raw);
  const address = decoded.split("?")[0]!.trim().toLowerCase();
  if (address) emails.add(address);

  const shown = link.shown.replace(/\s+/g, " ").trim().toLowerCase();
  const titleAttr = link.titleAttr.trim().toLowerCase();
  const labels = [shown, titleAttr].filter((label) => label.includes("@"));

  if (labels.length > 0 && !labels.some((label) => label.includes(address))) {
    const printed = labels[0]!.match(EMAIL_RE)?.[0] ?? labels[0]!;
    return {
      id: `mailto-mismatch:${pageUrl}:${address}`,
      severity: "dead",
      category: "Email 連結與顯示不符",
      title: `畫面顯示 ${printed}，連結卻指向 ${address}`,
      detail:
        "兩者必有一個是錯的。點連結與照畫面手抄會寄到不同地址，" +
        "請確認正確帳號後同時修正顯示文字與連結。",
      url: `mailto:${address}`,
      label: printed,
      pages: [pageUrl],
    };
  }

  if (/subject=undefined|body=undefined/i.test(decoded)) {
    return "undefined-subject";
  }
  return null;
}

function visibleText($: cheerio.CheerioAPI): string {
  const clone = $.root().clone();
  clone.find("script, style, noscript").remove();
  return (clone.text() || "").replace(/\s+/g, " ");
}

function looksMissing(text: string): boolean {
  return target.softNotFoundPatterns.some((pattern) => pattern.test(text));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
