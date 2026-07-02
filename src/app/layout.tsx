import type { Metadata } from "next";
import { AuthGuard } from "@/components/app/auth-guard";
import { MotionOrchestrator } from "@/components/app/motion-orchestrator";
import { ThemeProvider } from "@/components/app/theme-provider";
import { TrpcProvider } from "@/components/app/trpc-provider";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "S2A Manager",
  description: "Sub2API 管理工具，源码见 github.com/langrenjh-alt/S2A-Manager，SUB2API 中转站推荐 z30.top",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      className="motion-ready"
      suppressHydrationWarning
    >
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:border focus:border-primary/40 focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring/55 focus:ring-offset-2 focus:ring-offset-background"
        >
          跳到主要内容
        </a>
        <ThemeProvider>
          <ToastProvider>
            <TrpcProvider>
              <MotionOrchestrator />
              <AuthGuard>{children}</AuthGuard>
            </TrpcProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
