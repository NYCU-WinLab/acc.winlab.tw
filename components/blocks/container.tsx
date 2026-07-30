import * as React from "react";

import { cn } from "@/lib/utils";

type Size = "sm" | "default" | "lg" | "xl";

const sizes: Record<Size, string> = {
  sm: "max-w-3xl",
  default: "max-w-5xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
};

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: Size;
}

export function Container({
  className,
  size = "default",
  ...props
}: ContainerProps) {
  return (
    <div
      data-slot="container"
      className={cn("mx-auto w-full px-4 sm:px-6", sizes[size], className)}
      {...props}
    />
  );
}
