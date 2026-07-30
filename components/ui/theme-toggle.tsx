"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const emptySubscribe = () => () => {};

export interface ThemeToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Optional global hotkey (single character, e.g. "d") that toggles the theme. */
  hotkey?: string;
}

export function ThemeToggle({ hotkey, className, ...props }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  // Hydration gate without setState-in-effect: server snapshot renders the
  // placeholder, the client snapshot reveals the theme-dependent label.
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const dark = resolvedTheme === "dark";
  const label = dark ? "light" : "dark";

  React.useEffect(() => {
    if (!hotkey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== hotkey) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      setTheme(dark ? "light" : "dark");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkey, dark, setTheme]);

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      title={hotkey ? `Toggle theme (${hotkey})` : "Toggle theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn(
        "cursor-pointer font-mono text-sm text-foreground/60 transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
      {...props}
    >
      <span className={mounted ? undefined : "invisible"}>
        {mounted ? label : "dark"}
      </span>
    </button>
  );
}
