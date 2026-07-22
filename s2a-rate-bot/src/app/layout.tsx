import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import { AuthDialog } from "../components/auth-dialog";
import { AppShell } from "../components/app-shell";
import { Toaster } from "../components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "S2A Rate Bot",
  description: "Sub2API 倍率采集与调度管理端",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

const THEME_SCRIPT = `
(() => {
  const stored = localStorage.getItem("s2a-rate-theme");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = stored === "dark" || (stored !== "light" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>
        <AuthDialog />
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
