import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthDialog } from "../components/auth-dialog";
import { AppShell } from "../components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "S2A Rate Bot",
  description: "Sub2API 倍率采集与调度管理端",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthDialog />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
