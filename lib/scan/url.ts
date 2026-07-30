import { target } from "./target";
import type { ResourceKind } from "./types";

/**
 * Canonical form of a URL: lowercase host, no fragment, sorted query.
 *
 * Sorting the query matters more than it looks. The CMS emits the same page as
 * both `?module=x&id=1` and `?id=1&module=x`; without sorting, every such pair
 * is counted twice and shows up as a phantom "extra" resource.
 */
export function normalize(input: string, base?: string): string | null {
  let parsed: URL;
  try {
    parsed = base ? new URL(input, base) : new URL(input);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  const entries = [...parsed.searchParams.entries()].sort(([a], [b]) =>
    a === b ? 0 : a < b ? -1 : 1
  );
  parsed.search = "";
  for (const [key, value] of entries) parsed.searchParams.append(key, value);
  // Treat "/path" and "/path/" as one page, but never strip the root slash.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  return parsed.toString();
}

function extensionOf(pathname: string): string {
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  return dot === -1 ? "" : last.slice(dot + 1).toLowerCase();
}

export function isInternal(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === target.hostname;
  } catch {
    return false;
  }
}

export function classify(url: string): ResourceKind {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "skip";
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== target.hostname) {
    const bare = host.replace(/^www\./, "");
    if (
      (target.shareHosts as readonly string[]).includes(host) ||
      (target.shareHosts as readonly string[]).includes(bare)
    ) {
      return "share";
    }
    return "external";
  }

  const path = parsed.pathname.toLowerCase();
  const ext = extensionOf(path);

  if (path.startsWith("/static/")) return "static";
  if (path.includes("/opendata/")) return "opendata";

  // CMS attachment endpoint: /acc/<lang>/app/<module>/doc?module=…&detailNo=…
  const isDocEndpoint =
    path.includes("/doc") && parsed.searchParams.has("module");
  const isUserFile = path.startsWith("/userfiles/");

  if (
    isDocEndpoint ||
    isUserFile ||
    (target.documentExtensions as readonly string[]).includes(ext)
  ) {
    // Archive-shaped files get their contents opened, not just their headers.
    if ((target.archiveExtensions as readonly string[]).includes(ext)) {
      return "archive";
    }
    if (
      isUserFile &&
      (target.imageExtensions as readonly string[]).includes(ext)
    ) {
      return "image";
    }
    return "attachment";
  }
  if ((target.imageExtensions as readonly string[]).includes(ext))
    return "image";
  return "page";
}

/** List endpoints hide older rows behind pagination; ask for them explicitly. */
export function isListEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.toLowerCase() === target.hostname &&
      parsed.pathname.endsWith("/list") &&
      parsed.searchParams.has("module")
    );
  } catch {
    return false;
  }
}

export function withPage(url: string, page: number): string | null {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("page", String(page));
    parsed.searchParams.set("pageSize", String(target.listPageSize));
    return normalize(parsed.toString());
  } catch {
    return null;
  }
}

/** Trim a long CMS URL down to something readable in a report row. */
export function shortLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const id =
      parsed.searchParams.get("detailNo") ??
      parsed.searchParams.get("serno") ??
      parsed.searchParams.get("id") ??
      "";
    const tail = parsed.pathname.split("/").filter(Boolean).slice(-2).join("/");
    return id ? `${tail} · ${id.slice(0, 12)}` : tail;
  } catch {
    return url;
  }
}
