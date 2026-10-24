import { useEffect, useState } from "react";
import { fmt } from "../../lib/money";
import { readTheme, subscribeTheme } from "../../lib/theme";
import { Badge, Card, PageHeader } from "../../ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DashboardStats = {
  dateLabel: string;
  today: number;
  week: number;
  year: number;
  todayChange: string;
  weekChange: string;
  weekSeries: { label: string; amount: number }[];
  yearSeries: { label: string; amount: number }[];
  topProducts: { id: number; name: string; sellPrice: number }[];
  lowStock: { id: number; name: string; stock: number }[];
};

export function Dashboard({ stats }: { stats: DashboardStats }) {
  const [chartView, setChartView] = useState<"semana" | "mes">("semana");
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => subscribeTheme(setTheme), []);
  const dark = theme === "dark";
  const data = chartView === "semana" ? stats.weekSeries : stats.yearSeries;
  const dateLabel = stats.dateLabel
    ? new Date(`${stats.dateLabel}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Dashboard" subtitle={dateLabel} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Ventas hoy", value: fmt(stats.today), sub: stats.todayChange, orb: "from-emerald-400 to-cyan-400", tint: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { label: "Ventas semana", value: fmt(stats.week), sub: stats.weekChange, orb: "from-brand-400 to-cyan-300", tint: "text-brand-700 bg-brand-50 border-brand-200" },
          { label: "Ventas año", value: fmt(stats.year), sub: "Acumulado del año", orb: "from-violet-400 to-brand-400", tint: "text-violet-700 bg-violet-50 border-violet-200" },
        ].map((card) => (
          <Card key={card.label} className="relative overflow-hidden p-5">
            <span className={`absolute -right-8 -top-10 size-28 rounded-full bg-gradient-to-br ${card.orb} opacity-30 blur-2xl`} />
            <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
            <p className="mb-3 font-display text-3xl font-extrabold tracking-tight text-navy-900">{card.value}</p>
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${card.tint}`}>{card.sub}</span>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="p-5 xl:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-navy-900">Ventas por período</h2>
            <div className="flex gap-1 rounded-xl bg-slate-100/80 p-1">
              {(["semana", "mes"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setChartView(view)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${chartView === view ? "bg-navy-900 text-white shadow-sm" : "bg-transparent text-slate-700 hover:bg-slate-200 hover:text-navy-900 active:bg-slate-300"}`}
                >
                  {view === "semana" ? "Esta semana" : "Este año"}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#27344d" : "#F1F5F9"} vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: dark ? "#8ba0bd" : "#94A3B8" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: dark ? "#8ba0bd" : "#94A3B8" }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value) => [fmt(Number(value)), "Ventas"]}
                contentStyle={{
                  borderRadius: 10,
                  border: "none",
                  background: dark ? "#151d2e" : "#fff",
                  color: dark ? "#e8eef8" : "#07111f",
                  boxShadow: dark ? "0 8px 24px rgba(0,0,0,.45)" : "0 4px 20px #00000015",
                }}
              />
              <Bar dataKey="amount" fill="#1b6ef3" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card className="flex-1 p-5">
            <h2 className="mb-3 font-bold text-navy-900">Más vendidos</h2>
            <div className="flex flex-col gap-2">
              {stats.topProducts.map((product, index) => (
                <div key={product.id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700">{product.name}</p>
                    <p className="text-xs text-slate-400">{fmt(product.sellPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <h2 className="font-bold text-navy-900">Stock bajo</h2>
            </div>
            {stats.lowStock.length === 0
              ? <p className="text-sm text-slate-400">Sin alertas de stock</p>
              : stats.lowStock.map((product) => (
                <div key={product.id} className="flex items-center justify-between border-b border-slate-50 py-1.5 last:border-0">
                  <p className="text-sm text-slate-700">{product.name}</p>
                  <Badge color="red">{product.stock} uds</Badge>
                </div>
              ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
