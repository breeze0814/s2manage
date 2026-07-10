import type { ReactNode } from "react";

export function PagePlaceholder({ title, description, children }: Readonly<{
  title: string;
  description: string;
  children?: ReactNode;
}>) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}
