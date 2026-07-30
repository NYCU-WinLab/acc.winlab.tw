"use client";

import * as React from "react";

import { FindingBlock } from "@/components/finding-block";
import { ScanLog } from "@/components/scan-log";
import { Stack } from "@/components/blocks/stack";
import { Button } from "@/components/ui/button";
import { useScan } from "@/hooks/use-scan";

export function ScanPanel() {
  const {
    phase,
    running,
    watching,
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
  } = useScan();

  const dead = findings.filter((finding) => finding.severity === "dead");
  const suspect = findings.filter((finding) => finding.severity === "suspect");
  const cooling = cooldown > 0 && !running && !watching;

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            loading={running || watching}
            disabled={cooling || watching}
            onClick={() => void start()}
          >
            {running ? "掃描中" : watching ? "有人在掃描" : "開始掃描"}
          </Button>
          {running ? (
            <Button variant="ghost" onClick={stop}>
              取消
            </Button>
          ) : null}
          {progress && running ? (
            <span className="font-mono text-xs text-foreground/50">
              {progress.label} {progress.done}/{progress.total}
            </span>
          ) : null}
          {watching && live ? (
            <span className="font-mono text-xs text-foreground/50">
              {live.label}
              {live.total > 0 ? ` ${live.done}/${live.total}` : ""}
            </span>
          ) : null}
        </div>
        {watching && live ? (
          <p className="text-sm text-foreground/50">
            {liveMine ? "你的掃描" : "其他人"}正在掃描，{live.note || "進行中"}
            。完成後這裡會自動顯示結果。
          </p>
        ) : null}
        {cooling ? (
          <p className="text-sm text-foreground/50">
            剛掃過，{formatCooldown(cooldown)} 後可再掃。以下是上次結果。
          </p>
        ) : null}
        {!running && !watching && !cooling && phase !== "done" ? (
          <p className="text-sm text-foreground/50">約 2 到 4 分鐘。</p>
        ) : null}
      </Stack>

      <ScanLog lines={log} busy={running} />

      {summary ? <Summary summary={summary} shared={shared} /> : null}

      {phase === "done" || findings.length > 0 ? (
        <Stack gap="default">
          <FindingBlock
            title="確定的問題"
            description="已驗證失效，可直接交辦。"
            findings={dead}
            severity="dead"
            emptyText="沒有失效的資源。"
          />
          <FindingBlock
            title="可能有問題"
            description="多半是對方擋自動檢測，需人工確認。"
            findings={suspect}
            severity="suspect"
            emptyText="沒有待確認項目。"
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

function Summary({
  summary,
  shared,
}: {
  summary: NonNullable<ReturnType<typeof useScan>["summary"]>;
  shared: boolean;
}) {
  const finished = new Date(summary.finishedAt);
  const rows: Array<[string, string]> = [
    ["頁面", summary.pages.toLocaleString("en-US")],
    ["資源", summary.resources.toLocaleString("en-US")],
    ["壓縮檔", summary.archives.toLocaleString("en-US")],
    ["Email", summary.emails.toLocaleString("en-US")],
    ["耗時", `${Math.round(summary.durationMs / 1000)} 秒`],
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-foreground/50">
        {rows.map(([label, value]) => (
          <span key={label}>
            {label} {value}
          </span>
        ))}
      </div>
      <p className="text-xs text-foreground/35">
        掃描時間 {finished.toLocaleString("zh-TW", { hour12: false })}
        {shared ? "" : "（未接共用儲存，結果不會保留）"}
      </p>
    </div>
  );
}

function formatCooldown(seconds: number): string {
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} 分鐘`;
  return `${seconds} 秒`;
}
