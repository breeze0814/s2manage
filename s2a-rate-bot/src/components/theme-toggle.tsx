"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_KEY = "s2a-rate-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    setDark(next);
  };

  return (
    <button
      type="button"
      aria-label="切换明暗主题"
      aria-pressed={dark}
      onClick={toggle}
      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-muted text-foreground transition-colors hover:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  );
}
