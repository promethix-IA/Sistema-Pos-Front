import type { InputHTMLAttributes } from "react";

export function Input({ label, ...props }: { label?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-semibold text-navy-900">{label}</label>}
      <input {...props} className={`rounded-2xl border border-slate-200 bg-[var(--surface)] px-3.5 py-2.5 text-sm text-navy-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15 ${props.className ?? ""}`} />
    </div>
  );
}
