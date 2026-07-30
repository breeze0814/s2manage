import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "S2A 嵌入服务",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function EmbedLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="min-h-dvh">{children}</div>;
}
