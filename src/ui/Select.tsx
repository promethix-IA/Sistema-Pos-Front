import type { ReactNode, SelectHTMLAttributes } from "react";

export function Select({ label, children, className = "", ...props }: { label?: string; children?: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-sm font-semibold text-navy-900">{label}</label>}
      <select {...props} className="rounded-2xl border border-slate-200 bg-[var(--surface)] px-3.5 py-2.5 text-sm text-navy-900 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15">
        {children}
      </select>
    </div>
  );
}
