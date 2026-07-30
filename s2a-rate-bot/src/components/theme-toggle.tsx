"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

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
    <Button
      type="button"
      aria-label="切换明暗主题"
      aria-pressed={dark}
      title={dark ? "切换到浅色主题" : "切换到暗色主题"}
      onClick={toggle}
      variant="secondary"
      size="icon"
    >
      {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </Button>
  );
}
