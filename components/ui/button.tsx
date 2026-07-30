import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "raw";
type Size = "default" | "sm" | "lg";

const variants: Record<Variant, string> = {
  default: "bg-foreground text-background hover:bg-foreground/90",
  outline: "border border-foreground/20 hover:bg-foreground/5",
  ghost: "hover:bg-foreground/5",
  raw: "h-auto bg-transparent px-0 py-0 text-foreground/60 hover:bg-transparent hover:text-foreground",
};

const sizes: Record<Size, string> = {
  default: "h-9 px-4",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-6",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        sizes[size],
        variants[variant],
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
      ) : null}
      <span className={loading ? "opacity-70" : undefined}>{children}</span>
    </button>
  );
}
