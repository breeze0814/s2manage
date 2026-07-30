"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "./app-shell";
import { AuthDialog } from "./auth-dialog";
import { Toaster } from "./ui/sonner";

export function ApplicationFrame({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  if (pathname.startsWith("/embed/")) {
    return <main id="main-content" className="min-h-dvh bg-background text-foreground">{children}</main>;
  }
  return (
    <>
      <AuthDialog />
      <AppShell>{children}</AppShell>
      <Toaster />
    </>
  );
}
