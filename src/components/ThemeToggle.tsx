import { useEffect, useState } from "react";
import { applyTheme, readTheme, subscribeTheme, type Theme } from "../lib/theme";

function SunIcon() {
  return (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.657-6.343 1.414-1.414M4.929 19.071l1.414-1.414m0-11.314L4.929 4.929m14.142 14.142-1.414-1.414M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z" />
    </svg>
  );
}

export function ThemeToggle({ compact = false, tone = "light" }: { compact?: boolean; tone?: "light" | "navy" }) {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => subscribeTheme(setTheme), []);

  const set = (next: Theme) => {
    applyTheme(next);
    setTheme(next);
  };

  if (compact) {
    const next = theme === "dark" ? "light" : "dark";
    return (
      <button
        type="button"
        onClick={() => set(next)}
        className={`grid size-10 place-items-center rounded-2xl border text-sm font-bold transition-colors ${
          tone === "navy"
            ? "border-white/20 bg-brand-800 text-white hover:bg-brand-600"
            : "border-slate-200 bg-white text-navy-900 hover:bg-slate-100"
        }`}
        aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    );
  }

  const on = (value: Theme) =>
    theme === value
      ? "bg-brand-600 text-white"
      : tone === "navy"
        ? "text-blue-100 hover:bg-brand-700 hover:text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-navy-900";

  return (
    <div
      role="group"
      aria-label="Apariencia"
      className={`inline-flex rounded-2xl border p-1 ${
        tone === "navy" ? "border-white/15 bg-black/20" : "border-slate-200 bg-slate-100"
      }`}
    >
      <button type="button" aria-pressed={theme === "light"} onClick={() => set("light")} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${on("light")}`}>
        <SunIcon /> Claro
      </button>
      <button type="button" aria-pressed={theme === "dark"} onClick={() => set("dark")} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${on("dark")}`}>
        <MoonIcon /> Oscuro
      </button>
    </div>
  );
}
