import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { fmt } from "../../lib/money";
import { Badge, Button, Card, Input, PageHeader, Select } from "../../ui";

interface CatalogoItem {
  id: string;
  label: string;
}

interface LedgerItem {
  id: number;
  kind: "venta" | "gasto" | string;
  category: string;
  category_label: string;
  concept: string;
  amount: number;
  occurred_on: string;
  note: string;
}

interface LedgerResumen {
  month: string;
  vendido: number;
  gastado: number;
  ganancia: number;
  ventas: { id: string; label: string; amount: number }[];
  gastos: { id: string; label: string; amount: number }[];
  items: LedgerItem[];
  catalogo: { ventas: CatalogoItem[]; gastos: CatalogoItem[] };
}

function mesActual(): string {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

function hoy(): string {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function formatearDia(valor: string): string {
  const [anio, mes, dia] = valor.split("-").map(Number);
  if (!anio || !mes || !dia) return valor;
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

const emptyForm = {
  kind: "venta" as "venta" | "gasto",
  category: "mensualidad_web",
  concept: "",
  amount: "",
  occurred_on: hoy(),
  note: "",
};

export function Caja() {
  const [month, setMonth] = useState(mesActual());
  const [data, setData] = useState<LedgerResumen | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const catalogo = form.kind === "venta" ? data?.catalogo.ventas : data?.catalogo.gastos;
  const opciones = catalogo?.length
    ? catalogo
    : form.kind === "venta"
      ? [
          { id: "mensualidad_web", label: "Mensualidad web" },
          { id: "escritorio", label: "Aplicación de escritorio" },
          { id: "actualizaciones", label: "Actualizaciones" },
          { id: "paquete", label: "Compra de todo" },
          { id: "otro", label: "Otra venta" },
        ]
      : [
          { id: "dominio", label: "Dominio" },
          { id: "cursor", label: "Cursor" },
          { id: "hosting", label: "Hosting / servidor" },
          { id: "otro", label: "Otro gasto" },
        ];

  const cargar = async (mes = month) => {
    const resumen = await api<LedgerResumen>(`/ledger?month=${encodeURIComponent(mes)}`);
    setData(resumen);
  };

  useEffect(() => {
    cargar()
      .catch(() => setError("No pudimos cargar la caja."))
      .finally(() => setLoading(false));
  }, []);

  const cambiarMes = async (valor: string) => {
    setMonth(valor);
    setError("");
    try {
      await cargar(valor);
    } catch {
      setError("No pudimos filtrar ese mes.");
    }
  };

  const cambiarKind = (kind: "venta" | "gasto") => {
    setForm({
      ...form,
      kind,
      category: kind === "venta" ? "mensualidad_web" : "dominio",
    });
  };

  const guardar = async () => {
    const amount = Number(String(form.amount).replace(",", "."));
    if (!form.concept.trim() || !Number.isFinite(amount) || amount <= 0) return;
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await api("/ledger", {
        method: "POST",
        body: JSON.stringify({
          kind: form.kind,
          category: form.category,
          concept: form.concept.trim(),
          amount,
          occurred_on: form.occurred_on,
          note: form.note.trim(),
        }),
      });
      setForm({ ...emptyForm, kind: form.kind, category: form.kind === "venta" ? "mensualidad_web" : "dominio" });
      await cargar();
      setNotice(form.kind === "venta" ? "Venta registrada." : "Gasto registrado.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  const borrar = async (item: LedgerItem) => {
    if (!confirm(`¿Borrar ${item.concept} por ${fmt(item.amount)}?`)) return;
    setError("");
    try {
      await api(`/ledger/${item.id}`, { method: "DELETE" });
      await cargar();
      setNotice("Movimiento borrado.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos borrar el movimiento.");
    }
  };

  const puedeGuardar = form.concept.trim().length > 0 && Number(String(form.amount).replace(",", ".")) > 0;
  const gananciaPositiva = (data?.ganancia ?? 0) >= 0;
  const desglose = useMemo(() => [...(data?.ventas ?? []), ...(data?.gastos ?? [])], [data]);

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Caja de Promethixia"
        subtitle="Registra lo que venden de software y lo que sacan (dominio, Cursor, hosting). La ganancia es vendido menos gastado."
        actions={
          <Input
            label="Mes"
            type="month"
            value={month}
            onChange={(event) => { void cambiarMes(event.target.value); }}
          />
        }
      />

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vendido</p>
          <p className="mt-1 font-display text-2xl font-bold text-navy-900">{fmt(data?.vendido ?? 0)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gastado</p>
          <p className="mt-1 font-display text-2xl font-bold text-rose-700">{fmt(data?.gastado ?? 0)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ganancia</p>
          <p className={`mt-1 font-display text-2xl font-bold ${gananciaPositiva ? "text-emerald-700" : "text-rose-700"}`}>
            {fmt(data?.ganancia ?? 0)}
          </p>
        </Card>
      </div>

      {desglose.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data?.ventas.map((item) => (
            <Badge key={`v-${item.id}`} color="green">{item.label}: {fmt(item.amount)}</Badge>
          ))}
          {data?.gastos.map((item) => (
            <Badge key={`g-${item.id}`} color="red">{item.label}: {fmt(item.amount)}</Badge>
          ))}
        </div>
      )}

      <Card className="max-w-2xl p-5">
        <p className="font-display text-lg font-bold text-navy-900">Registrar movimiento</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant={form.kind === "venta" ? "primary" : "secondary"} onClick={() => cambiarKind("venta")}>
            Venta de software
          </Button>
          <Button size="sm" variant={form.kind === "gasto" ? "primary" : "secondary"} onClick={() => cambiarKind("gasto")}>
            Gasto
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Select
            label={form.kind === "venta" ? "Qué se vendió" : "En qué se gastó"}
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
          >
            {opciones.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </Select>
          <Input
            label="Valor"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="80000"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
          <Input
            label={form.kind === "venta" ? "Negocio o cliente" : "Detalle del gasto"}
            placeholder={form.kind === "venta" ? "Tienda Don Pepe" : "Cursor, dominio, TEC…"}
            value={form.concept}
            onChange={(event) => setForm({ ...form, concept: event.target.value })}
          />
          <Input
            label="Fecha"
            type="date"
            value={form.occurred_on}
            onChange={(event) => setForm({ ...form, occurred_on: event.target.value })}
          />
        </div>
        <div className="mt-3">
          <Input
            label="Nota (opcional)"
            placeholder="Transferencia, Nequi, factura…"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </div>
        <div className="mt-4">
          <Button disabled={!puedeGuardar || saving} onClick={() => { void guardar(); }}>
            {saving ? "Guardando…" : form.kind === "venta" ? "Registrar venta" : "Registrar gasto"}
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {data?.items.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={item.kind === "venta" ? "green" : "red"}>{item.kind === "venta" ? "Venta" : "Gasto"}</Badge>
                  <p className="font-semibold text-navy-900">{item.category_label}</p>
                </div>
                <p className="mt-1 text-sm text-slate-700">{item.concept}</p>
                {item.note ? <p className="text-xs text-slate-400">{item.note}</p> : null}
                <p className="mt-1 text-xs text-slate-400">{formatearDia(item.occurred_on)}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className={`font-display text-lg font-bold ${item.kind === "venta" ? "text-emerald-700" : "text-rose-700"}`}>
                  {item.kind === "venta" ? "+" : "−"} {fmt(item.amount)}
                </p>
                <Button size="sm" variant="ghost" onClick={() => { void borrar(item); }}>Borrar</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {!loading && !data?.items.length && (
        <p className="py-6 text-center text-sm text-slate-400">Aún no hay movimientos en este mes.</p>
      )}
    </div>
  );
}
