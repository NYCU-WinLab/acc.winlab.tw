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
    log,
    progress,
    findings,
    summary,
    cooldown,
    shared,
    start,
    stop,
  } = useScan();

  const dead = findings.filter((finding) => finding.severity === "dead");
  const suspect = findings.filter((finding) => finding.severity === "suspect");
  const blocked = cooldown > 0 && !running;

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            loading={running}
            disabled={blocked}
            onClick={() => void start()}
          >
            {running ? "掃描中" : "開始掃描"}
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
        </div>
        {blocked ? (
          <p className="text-sm text-foreground/50">
            剛剛掃過了。為了不對主計室伺服器造成負擔，請於{" "}
            {formatCooldown(cooldown)} 後再試，以下是上次的結果。
          </p>
        ) : null}
        {!running && !blocked && findings.length === 0 && phase !== "done" ? (
          <p className="text-sm text-foreground/50">
            一次完整掃描約 2 到 4 分鐘，過程會逐步顯示在下方。
          </p>
        ) : null}
      </Stack>

      <ScanLog lines={log} busy={running} />

      {summary ? <Summary summary={summary} shared={shared} /> : null}

      {phase === "done" || findings.length > 0 ? (
        <Stack gap="default">
          <FindingBlock
            title="確定的問題"
            description="已驗證為失效或自相矛盾，可以直接交辦修正。"
            findings={dead}
            severity="dead"
            emptyText="沒有發現失效的資源。"
          />
          <FindingBlock
            title="可能有問題"
            description="需要人工確認，多半是對方網站阻擋自動檢測，或無法從外部斷定。"
            findings={suspect}
            severity="suspect"
            emptyText="沒有需要人工確認的項目。"
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
        {shared ? "" : "（未設定共用儲存，結果只留在這次瀏覽）"}
      </p>
    </div>
  );
}

function formatCooldown(seconds: number): string {
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} 分鐘`;
  return `${seconds} 秒`;
}
