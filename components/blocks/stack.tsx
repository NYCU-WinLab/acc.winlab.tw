import * as React from "react";

import { cn } from "@/lib/utils";

type Gap = "sm" | "default" | "lg";
type Direction = "column" | "row";

const gaps: Record<Gap, string> = {
  sm: "gap-2",
  default: "gap-4",
  lg: "gap-8",
};

const directions: Record<Direction, string> = {
  column: "flex-col",
  row: "flex-row items-center",
};

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  gap?: Gap;
  direction?: Direction;
}

export function Stack({
  className,
  gap = "default",
  direction = "column",
  ...props
}: StackProps) {
  return (
    <div
      data-slot="stack"
      className={cn("flex", directions[direction], gaps[gap], className)}
      {...props}
    />
  );
}
