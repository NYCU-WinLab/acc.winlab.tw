export type Verdict = "ok" | "dead" | "suspect" | "blocked";

export type ResourceKind =
  | "page"
  | "attachment"
  | "archive"
  | "opendata"
  | "image"
  | "static"
  | "external"
  | "share"
  | "skip";

/** One problem worth showing a human, with enough context to go fix it. */
export interface Finding {
  /** Stable key so repeated scans don't duplicate rows. */
  id: string;
  severity: "dead" | "suspect";
  /** Short Chinese label, e.g. "附件遺失". */
  category: string;
  /** One-line statement of what is wrong. */
  title: string;
  /** The evidence: status code, byte count, both sides of a mismatch. */
  detail: string;
  /** The resource that failed. */
  url: string;
  /** Human-readable name when the URL is opaque (CMS doc endpoints). */
  label?: string;
  /** Pages that link to it. */
  pages: string[];
}

export interface PageLink {
  url: string;
  kind: ResourceKind;
}

export interface PageResult {
  url: string;
  status: number;
  /** Server said 200 but the body is an error page. */
  softNotFound: boolean;
  title: string;
  error?: string;
  links: PageLink[];
  /** Newly discovered internal pages worth crawling. */
  newPages: string[];
  emails: string[];
  findings: Finding[];
}

export interface ResourceResult {
  url: string;
  kind: ResourceKind;
  verdict: Verdict;
  status: number;
  note: string;
  filename?: string;
  bytes?: number;
  contentType?: string;
}

export interface ArchiveResult {
  url: string;
  verdict: Verdict;
  note: string;
  filename: string;
  bytes: number;
  entries: number;
  files: number;
  uncompressed: number;
}

export interface EmailResult {
  address: string;
  verdict: Verdict;
  note: string;
  mx: string[];
}

/**
 * The target's own "this does not exist" response, sampled at scan start.
 * Comparing against a live sample beats maintaining a keyword list.
 */
export interface ControlFingerprint {
  /** Filename the CMS returns for a missing attachment, e.g. "檔案不存在.txt". */
  missingAttachmentName: string | null;
  /** Status a bogus page URL answers with. */
  bogusPageStatus: number;
}

/**
 * A scan currently in flight, published so other visitors see it instead of an
 * idle button. The browser driving the scan refreshes this; the key's TTL is the
 * liveness check, so a closed tab clears itself without any cleanup call.
 */
export interface LiveScan {
  startedAt: string;
  /** Current phase in Chinese, e.g. "爬取頁面". */
  label: string;
  done: number;
  total: number;
  /** The latest log line, so onlookers see movement. */
  note: string;
  /** Salted visitor hash of whoever is driving it. */
  by: string;
}

export interface ScanSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pages: number;
  resources: number;
  archives: number;
  emails: number;
  dead: number;
  suspect: number;
  findings: Finding[];
}
