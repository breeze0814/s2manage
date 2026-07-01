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
