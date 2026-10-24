import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

type ShiftSummary = {
  id: number;
  openedAt: string | null;
  closedAt: string | null;
  openingCash: number;
  countedCash: number | null;
  status: "open" | "closed";
  openedBy: string;
  closedBy: string;
  notes: string;
  salesCount: number;
  salesTotal: number;
  byMethod: { efectivo: number; tarjeta: number; transferencia: number; credito: number };
  creditCollections: { efectivo: number; tarjeta: number; transferencia: number };
  byCategory: { category: string; total: number }[];
  contado: number;
  expectedCash: number;
  difference: number | null;
};

type ShiftRow = {
  id: number;
  openedAt: string | null;
  closedAt: string | null;
  openingCash: number;
  status: "open" | "closed";
  openedBy: string;
};

export function CierreCaja() {
  const [current, setCurrent] = useState<ShiftSummary | null>(null);
  const [history, setHistory] = useState<ShiftRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [openShift, shifts] = await Promise.all([
        api<ShiftSummary | null>("/shifts/current"),
        api<ShiftRow[]>("/shifts"),
      ]);
      setCurrent(openShift);
      setHistory(shifts);
      if (openShift) {
        const detail = await api<ShiftSummary>(`/shifts/${openShift.id}/summary`);
        setSummary(detail);
        setSelectedId(openShift.id);
      } else if (shifts[0]) {
        const detail = await api<ShiftSummary>(`/shifts/${shifts[0].id}/summary`);
        setSummary(detail);
        setSelectedId(shifts[0].id);
      } else {
        setSummary(null);
        setSelectedId(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar el cierre de caja.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openShift = async () => {
    setError("");
    try {
      await api("/shifts", {
        method: "POST",
        body: JSON.stringify({ openingCash: Number(openingCash) || 0, notes }),
      });
      setOpeningCash("");
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos abrir el turno.");
    }
  };

  const closeShift = async () => {
    if (!current) return;
    if (!window.confirm("¿Cerrar el turno actual?")) return;
    setError("");
    try {
      const closed = await api<ShiftSummary>(`/shifts/${current.id}/close`, {
        method: "POST",
        body: JSON.stringify({
          countedCash: countedCash === "" ? null : Number(countedCash),
          notes,
        }),
      });
      setCountedCash("");
      setNotes("");
      setSummary(closed);
      setSelectedId(closed.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cerrar el turno.");
    }
  };

  const viewShift = async (id: number) => {
    setError("");
    try {
      setSummary(await api<ShiftSummary>(`/shifts/${id}/summary`));
      setSelectedId(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar el resumen.");
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Cargando cierre de caja…</div>;
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div>
        <p className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-brand-600">Promethixia</p>
        <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">Cierre de caja</h1>
        <p className="mt-1 text-sm text-slate-500">Turnos, efectivo inicial y resumen de ventas del turno</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!current ? (
        <div className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-card">
          <h2 className="mb-3 font-bold text-slate-800">Abrir turno</h2>
          <p className="mb-4 text-sm text-slate-500">Registra cuánto dinero hay en caja al iniciar.</p>
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold text-navy-900">Efectivo inicial (COP)</span>
              <input
                type="number"
                min="0"
                value={openingCash}
                onChange={e => setOpeningCash(e.target.value)}
                className="rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-semibold text-navy-900">Nota (opcional)</span>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => { void openShift(); }}
            className="mt-4 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 hover:text-white active:bg-brand-700"
          >
            Abrir turno
          </button>
        </div>
      ) : (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Turno abierto</p>
              <p className="font-bold text-slate-800">
                Desde {current.openedAt ? new Date(current.openedAt).toLocaleString("es-CO") : "—"}
              </p>
              <p className="text-sm text-slate-600">Base en caja: {fmt(current.openingCash)} · {current.openedBy}</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Efectivo contado</span>
                <input
                  type="number"
                  min="0"
                  value={countedCash}
                  onChange={e => setCountedCash(e.target.value)}
                  className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => { void closeShift(); }}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 hover:text-white active:bg-rose-700"
              >
                Cerrar turno
              </button>
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-brand-200 bg-brand-50 p-5 lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Ingresos de contado</p>
            <p className="mt-2 text-3xl font-bold text-navy-900">{fmt(summary.contado)}</p>
            <p className="mt-1 text-xs text-slate-500">Efectivo + tarjeta + transferencia + abonos</p>
          </div>
          <div className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ventas del turno</p>
            <p className="mt-2 text-2xl font-bold text-slate-800">{fmt(summary.salesTotal)}</p>
            <p className="text-sm text-slate-500">{summary.salesCount} ventas netas</p>
          </div>
          <div className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Efectivo esperado en caja</p>
            <p className="mt-2 text-2xl font-bold text-slate-800">{fmt(summary.expectedCash)}</p>
            {summary.difference != null && (
              <p className={`text-sm font-semibold ${summary.difference === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                Diferencia: {fmt(summary.difference)}
              </p>
            )}
          </div>
        </div>
      )}

      {summary && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-card">
            <h3 className="mb-3 font-bold text-slate-800">Ventas por método de pago</h3>
            <div className="space-y-2 text-sm">
              {([
                ["efectivo", "Efectivo"],
                ["tarjeta", "Tarjeta"],
                ["transferencia", "Transferencia"],
                ["credito", "Crédito"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex justify-between border-b border-slate-50 py-2">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-semibold text-slate-800">{fmt(summary.byMethod[key])}</span>
                </div>
              ))}
            </div>
            <h4 className="mb-2 mt-4 text-sm font-bold text-slate-700">Abonos a crédito cobrados</h4>
            <div className="space-y-2 text-sm">
              {([
                ["efectivo", "Efectivo"],
                ["tarjeta", "Tarjeta"],
                ["transferencia", "Transferencia"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex justify-between border-b border-slate-50 py-2">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-semibold text-slate-800">{fmt(summary.creditCollections[key])}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-card">
            <h3 className="mb-3 font-bold text-slate-800">Ventas por categoría</h3>
            {summary.byCategory.length === 0 ? (
              <p className="text-sm text-slate-400">Sin ventas en este turno</p>
            ) : (
              <div className="space-y-2 text-sm">
                {summary.byCategory.map(row => (
                  <div key={row.category} className="flex justify-between border-b border-slate-50 py-2">
                    <span className="text-slate-600">{row.category}</span>
                    <span className="font-semibold text-slate-800">{fmt(row.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-card">
        <h3 className="mb-3 font-bold text-slate-800">Historial de turnos</h3>
        <div className="flex flex-col gap-2">
          {history.length === 0 && <p className="text-sm text-slate-400">Aún no hay turnos</p>}
          {history.map(shift => (
            <button
              key={shift.id}
              type="button"
              onClick={() => { void viewShift(shift.id); }}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                selectedId === shift.id ? "border-brand-300 bg-blue-50/60" : "border-slate-200 hover:border-brand-200"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">
                    {shift.openedAt ? new Date(shift.openedAt).toLocaleString("es-CO") : "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Base {fmt(shift.openingCash)} · {shift.openedBy || "—"}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  shift.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}>
                  {shift.status === "open" ? "Abierto" : "Cerrado"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
