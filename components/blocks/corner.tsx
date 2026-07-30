import * as React from "react";

import { cn } from "@/lib/utils";

type At = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const positions: Record<At, string> = {
  "top-left": "top-0 left-0",
  "top-right": "top-0 right-0",
  "bottom-left": "bottom-0 left-0",
  "bottom-right": "bottom-0 right-0",
};

export interface CornerProps extends React.HTMLAttributes<HTMLDivElement> {
  at: At;
}

export function Corner({ at, className, ...props }: CornerProps) {
  return (
    <div
      data-slot="corner"
      className={cn("fixed z-50 p-6", positions[at], className)}
      {...props}
    />
  );
}
