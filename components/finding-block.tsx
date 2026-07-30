import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Finding } from "@/lib/scan/types";

const PAGES_SHOWN = 3;

export interface FindingBlockProps {
  title: string;
  description: string;
  findings: readonly Finding[];
  severity: "dead" | "suspect";
  /** Message for the empty state, e.g. "沒有發現失效資源". */
  emptyText: string;
}

export function FindingBlock({
  title,
  description,
  findings,
  severity,
  emptyText,
}: FindingBlockProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{title}</CardTitle>
          <Badge variant={severity === "dead" ? "destructive" : "outline"}>
            {findings.length}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {findings.length === 0 ? (
          <p className="text-sm text-foreground/50">{emptyText}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {findings.map((finding, index) => (
              <li key={finding.id} className="flex flex-col gap-2">
                {index > 0 ? <Separator className="mb-2" /> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {finding.category}
                  </Badge>
                  <span className="text-sm font-medium">{finding.title}</span>
                </div>
                <p className="text-sm text-foreground/60">{finding.detail}</p>
                <Locations finding={finding} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Locations({ finding }: { finding: Finding }) {
  const pages = finding.pages;
  return (
    <div className="flex flex-col gap-1 font-mono text-xs text-foreground/45">
      {finding.url.startsWith("mailto:") ? null : (
        <a
          href={finding.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 break-all hover:text-foreground"
        >
          <ExternalLink aria-hidden className="size-3 shrink-0" />
          {finding.url}
        </a>
      )}
      {pages.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-foreground/35">出現在</span>
          {pages.slice(0, PAGES_SHOWN).map((page) => (
            <a
              key={page}
              href={page}
              target="_blank"
              rel="noreferrer noopener"
              className="pl-3 break-all hover:text-foreground"
            >
              {page}
            </a>
          ))}
          {pages.length > PAGES_SHOWN ? (
            <span className="pl-3 text-foreground/35">
              另外還有 {pages.length - PAGES_SHOWN} 個頁面
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
