import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  className?: string;
  disabled?: boolean;
}) {
  const base = "inline-flex appearance-none items-center justify-center rounded-2xl font-bold tracking-tight shadow-sm transition-colors duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed";
  const variants: Record<Variant, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 hover:text-white active:bg-brand-700 active:text-white",
    secondary: "border border-brand-200 bg-white text-brand-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:bg-brand-100 active:text-brand-800",
    ghost: "border border-transparent bg-transparent text-slate-700 shadow-none hover:border-slate-200 hover:bg-slate-100 hover:text-navy-900 active:bg-slate-200 active:text-navy-900",
    danger: "bg-rose-600 text-white hover:bg-rose-700 hover:text-white active:bg-rose-700 active:text-white",
  };
  const sizes: Record<Size, string> = { sm: "px-3 py-1.5 text-sm gap-1.5", md: "px-4 py-2.5 text-sm gap-2", lg: "px-6 py-3 text-base gap-2" };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}
