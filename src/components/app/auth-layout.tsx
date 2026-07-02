"use client";

import type { ReactNode } from "react";
import { BrandMark } from "@/components/app/brand-mark";
import { ProjectPromoLinks } from "@/components/app/project-promo-links";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuthLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

const productBenefits = [
  "统一管理 Sub2API 连接、分组、账号和倍率同步任务。",
  "集中查看任务日志、上游检测和余额预警，异常处理更直接。",
  "适配移动端和桌面端，常用操作保持清晰的触控区域。",
];

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <div id="main-content" tabIndex={-1} className="auth-screen flex min-h-dvh items-center justify-center px-4 py-6 outline-none sm:px-6" data-motion="section">
      <div className="w-full max-w-5xl" data-motion="panel">
        <div className="mb-4 flex justify-end" data-motion="control">
          <ThemeToggle />
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-center">
          <section className="space-y-6 rounded-lg border border-white/35 bg-white/[0.24] p-5 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.22)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] sm:p-6">
            <div className="space-y-4">
              <BrandMark className="size-14 text-slate-900 dark:text-white" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-primary">S2A Manager</p>
                <h1 className="max-w-xl text-2xl font-semibold text-foreground sm:text-3xl">更清晰地维护中转服务和同步流程</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  面向日常运维的管理台入口，把连接、倍率、账号状态和告警信息整理到可扫描的工作界面。
                </p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              {productBenefits.map((benefit) => (
                <div key={benefit} className="flex gap-3 rounded-md border border-border/60 bg-background/70 px-3 py-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span className="leading-6">{benefit}</span>
                </div>
              ))}
            </div>
            <ProjectPromoLinks className="mt-6" />
          </section>

          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-2xl">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
