import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-slate-200 bg-[var(--surface)] shadow-card ${className}`}>
      {children}
    </div>
  );
}
