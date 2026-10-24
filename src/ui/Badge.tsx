import type { ReactNode } from "react";

const colors = {
  blue: "border-brand-200/80 bg-brand-50 text-brand-700",
  green: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
  red: "border-rose-200/80 bg-rose-50 text-rose-700",
  yellow: "border-amber-200/80 bg-amber-50 text-amber-800",
  gray: "border-slate-200 bg-slate-50 text-slate-600",
};

export function Badge({ children, color = "blue" }: { children: ReactNode; color?: keyof typeof colors }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${colors[color]}`}>{children}</span>;
}
