"use client";

import * as React from "react";

import type {
  ArchiveResult,
  ControlFingerprint,
  EmailResult,
  Finding,
  LiveScan,
  PageResult,
  ResourceResult,
  ScanSummary,
} from "@/lib/scan/types";

export type Phase =
  | "idle"
  | "seeding"
  | "pages"
  | "resources"
  | "archives"
  | "emails"
  | "saving"
  | "done"
  | "cooldown"
  /** Someone else is scanning; this tab follows along. */
  | "watching"
  | "error";

export interface LogLine {
  at: string;
  text: string;
  tone: "info" | "warn" | "bad" | "good";
}

export interface Progress {
  label: string;
  done: number;
  total: number;
}

/** Batch sizes are picked so one request stays well inside the function limit. */
const BATCH = { pages: 20, resources: 50, archives: 8, emails: 120 } as const;
const MAX_PAGES = 1200;
const ARCHIVE_NAME_RE = /\.(zip|odt|ods|odp|docx|xlsx|pptx)$/i;
/** Heartbeat floor while scanning, and poll interval while watching. */
const BEAT_MS = 2000;
const WATCH_MS = 3000;

interface ScanState {
  lastScan: ScanSummary | null;
  live: LiveScan | null;
  liveMine: boolean;
  cooldownRemaining: number;
  shared: boolean;
}

/**
 * The browser drives the scan.
 *
 * A full pass takes minutes and a serverless function is capped at seconds, so
 * the work is split into batches the client walks through. That also makes the
 * log real progress rather than a spinner, and needs no server-side scan state.
 */
export function useScan() {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [log, setLog] = React.useState<LogLine[]>([]);
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const [findings, setFindings] = React.useState<Finding[]>([]);
  const [summary, setSummary] = React.useState<ScanSummary | null>(null);
  const [cooldown, setCooldown] = React.useState(0);
  const [shared, setShared] = React.useState(false);
  const [live, setLive] = React.useState<LiveScan | null>(null);
  const [liveMine, setLiveMine] = React.useState(false);
  const abort = React.useRef<AbortController | null>(null);

  const say = React.useCallback(
    (text: string, tone: LogLine["tone"] = "info") => {
      const at = new Date().toLocaleTimeString("zh-TW", { hour12: false });
      setLog((lines) => [...lines, { at, text, tone }]);
    },
    []
  );

  /** Adopt the server's view: the cached result, plus any scan in flight. */
  const sync = React.useCallback(async (): Promise<ScanState | null> => {
    try {
      const response = await fetch("/api/scan/result", { cache: "no-store" });
      return (await response.json()) as ScanState;
    } catch {
      // A missing cache is not an error worth showing.
      return null;
    }
  }, []);

  // On load, show the last scan's result without touching the target site, and
  // fall in behind a scan that is already running.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await sync();
      if (!data || cancelled) return;
      setShared(data.shared);
      setCooldown(data.cooldownRemaining);
      setLive(data.live);
      setLiveMine(data.liveMine);
      if (data.lastScan) {
        setSummary(data.lastScan);
        setFindings(data.lastScan.findings);
      }
      setPhase(data.live ? "watching" : data.lastScan ? "done" : "idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [sync]);

  // While another tab drives the scan, poll until it lets go, then adopt the
  // result it saved.
  React.useEffect(() => {
    if (phase !== "watching") return;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        const data = await sync();
        if (!data || cancelled) return;
        setLive(data.live);
        setLiveMine(data.liveMine);
        setCooldown(data.cooldownRemaining);
        if (data.live) return;
        if (data.lastScan) {
          setSummary(data.lastScan);
          setFindings(data.lastScan.findings);
        }
        setPhase(data.lastScan ? "done" : "idle");
      })();
    }, WATCH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, sync]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(
      () => setCooldown((value) => (value > 0 ? value - 1 : 0)),
      1000
    );
    return () => clearInterval(timer);
  }, [cooldown]);

  /** Give up the live channel so the next visitor is not blocked by a TTL. */
  const retract = React.useCallback(() => {
    setLive(null);
    void fetch("/api/scan/live", { method: "DELETE" }).catch(() => {});
  }, []);

  const start = React.useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const post = async <T>(path: string, body: unknown): Promise<T> => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      // 429 (cooldown) and 409 (someone else is scanning) are answers, not
      // failures: their bodies say what to show.
      if (!response.ok && response.status !== 429 && response.status !== 409) {
        throw new Error(`${path} 回應 HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    };

    const startedAt = new Date();
    const startedAtIso = startedAt.toISOString();
    let lastBeat = 0;
    /** Publish progress for other visitors. Fire-and-forget, throttled. */
    const beat = (
      label: string,
      done: number,
      total: number,
      note: string,
      force = false
    ) => {
      const now = Date.now();
      if (!force && now - lastBeat < BEAT_MS) return;
      lastBeat = now;
      void fetch("/api/scan/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt: startedAtIso,
          label,
          done,
          total,
          note,
        }),
        signal: controller.signal,
      }).catch(() => {});
    };
    setLog([]);
    setFindings([]);
    setSummary(null);
    setProgress(null);
    setPhase("seeding");
    say(`開始掃描 acc.nycu.edu.tw`, "info");

    const collected = new Map<string, Finding>();
    const addFinding = (finding: Finding) => {
      const existing = collected.get(finding.id);
      if (existing) {
        const pages = new Set([...existing.pages, ...finding.pages]);
        collected.set(finding.id, { ...existing, pages: [...pages] });
      } else {
        collected.set(finding.id, finding);
      }
      setFindings([...collected.values()].sort(bySeverity));
    };

    try {
      const seed = await post<{
        control: ControlFingerprint;
        pages: string[];
        error?: string;
        remaining?: number;
        live?: LiveScan;
        lastScan?: ScanSummary | null;
      }>("/api/scan/seed", {});

      if (seed.error === "busy") {
        setLive(seed.live ?? null);
        setLiveMine(false);
        if (seed.lastScan) {
          setSummary(seed.lastScan);
          setFindings(seed.lastScan.findings);
        }
        setPhase("watching");
        say("已經有人在掃描，畫面會跟著更新。", "warn");
        return;
      }

      if (seed.error === "cooldown") {
        setCooldown(seed.remaining ?? 0);
        setPhase("cooldown");
        say(
          `冷卻中，請於 ${Math.ceil((seed.remaining ?? 0) / 60)} 分鐘後再掃描。` +
            `畫面顯示的是上次掃描結果。`,
          "warn"
        );
        return;
      }

      say(
        seed.control.missingAttachmentName
          ? `已取得站台指紋：缺檔時回傳「${seed.control.missingAttachmentName}」`
          : `已取得站台指紋（未取得缺檔樣本，改用關鍵字比對）`,
        "info"
      );
      say(`種子頁面 ${seed.pages.length} 個，開始爬取`, "info");

      // ---- pages: breadth-first until nothing new turns up ----
      setPhase("pages");
      beat(
        "爬取頁面",
        0,
        seed.pages.length,
        `種子頁面 ${seed.pages.length} 個`,
        true
      );
      const seen = new Set(seed.pages);
      const frontier = [...seed.pages];
      const resourceRefs = new Map<string, Set<string>>();
      const emailRefs = new Map<string, Set<string>>();
      let pagesDone = 0;
      let undefinedSubjects = 0;

      const remember = (
        map: Map<string, Set<string>>,
        key: string,
        page: string
      ) => {
        const set = map.get(key) ?? new Set<string>();
        set.add(page);
        map.set(key, set);
      };

      while (frontier.length > 0 && seen.size < MAX_PAGES) {
        const batch = frontier.splice(0, BATCH.pages);
        const { results, undefinedSubjects: undef } = await post<{
          results: PageResult[];
          undefinedSubjects: number;
        }>("/api/scan/pages", { urls: batch });
        undefinedSubjects += undef;

        for (const page of results) {
          pagesDone++;
          if (page.status !== 200) {
            addFinding({
              id: `page:${page.url}`,
              severity: "dead",
              category: "頁面",
              title: `頁面無法開啟：HTTP ${page.status === -1 ? "連線失敗" : page.status}`,
              detail: page.error ?? `伺服器回應 ${page.status}`,
              url: page.url,
              pages: [page.url],
            });
            continue;
          }
          for (const finding of page.findings) addFinding(finding);
          for (const link of page.links) {
            if (link.kind === "page") continue;
            remember(resourceRefs, link.url, page.url);
          }
          for (const address of page.emails) {
            remember(emailRefs, address, page.url);
          }
          for (const next of page.newPages) {
            if (seen.has(next) || seen.size >= MAX_PAGES) continue;
            seen.add(next);
            frontier.push(next);
          }
        }
        setProgress({
          label: "爬取頁面",
          done: pagesDone,
          total: seen.size,
        });
        beat(
          "爬取頁面",
          pagesDone,
          seen.size,
          `頁面 ${pagesDone}/${seen.size}，已找到 ${resourceRefs.size} 個資源`
        );
        say(
          `頁面 ${pagesDone}/${seen.size}，已找到 ${resourceRefs.size} 個資源`,
          "info"
        );
      }
      say(`頁面爬取完成，共 ${pagesDone} 頁`, "good");

      // ---- resources: existence + attachment sanity ----
      setPhase("resources");
      const archiveUrls: string[] = [];
      const resourceUrls: string[] = [];
      for (const url of resourceRefs.keys()) {
        if (/\.(zip|odt|ods|odp|docx|xlsx|pptx)(\?|$)/i.test(url)) {
          archiveUrls.push(url);
        } else {
          resourceUrls.push(url);
        }
      }
      say(`開始檢查 ${resourceUrls.length} 個資源`, "info");
      let resourcesDone = 0;
      for (
        let index = 0;
        index < resourceUrls.length;
        index += BATCH.resources
      ) {
        const batch = resourceUrls.slice(index, index + BATCH.resources);
        const { results } = await post<{ results: ResourceResult[] }>(
          "/api/scan/resources",
          { urls: batch, control: seed.control }
        );
        for (const result of results) {
          resourcesDone++;
          // A CMS doc endpoint carries no extension in its URL: only
          // Content-Disposition reveals an archive. So this check has to run
          // before the ok-shortcut, otherwise a structurally valid but empty
          // zip is never opened.
          const looksArchive =
            result.filename !== undefined &&
            ARCHIVE_NAME_RE.test(result.filename);
          if (looksArchive && result.verdict !== "dead") {
            archiveUrls.push(result.url);
            continue;
          }
          if (result.verdict === "ok") continue;
          addFinding(
            toFinding(result, [...(resourceRefs.get(result.url) ?? [])])
          );
        }
        setProgress({
          label: "檢查資源",
          done: resourcesDone,
          total: resourceUrls.length,
        });
        beat(
          "檢查資源",
          resourcesDone,
          resourceUrls.length,
          `資源 ${resourcesDone}/${resourceUrls.length}`
        );
        if (resourcesDone % 200 < BATCH.resources) {
          say(`資源 ${resourcesDone}/${resourceUrls.length}`, "info");
        }
      }
      say(`資源檢查完成，共 ${resourcesDone} 個`, "good");

      // ---- archives: open them, a valid zip can still be empty ----
      setPhase("archives");
      const uniqueArchives = [...new Set(archiveUrls)];
      say(`開始解壓 ${uniqueArchives.length} 個壓縮檔`, "info");
      let archivesDone = 0;
      for (
        let index = 0;
        index < uniqueArchives.length;
        index += BATCH.archives
      ) {
        const batch = uniqueArchives.slice(index, index + BATCH.archives);
        const { results } = await post<{ results: ArchiveResult[] }>(
          "/api/scan/archives",
          { urls: batch }
        );
        for (const result of results) {
          archivesDone++;
          if (result.verdict === "ok") continue;
          addFinding({
            id: `archive:${result.url}`,
            severity: result.verdict === "dead" ? "dead" : "suspect",
            category: "附件",
            title: `${result.filename || "壓縮檔"}：${result.note}`,
            detail: `檔案 ${result.bytes.toLocaleString("en-US")} byte，項目 ${result.entries} 個、實際檔案 ${result.files} 個。`,
            url: result.url,
            label: result.filename,
            pages: [...(resourceRefs.get(result.url) ?? [])],
          });
        }
        setProgress({
          label: "解壓壓縮檔",
          done: archivesDone,
          total: uniqueArchives.length,
        });
        beat(
          "解壓壓縮檔",
          archivesDone,
          uniqueArchives.length,
          `壓縮檔 ${archivesDone}/${uniqueArchives.length}`
        );
      }
      say(`壓縮檔檢查完成，共 ${archivesDone} 個`, "good");

      // ---- emails ----
      setPhase("emails");
      const addresses = [...emailRefs.keys()];
      say(`開始檢查 ${addresses.length} 個 email 網域`, "info");
      for (let index = 0; index < addresses.length; index += BATCH.emails) {
        const batch = addresses.slice(index, index + BATCH.emails);
        const { results } = await post<{ results: EmailResult[] }>(
          "/api/scan/emails",
          { addresses: batch }
        );
        for (const result of results) {
          if (result.verdict === "ok") continue;
          addFinding({
            id: `email:${result.address}`,
            severity: result.verdict === "dead" ? "dead" : "suspect",
            category: "Email",
            title: `${result.address}：${result.note}`,
            detail: result.note,
            url: `mailto:${result.address}`,
            label: result.address,
            pages: [...(emailRefs.get(result.address) ?? [])],
          });
        }
        const emailsDone = Math.min(index + BATCH.emails, addresses.length);
        setProgress({
          label: "檢查 email",
          done: emailsDone,
          total: addresses.length,
        });
        beat(
          "檢查 email",
          emailsDone,
          addresses.length,
          `email ${emailsDone}/${addresses.length}`
        );
      }

      if (undefinedSubjects > 0) {
        addFinding({
          id: "mailto:undefined-subject",
          severity: "suspect",
          category: "Email 連結品質",
          title: `${undefinedSubjects} 個 email 連結會帶入 undefined 主旨`,
          detail:
            "連結長成 mailto:...?subject=undefined&body=undefined，" +
            "點下去郵件主旨與內文會自動填入 undefined。" +
            "請 CMS 廠商在欄位為空時不要輸出該參數。",
          url: `${"https://acc.nycu.edu.tw"}/`,
          pages: [],
        });
      }

      // ---- wrap up ----
      setPhase("saving");
      const finishedAt = new Date();
      const all = [...collected.values()].sort(bySeverity);
      const result: ScanSummary = {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        pages: pagesDone,
        resources: resourcesDone,
        archives: archivesDone,
        emails: addresses.length,
        dead: all.filter((f) => f.severity === "dead").length,
        suspect: all.filter((f) => f.severity === "suspect").length,
        findings: all,
      };
      // Saving also retracts the live broadcast, server-side.
      await post("/api/scan/result", result);
      setLive(null);
      setSummary(result);
      setFindings(all);
      setPhase("done");
      setCooldown(600);
      say(
        `掃描完成：確定的問題 ${result.dead} 項，可能有問題 ${result.suspect} 項，` +
          `耗時 ${Math.round(result.durationMs / 1000)} 秒`,
        result.dead > 0 ? "bad" : "good"
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      retract();
      setPhase("error");
      say(
        `掃描中斷：${error instanceof Error ? error.message : String(error)}`,
        "bad"
      );
    }
  }, [retract, say]);

  const stop = React.useCallback(() => {
    abort.current?.abort();
    retract();
    setPhase("idle");
    say("已取消掃描", "warn");
  }, [retract, say]);

  const running =
    phase === "seeding" ||
    phase === "pages" ||
    phase === "resources" ||
    phase === "archives" ||
    phase === "emails" ||
    phase === "saving";

  return {
    phase,
    running,
    watching: phase === "watching",
    log,
    progress,
    findings,
    summary,
    cooldown,
    shared,
    live,
    liveMine,
    start,
    stop,
  };
}

function bySeverity(left: Finding, right: Finding): number {
  if (left.severity !== right.severity) {
    return left.severity === "dead" ? -1 : 1;
  }
  return left.title.localeCompare(right.title, "zh-Hant");
}

function toFinding(result: ResourceResult, pages: string[]): Finding {
  const category =
    result.kind === "external"
      ? "外部連結"
      : result.kind === "attachment" || result.kind === "archive"
        ? "附件"
        : result.kind === "page"
          ? "頁面"
          : result.kind === "opendata"
            ? "開放資料"
            : "資源";
  const name = result.filename || tail(result.url);
  return {
    id: `resource:${result.url}`,
    severity: result.verdict === "dead" ? "dead" : "suspect",
    category,
    title: `${name}：${result.note}`,
    detail: result.note,
    url: result.url,
    label: result.filename,
    pages,
  };
}

function tail(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "acc.nycu.edu.tw"
      ? parsed.pathname.split("/").filter(Boolean).slice(-2).join("/")
      : parsed.hostname + parsed.pathname;
  } catch {
    return url;
  }
}
