import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

type CreditDebt = {
  id: number;
  saleId: number;
  clientId: number;
  clientName: string;
  ticket: string;
  total: number;
  paid: number;
  remaining: number;
  status: "pending" | "partial" | "paid";
  createdAt: string;
  payments?: { id: number; amount: number; method: string; note: string; paidAt: string }[];
};

const statusLabel = {
  pending: "Pendiente",
  partial: "Parcial",
  paid: "Saldado",
} as const;

export function Creditos() {
  const [debts, setDebts] = useState<CreditDebt[]>([]);
  const [selected, setSelected] = useState<CreditDebt | null>(null);
  const [filter, setFilter] = useState<"open" | "all" | "paid">("open");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const firstLoad = debts.length === 0;
    if (firstLoad) setLoading(true);
    setError("");
    try {
      const status = filter === "open" ? undefined : filter === "paid" ? "paid" : undefined;
      let list = await api<CreditDebt[]>(status ? `/credits?status=${status}` : "/credits");
      if (filter === "open") list = list.filter(item => item.status !== "paid");
      setDebts(list);
      if (selected) {
        const fresh = list.find(item => item.id === selected.id);
        if (fresh) setSelected(await api<CreditDebt>(`/credits/${fresh.id}`));
        else setSelected(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar los créditos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filter]);

  const openDetail = async (debt: CreditDebt) => {
    setError("");
    try {
      setSelected(await api<CreditDebt>(`/credits/${debt.id}`));
      setAmount("");
      setNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos abrir el crédito.");
    }
  };

  const pay = async () => {
    if (!selected) return;
    setError("");
    try {
      const updated = await api<CreditDebt>(`/credits/${selected.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), method, note }),
      });
      setSelected(updated);
      setAmount("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos registrar el abono.");
    }
  };

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-brand-600">Promethixia</p>
          <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">Ventas a crédito</h1>
          <p className="mt-1 text-sm text-slate-500">Saldos pendientes y abonos de clientes</p>
        </div>
        <div className="flex gap-1 rounded-2xl border border-white/80 bg-white/80 p-1 shadow-card">
          {([
            ["open", "Pendientes"],
            ["paid", "Saldados"],
            ["all", "Todos"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
                filter === id ? "bg-navy-900 text-white" : "bg-transparent text-slate-700 hover:bg-slate-200 hover:text-navy-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Cargando créditos…</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/80 bg-white/90 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {["Ticket", "Cliente", "Saldo", "Estado", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debts.map(debt => (
                <tr key={debt.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{debt.ticket}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{debt.clientName}</td>
                  <td className="px-4 py-3 font-semibold text-blue-700">{fmt(debt.remaining)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      debt.status === "paid" ? "bg-emerald-50 text-emerald-700"
                        : debt.status === "partial" ? "bg-amber-50 text-amber-700"
                          : "bg-rose-50 text-rose-700"
                    }`}>
                      {statusLabel[debt.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => { void openDetail(debt); }}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && debts.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">No hay créditos en este filtro</p>
          )}
        </div>

        <div className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-card">
          {!selected ? (
            <p className="py-16 text-center text-sm text-slate-400">Selecciona un crédito para ver detalle y abonar</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-bold text-slate-800">{selected.ticket} · {selected.clientName}</p>
                <p className="text-xs text-slate-500">{new Date(selected.createdAt).toLocaleString("es-CO")}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="font-bold">{fmt(selected.total)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Abonado</p>
                  <p className="font-bold">{fmt(selected.paid)}</p>
                </div>
                <div className="rounded-xl bg-blue-50 p-3">
                  <p className="text-xs text-blue-700">Saldo</p>
                  <p className="font-bold text-blue-700">{fmt(selected.remaining)}</p>
                </div>
              </div>

              {selected.status !== "paid" && (
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 p-4">
                  <p className="text-sm font-semibold text-slate-700">Registrar abono</p>
                  <input
                    type="number"
                    min="0"
                    placeholder="Monto"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400"
                  />
                  <select
                    value={method}
                    onChange={e => setMethod(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                  <input
                    placeholder="Nota (opcional)"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400"
                  />
                  <button
                    type="button"
                    disabled={!amount || Number(amount) <= 0}
                    onClick={() => { void pay(); }}
                    className="rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Guardar abono
                  </button>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Historial de abonos</p>
                {(selected.payments ?? []).length === 0 ? (
                  <p className="text-sm text-slate-400">Sin abonos aún</p>
                ) : (
                  <div className="space-y-2">
                    {selected.payments!.map(payment => (
                      <div key={payment.id} className="flex justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-slate-800">{fmt(payment.amount)} · {payment.method}</p>
                          <p className="text-xs text-slate-400">{new Date(payment.paidAt).toLocaleString("es-CO")}</p>
                        </div>
                        {payment.note && <p className="text-xs text-slate-500">{payment.note}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
