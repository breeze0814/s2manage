"use client";

import { useEffect, useState } from "react";
import { Toaster as Sonner } from "sonner";

type Theme = "light" | "dark";

export function Toaster() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    const observer = new MutationObserver(update);
    update();
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return <Sonner theme={theme} position="top-center" richColors closeButton visibleToasts={4} />;
}
