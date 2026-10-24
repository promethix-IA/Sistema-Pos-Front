import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-brand-600">Promethixia</p>
        <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
