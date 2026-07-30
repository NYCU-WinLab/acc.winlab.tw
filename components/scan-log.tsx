"use client";

import * as React from "react";

import type { LogLine } from "@/hooks/use-scan";
import { cn } from "@/lib/utils";

const tones: Record<LogLine["tone"], string> = {
  info: "text-foreground/60",
  good: "text-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
};

export interface ScanLogProps {
  lines: readonly LogLine[];
  /** Shown while running so the panel does not look stalled. */
  busy?: boolean;
}

export function ScanLog({ lines, busy = false }: ScanLogProps) {
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  if (lines.length === 0) return null;

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="掃描紀錄"
      className="max-h-72 overflow-y-auto rounded-lg bg-block p-4 font-mono text-xs leading-relaxed corner-token"
    >
      {lines.map((line, index) => (
        <div key={`${line.at}-${index}`} className="flex gap-3">
          <span className="shrink-0 text-foreground/35">{line.at}</span>
          <span className={cn("min-w-0 break-words", tones[line.tone])}>
            {line.text}
          </span>
        </div>
      ))}
      {busy ? (
        <div className="flex gap-3 text-foreground/35">
          <span className="shrink-0">…</span>
          <span className="motion-safe:animate-pulse">執行中</span>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
