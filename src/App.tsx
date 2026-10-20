import { useEffect, useState, useRef } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { api, ApiError } from "./lib/api";
import { restoreSession, signOut } from "./lib/auth";
import {
  normalizeProduct,
  normalizeProducts,
  saveProductSaleSettings,
  type SaleMode,
} from "./lib/productSettings";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Module = "dashboard" | "productos" | "inventario" | "clientes" | "proveedores" | "ventas" | "integraciones" | "usuarios";

type MovementType = "ENTRADA_COMPRA" | "SALIDA_VENTA" | "AJUSTE" | "ENTRADA_INICIAL" | "IMPORTACION";

interface Product {
  id: number; code: string; name: string; category: string;
  buyPrice: number; sellPrice: number; stock: number;
  /** unidad = piezas; granel = peso (kg) en POS */
  saleMode: SaleMode;
  /** Solo aplica a granel: si es false no descuenta ni exige stock */
  tracksInventory: boolean;
}

interface Category {
  id: number;
  name: string;
}

interface InventoryMovement {
  id: number;
  date: string;
  productId: number;
  productName: string;
  productCode: string;
  type: MovementType;
  qty: number;
  balanceAfter: number;
  note: string;
  ref?: string;
}

interface Client {
  id: number; name: string; phone: string; email: string;
  address: string; idNumber: string; birthDate: string;
  totalBought: number; lastPurchase: string;
  history: { date: string; items: string; total: number }[];
}

interface Supplier {
  id: number; name: string; phone: string; products: string;
  orders: { date: string; product: string; productId?: number; qty: number; unitPrice: number; price: number; invoice?: string }[];
}

interface CartItem {
  product: Product; qty: number; weight?: number;
}

interface PosTicket {
  id: number;
  label: string;
  cart: CartItem[];
  payment: "efectivo" | "tarjeta" | null;
  clientId: number | null;
}

interface DashboardStats {
  dateLabel: string;
  today: number;
  week: number;
  year: number;
  todayChange: string;
  weekChange: string;
  weekSeries: { label: string; amount: number }[];
  yearSeries: { label: string; amount: number }[];
  topProducts: Product[];
  lowStock: Product[];
}

interface SaleTicket {
  ticket: string;
  soldAt: string;
  store: string;
}

interface IntegrationsState {
  peripherals: { id: string; label: string; connected: boolean; port: string }[];
  printer: { host: string; tcpPort: number; paperWidth: string };
  dian: { nit: string; softwareId: string; softwarePin: string; environment: string };
}

const emptyStats: DashboardStats = {
  dateLabel: "",
  today: 0, week: 0, year: 0,
  todayChange: "Sin comparación",
  weekChange: "Sin comparación",
  weekSeries: [],
  yearSeries: [],
  topProducts: [],
  lowStock: [],
};

// ─── Utils ────────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const todayStr = () => new Date().toISOString().slice(0, 10);

const movementLabel: Record<MovementType, string> = {
  ENTRADA_COMPRA: "Entrada compra",
  SALIDA_VENTA: "Salida venta",
  AJUSTE: "Ajuste",
  ENTRADA_INICIAL: "Entrada inicial",
  IMPORTACION: "Importación",
};

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pushMovements(
  products: Product[],
  movements: InventoryMovement[],
  entries: { productId: number; qty: number; type: MovementType; note: string; ref?: string; date?: string }[],
): { products: Product[]; movements: InventoryMovement[] } {
  let nextProducts = [...products];
  let nextMovements = [...movements];
  let idBase = Date.now();
  for (const e of entries) {
    const p = nextProducts.find(x => x.id === e.productId);
    if (!p) continue;
    const balanceAfter = Math.max(0, p.stock + e.qty);
    nextProducts = nextProducts.map(x => x.id === e.productId ? { ...x, stock: balanceAfter } : x);
    nextMovements = [{
      id: idBase++,
      date: e.date ?? todayStr(),
      productId: p.id,
      productName: p.name,
      productCode: p.code,
      type: e.type,
      qty: e.qty,
      balanceAfter,
      note: e.note,
      ref: e.ref,
    }, ...nextMovements];
  }
  return { products: nextProducts, movements: nextMovements };
}

/** Simula apertura del cajón monedero vía impresora (ESC/POS kick). */
function openCashDrawer() {
  console.info("[POS] Cajón monedero: pulso de apertura enviado a la impresora");
}

type SaleReceipt = {
  code: string;
  items: { name: string; qty: number; weight?: number; lineTotal: number }[];
  total: number;
  paid: number;
  change: number;
  payment: "efectivo" | "tarjeta";
  clientName?: string;
  printed: boolean;
};

/** Imprime el ticket térmico / de caja en una ventana dedicada. */
function printSaleTicket(sale: SaleReceipt) {
  const rows = sale.items
    .map(i => {
      const qty = i.weight ? `${i.qty}kg` : `x${i.qty}`;
      return `<tr><td>${i.name}<br/><span style="color:#555">${qty}</span></td><td style="text-align:right">${fmt(i.lineTotal)}</td></tr>`;
    })
    .join("");
  const html = `<!DOCTYPE html><html><head><title>Ticket ${sale.code}</title>
    <style>
      body{font-family:ui-monospace,monospace;font-size:12px;width:280px;margin:0 auto;padding:12px;color:#000}
      h1{font-size:14px;text-align:center;margin:0 0 4px}
      p{margin:2px 0;text-align:center}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      td{padding:4px 0;vertical-align:top}
      .line{border-top:1px dashed #000;margin:8px 0}
      .tot{font-weight:700;font-size:13px}
    </style></head><body>
    <h1>Tienda Central</h1>
    <p>NIT 900.123.456-1 · Cali</p>
    <p>Ticket #${sale.code}</p>
    <p>${new Date().toLocaleString("es-CO")}</p>
    ${sale.clientName ? `<p>Cliente: ${sale.clientName}</p>` : ""}
    <div class="line"></div>
    <table>${rows}</table>
    <div class="line"></div>
    <table>
      <tr class="tot"><td>TOTAL</td><td style="text-align:right">${fmt(sale.total)}</td></tr>
      <tr><td>Pago (${sale.payment})</td><td style="text-align:right">${fmt(sale.paid)}</td></tr>
      <tr><td>Cambio</td><td style="text-align:right">${fmt(sale.change)}</td></tr>
    </table>
    <div class="line"></div>
    <p>¡Gracias por su compra!</p>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}</script>
    </body></html>`;
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) {
    window.print();
    return;
  }
  w.document.write(html);
  w.document.close();
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Badge({ children, color = "blue" }: { children: React.ReactNode; color?: "blue" | "green" | "red" | "yellow" | "gray" }) {
  const colors = {
    blue: "border-brand-200 bg-brand-50 text-brand-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    yellow: "border-amber-200 bg-amber-50 text-amber-700",
    gray: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colors[color]}`}>{children}</span>;
}

function Button({ children, onClick, variant = "primary", size = "md", className = "", disabled = false }: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg"; className?: string; disabled?: boolean;
}) {
  const base = "inline-flex items-center justify-center rounded-xl font-semibold shadow-sm transition duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand hover:brightness-110",
    secondary: "border border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300 hover:bg-white",
    ghost: "border border-transparent bg-white/70 text-slate-600 shadow-none hover:border-slate-200 hover:bg-white hover:text-navy-900",
    danger: "bg-gradient-to-br from-rose-500 to-rose-700 text-white hover:brightness-110",
  };
  const sizes = { sm: "px-3 py-1.5 text-sm gap-1.5", md: "px-4 py-2.5 text-sm gap-2", lg: "px-6 py-3 text-base gap-2" };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/80 bg-white/90 shadow-card backdrop-blur-sm transition duration-300 hover:border-brand-200/70 hover:shadow-lg ${className}`}>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/45 p-4 backdrop-blur-md animate-fade">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/70 bg-white shadow-2xl animate-pop">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <h2 className="font-display text-lg font-bold text-navy-900">{title}</h2>
          <button
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, ...props }: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-semibold text-navy-900">{label}</label>}
      <input {...props} className={`rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15 ${props.className ?? ""}`} />
    </div>
  );
}

function Select({ label, children, className = "", ...props }: { label?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-sm font-semibold text-navy-900">{label}</label>}
      <select {...props} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-900 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15">
        {children}
      </select>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const navItems: { id: Module; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "productos", label: "Productos", icon: "⊞" },
  { id: "inventario", label: "Inventario", icon: "▤" },
  { id: "clientes", label: "Clientes", icon: "◎" },
  { id: "proveedores", label: "Proveedores", icon: "⊡" },
  { id: "ventas", label: "Punto de Venta", icon: "⊙" },
  { id: "integraciones", label: "Integraciones", icon: "⊗" },
  { id: "usuarios", label: "Usuarios", icon: "☺" },
];

function Sidebar({ active, onNav, email, onLogout, open }: { active: Module; onNav: (m: Module) => void; email: string; onLogout: () => void; open: boolean }) {
  return (
    <aside className={`mesh-navy fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] shrink-0 select-none flex-col overflow-hidden text-white transition duration-300 lg:static lg:z-auto lg:h-screen lg:w-64 lg:max-w-none ${open ? "" : "drawer-closed"}`}>
      <div className="pointer-events-none absolute -right-16 top-24 size-48 rounded-full bg-brand-400/20 blur-3xl" aria-hidden="true" />
      <div className="relative border-b border-white/10 px-5 py-6">
        <div className="flex items-center gap-3">
          <img src="/brand/promethixia-mark.svg" alt="" width={40} height={40} className="size-10 drop-shadow-[0_8px_16px_rgba(59,130,246,0.45)]" />
          <div>
            <p className="font-display text-sm font-bold leading-tight">Promethixia</p>
            <p className="text-xs text-brand-200">Punto de venta</p>
          </div>
        </div>
      </div>
      <nav className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNav(item.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition duration-200
              ${active === item.id
                ? "bg-white text-navy-900 shadow-lg shadow-black/10"
                : "text-blue-100 hover:translate-x-0.5 hover:bg-white/10 hover:text-white"
              }`}
          >
            <span className={`grid size-8 place-items-center rounded-lg text-sm ${active === item.id ? "bg-brand-50 text-brand-700" : "bg-white/10"}`}>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="relative flex flex-col gap-3 px-4 pb-5">
        <div className="rounded-2xl border border-white/10 bg-white/8 p-3 text-xs text-blue-100 backdrop-blur">
          <p className="mb-1 font-semibold text-white">Tienda Central</p>
          <p className="truncate text-brand-100">{email}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-blue-100 transition hover:bg-white/10 hover:text-white"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ stats }: { stats: DashboardStats }) {
  const [chartView, setChartView] = useState<"semana" | "mes">("semana");
  const data = chartView === "semana" ? stats.weekSeries : stats.yearSeries;
  const lowStock = stats.lowStock;
  const topProducts = stats.topProducts;
  const dateLabel = stats.dateLabel
    ? new Date(`${stats.dateLabel}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm capitalize">{dateLabel}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Ventas Hoy", value: fmt(stats.today), sub: stats.todayChange, color: "text-emerald-700", bg: "border-emerald-200 bg-emerald-50", bar: "from-emerald-400 to-emerald-600" },
          { label: "Ventas Semana", value: fmt(stats.week), sub: stats.weekChange, color: "text-brand-700", bg: "border-brand-200 bg-brand-50", bar: "from-brand-400 to-brand-700" },
          { label: "Ventas Año", value: fmt(stats.year), sub: "Acumulado del año", color: "text-violet-700", bg: "border-violet-200 bg-violet-50", bar: "from-violet-400 to-violet-700" },
        ].map((card, index) => (
          <Card key={card.label} className="relative overflow-hidden p-5 animate-rise hover:-translate-y-1">
            <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.bar}`} />
            <p className="mb-2 text-sm font-medium text-slate-500" style={{ animationDelay: `${index * 70}ms` }}>{card.label}</p>
            <p className="mb-2 font-display text-2xl font-bold text-navy-900">{card.value}</p>
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${card.bg} ${card.color}`}>{card.sub}</span>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Sales Chart */}
        <Card className="p-5 xl:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-slate-700">Ventas por período</h2>
            <div className="flex gap-1">
              {(["semana", "mes"] as const).map(v => (
                <button key={v} onClick={() => setChartView(v)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${chartView === v ? "bg-navy-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-white"}`}>
                  {v === "semana" ? "Esta semana" : "Este año"}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94A3B8" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [fmt(Number(v)), "Ventas"]} contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px #00000015" }} />
              <Bar dataKey="amount" fill="#1b6ef3" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Top Products & Low Stock */}
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card className="p-5 flex-1">
            <h2 className="font-bold text-slate-700 mb-3">Más vendidos</h2>
            <div className="flex flex-col gap-2">
              {topProducts.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{fmt(p.sellPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <h2 className="font-bold text-slate-700">Stock bajo</h2>
            </div>
            {lowStock.length === 0
              ? <p className="text-sm text-slate-400">Sin alertas de stock</p>
              : lowStock.map(p => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <p className="text-sm text-slate-700">{p.name}</p>
                  <Badge color="red">{p.stock} uds</Badge>
                </div>
              ))
            }
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Products ────────────────────────────────────────────────────────────────

function Productos({ products, setProducts, categories, setCategories, movements, setMovements }: {
  products: Product[]; setProducts: (p: Product[]) => void;
  categories: Category[]; setCategories: (c: Category[]) => void;
  movements: InventoryMovement[]; setMovements: (m: InventoryMovement[]) => void;
}) {
  const emptyForm = {
    code: "", name: "", category: "", buyPrice: "", sellPrice: "", stock: "",
    saleMode: "unidad" as SaleMode, tracksInventory: true,
  };
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Todas");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [showCats, setShowCats] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const filterOpts = ["Todas", ...categories.map(c => c.name)];
  const filtered = products.filter(p =>
    (catFilter === "Todas" || p.category === catFilter) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search))
  );

  const openCreate = () => {
    setEditing(null);
    setError("");
    setForm({ ...emptyForm, category: categories[0]?.name ?? "" });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setError("");
    setForm({
      code: p.code, name: p.name, category: p.category,
      buyPrice: String(p.buyPrice), sellPrice: String(p.sellPrice), stock: String(p.stock),
      saleMode: p.saleMode, tracksInventory: p.tracksInventory,
    });
    setShowModal(true);
  };

  const saveProduct = async () => {
    if (!form.name || !form.code) return;
    const saleMode = form.saleMode;
    const tracksInventory = saleMode === "unidad" ? true : form.tracksInventory;
    const initialStock = !editing && tracksInventory ? (Number(form.stock) || 0) : 0;
    // saleMode / tracksInventory se persisten en el cliente (el API aún no los expone).
    const body = {
      code: form.code,
      name: form.name,
      category: form.category || "Sin categoría",
      buyPrice: Number(form.buyPrice) || 0,
      sellPrice: Number(form.sellPrice) || 0,
      ...(editing ? {} : { stock: initialStock }),
    };
    try {
      const saved = editing
        ? await api<Product>(`/products/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await api<Product>("/products", { method: "POST", body: JSON.stringify(body) });
      saveProductSaleSettings(form.code, { saleMode, tracksInventory });
      const normalized = normalizeProduct({ ...saved, saleMode, tracksInventory });
      setProducts(editing
        ? products.map(item => item.id === normalized.id ? normalized : item)
        : [...products, normalized]);
      setCategories(await api<Category[]>("/categories"));
      setMovements(await api<InventoryMovement[]>("/inventory/movements"));
      setShowModal(false);
      setEditing(null);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar el producto.");
    }
  };

  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    try {
      const saved = await api<Category>("/categories", { method: "POST", body: JSON.stringify({ name }) });
      setCategories([...categories.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCat("");
    } catch (err) {
      setImportMsg(err instanceof ApiError ? err.message : "No pudimos crear la categoría.");
    }
  };

  const removeCategory = async (id: number) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    if (products.some(p => p.category === cat.name)) return;
    try {
      await api(`/categories/${id}`, { method: "DELETE" });
      setCategories(categories.filter(c => c.id !== id));
    } catch (err) {
      setImportMsg(err instanceof ApiError ? err.message : "No pudimos eliminar la categoría.");
    }
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setImportMsg("El archivo no tiene filas de datos.");
      return;
    }
    const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const idx = (names: string[]) => header.findIndex(h => names.includes(h));
    const iCode = idx(["codigo", "code", "código"]);
    const iName = idx(["nombre", "name"]);
    const iCat = idx(["categoria", "categoría", "category"]);
    const iBuy = idx(["precio_compra", "buyprice", "p_compra"]);
    const iSell = idx(["precio_venta", "sellprice", "p_venta"]);
    const iStock = idx(["stock", "stock_inicial", "cantidad"]);
    const iMode = idx(["modo", "sale_mode", "tipo_venta", "unidad_granel"]);
    const iTrack = idx(["lleva_inventario", "tracks_inventory", "inventario"]);
    if (iCode < 0 || iName < 0) {
      setImportMsg("CSV inválido. Encabezados mínimos: codigo, nombre");
      return;
    }
    let nextCats = [...categories];
    let added = 0;
    let updated = 0;
    try {
      for (const line of lines.slice(1)) {
        const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        const code = cols[iCode];
        const name = cols[iName];
        if (!code || !name) continue;
        const category = (iCat >= 0 ? cols[iCat] : "") || "Sin categoría";
        const buyPrice = Number(iBuy >= 0 ? cols[iBuy] : 0) || 0;
        const sellPrice = Number(iSell >= 0 ? cols[iSell] : 0) || 0;
        const modeRaw = (iMode >= 0 ? cols[iMode] : "unidad").toLowerCase();
        const saleMode: SaleMode = modeRaw.includes("granel") || modeRaw === "kg" || modeRaw === "peso" ? "granel" : "unidad";
        const trackRaw = (iTrack >= 0 ? cols[iTrack] : "si").toLowerCase();
        const tracksInventory = saleMode === "unidad"
          ? true
          : !(trackRaw === "no" || trackRaw === "0" || trackRaw === "false");
        const stock = tracksInventory ? (Number(iStock >= 0 ? cols[iStock] : 0) || 0) : 0;
        if (!nextCats.some(c => c.name.toLowerCase() === category.toLowerCase())) {
          const savedCategory = await api<Category>("/categories", { method: "POST", body: JSON.stringify({ name: category }) });
          nextCats = [...nextCats, savedCategory];
        }
        const existing = products.find(p => p.code === code);
        saveProductSaleSettings(code, { saleMode, tracksInventory });
        if (existing) {
          await api<Product>(`/products/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({ code, name, category, buyPrice, sellPrice }),
          });
          updated++;
        } else {
          await api<Product>("/products", {
            method: "POST",
            body: JSON.stringify({
              code, name, category, buyPrice, sellPrice, stock,
              entryType: "IMPORTACION",
            }),
          });
          added++;
        }
      }
      setCategories(await api<Category[]>("/categories"));
      setProducts(normalizeProducts(await api<Product[]>("/products")));
      setMovements(await api<InventoryMovement[]>("/inventory/movements"));
      setImportMsg(`Importación lista: ${added} nuevos, ${updated} actualizados.`);
    } catch (err) {
      setImportMsg(err instanceof ApiError ? err.message : "No pudimos importar el archivo.");
    }
  };


  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Productos</h1>
          <p className="text-slate-500 text-sm">{products.length} productos · {categories.length} categorías</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => setShowCats(true)}>Categorías</Button>
          <Button variant="secondary" onClick={() => importRef.current?.click()}>Importar CSV</Button>
          <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />
          <Button onClick={openCreate}>+ Agregar producto</Button>
        </div>
      </div>

      {importMsg && (
        <div className="bg-blue-50 text-blue-700 rounded-xl px-4 py-3 text-sm flex justify-between items-center">
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg(null)} className="text-blue-500 hover:text-blue-800">Cerrar</button>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Buscar por nombre o código..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-72" />
        <Select value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          {filterOpts.map(c => <option key={c}>{c}</option>)}
        </Select>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {["Código", "Nombre", "Categoría", "Modo", "P. Compra", "P. Venta", "Stock", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.code}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                <td className="px-4 py-3"><Badge color="gray">{p.category}</Badge></td>
                <td className="px-4 py-3">
                  <Badge color={p.saleMode === "granel" ? "blue" : "gray"}>
                    {p.saleMode === "granel" ? "Granel" : "Unidad"}
                  </Badge>
                  {p.saleMode === "granel" && !p.tracksInventory && (
                    <span className="ml-1 text-[10px] text-slate-400">sin inv.</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{fmt(p.buyPrice)}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">
                  {fmt(p.sellPrice)}{p.saleMode === "granel" ? <span className="text-xs font-normal text-slate-400">/kg</span> : null}
                </td>
                <td className="px-4 py-3">
                  {p.tracksInventory ? (
                    <span className={`font-bold ${p.stock < 5 ? "text-red-600" : p.stock < 15 ? "text-amber-600" : "text-emerald-600"}`}>
                      {p.stock}{p.saleMode === "granel" ? " kg" : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">No aplica</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(p)} className="text-xs text-blue-600 hover:underline">Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center text-slate-400 py-12 text-sm">Sin resultados</p>}
      </Card>

      {showModal && (
        <Modal title={editing ? "Editar producto" : "Agregar producto"} onClose={() => setShowModal(false)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Nombre del producto" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="sm:col-span-2" />
            <Input label="Código de barras" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
            <Select label="Categoría" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="">Seleccionar…</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </Select>
            <Select
              label="Venta por"
              value={form.saleMode}
              onChange={e => {
                const saleMode = e.target.value as SaleMode;
                setForm({
                  ...form,
                  saleMode,
                  tracksInventory: saleMode === "unidad" ? true : form.tracksInventory,
                });
              }}
            >
              <option value="unidad">Unidad (piezas)</option>
              <option value="granel">Granel (kg / peso)</option>
            </Select>
            {form.saleMode === "granel" ? (
              <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.tracksInventory}
                  onChange={e => setForm({ ...form, tracksInventory: e.target.checked })}
                />
                <span>
                  <span className="font-semibold">Lleva inventario</span>
                  <span className="block text-xs text-slate-500">Si está desactivado, en POS se vende por kg sin descontar stock.</span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-slate-500 sm:col-span-1 self-end pb-1">Los productos por unidad siempre llevan inventario.</p>
            )}
            <Input label={`Precio de compra (COP)${form.saleMode === "granel" ? " / kg" : ""}`} type="number" value={form.buyPrice} onChange={e => setForm({ ...form, buyPrice: e.target.value })} />
            <Input label={`Precio de venta (COP)${form.saleMode === "granel" ? " / kg" : ""}`} type="number" value={form.sellPrice} onChange={e => setForm({ ...form, sellPrice: e.target.value })} />
            {!editing && (form.saleMode === "unidad" || form.tracksInventory) && (
              <Input
                label={form.saleMode === "granel" ? "Stock inicial (kg)" : "Stock inicial (unidades)"}
                type="number"
                value={form.stock}
                onChange={e => setForm({ ...form, stock: e.target.value })}
                className="sm:col-span-2"
              />
            )}
            {!editing && form.saleMode === "granel" && !form.tracksInventory && (
              <p className="text-xs text-slate-500 sm:col-span-2">Este producto a granel no usará inventario; no se pedirá stock inicial.</p>
            )}
            {editing && (form.saleMode === "unidad" || form.tracksInventory) && (
              <p className="text-xs text-slate-500 sm:col-span-2">El stock se gestiona en Inventario (ajustes y entradas).</p>
            )}
          </div>
          <div className="flex gap-2 justify-end mt-5">
            {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={() => { void saveProduct(); }}>{editing ? "Guardar cambios" : "Guardar producto"}</Button>
          </div>
        </Modal>
      )}

      {showCats && (
        <Modal title="Categorías" onClose={() => setShowCats(false)}>
          <div className="flex gap-2 mb-4">
            <Input placeholder="Nueva categoría" value={newCat} onChange={e => setNewCat(e.target.value)} className="flex-1" />
            <Button onClick={() => { void addCategory(); }}>Agregar</Button>
          </div>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {categories.map(c => {
              const inUse = products.some(p => p.category === c.name);
              return (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50">
                  <span className="text-sm font-medium text-slate-800">{c.name}</span>
                  <button
                    disabled={inUse}
                    onClick={() => { void removeCategory(c.id); }}
                    className={`text-xs ${inUse ? "text-slate-300 cursor-not-allowed" : "text-red-500 hover:underline"}`}
                    title={inUse ? "En uso por productos" : "Eliminar"}
                  >
                    {inUse ? "En uso" : "Eliminar"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3">CSV: codigo,nombre,categoria,precio_compra,precio_venta,stock,modo,lleva_inventario</p>
        </Modal>
      )}
    </div>
  );
}

// ─── Inventario ───────────────────────────────────────────────────────────────

function Inventario({ products, setProducts, movements, setMovements }: {
  products: Product[]; setProducts: (p: Product[]) => void;
  movements: InventoryMovement[]; setMovements: (m: InventoryMovement[]) => void;
}) {
  const [tab, setTab] = useState<"stock" | "ajustes" | "movimientos" | "kardex">("stock");
  const [search, setSearch] = useState("");
  const [adjust, setAdjust] = useState({ productId: "", qty: "", reason: "", mode: "set" as "set" | "delta" });
  const [adjustError, setAdjustError] = useState("");
  const [kardexId, setKardexId] = useState<string>("");

  const inventoried = products.filter(p => p.tracksInventory);
  const filteredStock = inventoried.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search)
  );

  const applyAdjust = async () => {
    const productId = Number(adjust.productId);
    if (!productId || adjust.qty === "") return;
    setAdjustError("");
    try {
      await api("/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          productId,
          mode: adjust.mode,
          qty: Number(adjust.qty),
          reason: adjust.reason,
        }),
      });
      setProducts(normalizeProducts(await api<Product[]>("/products")));
      setMovements(await api<InventoryMovement[]>("/inventory/movements"));
      setAdjust({ productId: "", qty: "", reason: "", mode: "set" });
    } catch (err) {
      setAdjustError(err instanceof ApiError ? err.message : "No pudimos registrar el ajuste.");
    }
  };

  const exportGeneral = () => {
    downloadCsv(
      `inventario-general-${todayStr()}.csv`,
      ["codigo", "nombre", "categoria", "modo", "stock", "precio_compra", "precio_venta", "valor_inventario"],
      inventoried.map(p => [p.code, p.name, p.category, p.saleMode, p.stock, p.buyPrice, p.sellPrice, p.stock * p.buyPrice]),
    );
  };

  const exportMovements = () => {
    downloadCsv(
      `movimientos-inventario-${todayStr()}.csv`,
      ["fecha", "codigo", "producto", "tipo", "cantidad", "saldo", "nota", "referencia"],
      movements.map(m => [m.date, m.productCode, m.productName, movementLabel[m.type], m.qty, m.balanceAfter, m.note, m.ref ?? ""]),
    );
  };

  const exportKardex = () => {
    const pid = Number(kardexId);
    const list = movements.filter(m => m.productId === pid).slice().reverse();
    const p = products.find(x => x.id === pid);
    if (!p) return;
    downloadCsv(
      `kardex-${p.code}-${todayStr()}.csv`,
      ["fecha", "tipo", "entrada", "salida", "saldo", "nota", "referencia"],
      list.map(m => [
        m.date,
        movementLabel[m.type],
        m.qty > 0 ? m.qty : "",
        m.qty < 0 ? Math.abs(m.qty) : "",
        m.balanceAfter,
        m.note,
        m.ref ?? "",
      ]),
    );
  };

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "stock", label: "Stock actual" },
    { id: "ajustes", label: "Ajustes" },
    { id: "movimientos", label: "Movimientos" },
    { id: "kardex", label: "Kardex" },
  ];

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventario</h1>
          <p className="text-slate-500 text-sm">{inventoried.length} con inventario · {movements.length} movimientos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={exportGeneral}>Exportar inventario</Button>
          <Button variant="secondary" size="sm" onClick={exportMovements}>Exportar movimientos</Button>
        </div>
      </div>

      <div className="flex w-full flex-wrap gap-1 rounded-2xl border border-white/80 bg-white/80 p-1 shadow-card backdrop-blur sm:w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 ${tab === t.id ? "bg-navy-900 text-white shadow-sm" : "text-slate-600 hover:bg-brand-50 hover:text-navy-900"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
          <Input placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-72" />
          <p className="text-xs text-slate-400">Solo productos que llevan inventario (unidad o granel con inventario).</p>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Código", "Producto", "Modo", "Stock", "Valor (costo)"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStock.map(p => (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-3"><Badge color={p.saleMode === "granel" ? "blue" : "gray"}>{p.saleMode === "granel" ? "Granel" : "Unidad"}</Badge></td>
                    <td className={`px-4 py-3 font-bold ${p.stock < 5 ? "text-red-600" : "text-emerald-600"}`}>
                      {p.stock}{p.saleMode === "granel" ? " kg" : ""}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmt(p.stock * p.buyPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredStock.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">Sin productos con inventario</p>}
          </Card>
        </>
      )}

      {tab === "ajustes" && (
        <Card className="p-5 max-w-xl">
          <h2 className="font-bold text-slate-800 mb-4">Ajuste de inventario</h2>
          <div className="flex flex-col gap-3">
            <Select label="Producto" value={adjust.productId} onChange={e => setAdjust({ ...adjust, productId: e.target.value })}>
              <option value="">Seleccionar producto…</option>
              {inventoried.map(p => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name} (stock {p.stock}{p.saleMode === "granel" ? " kg" : ""})
                </option>
              ))}
            </Select>
            <Select label="Tipo de ajuste" value={adjust.mode} onChange={e => setAdjust({ ...adjust, mode: e.target.value as "set" | "delta" })}>
              <option value="set">Fijar cantidad absoluta</option>
              <option value="delta">Sumar / restar cantidad</option>
            </Select>
            <Input
              label={adjust.mode === "set" ? "Nueva cantidad" : "Cantidad (+ entrada / − salida)"}
              type="number"
              value={adjust.qty}
              onChange={e => setAdjust({ ...adjust, qty: e.target.value })}
            />
            <Input label="Motivo" value={adjust.reason} onChange={e => setAdjust({ ...adjust, reason: e.target.value })} placeholder="Ej. conteo físico, merma, daño…" />
            {adjustError && <p className="text-sm text-red-600">{adjustError}</p>}
            <Button onClick={() => { void applyAdjust(); }} disabled={!adjust.productId || adjust.qty === ""}>Registrar ajuste</Button>
          </div>
        </Card>
      )}

      {tab === "movimientos" && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["Fecha", "Producto", "Tipo", "Cant.", "Saldo", "Nota", "Ref."].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id} className="border-b border-slate-50">
                  <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{m.date}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-800">{m.productName}</p>
                    <p className="text-xs font-mono text-slate-400">{m.productCode}</p>
                  </td>
                  <td className="px-3 py-2.5"><Badge color={m.qty >= 0 ? "green" : "red"}>{movementLabel[m.type]}</Badge></td>
                  <td className={`px-3 py-2.5 font-bold ${m.qty >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{m.balanceAfter}</td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs">{m.note}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-slate-400">{m.ref ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movements.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">Sin movimientos</p>}
        </Card>
      )}

      {tab === "kardex" && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 items-end flex-wrap">
            <Select label="Producto" value={kardexId} onChange={e => setKardexId(e.target.value)} className="w-full sm:min-w-72 sm:w-auto">
              <option value="">Seleccionar producto…</option>
              {inventoried.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </Select>
            <Button variant="secondary" onClick={exportKardex} disabled={!kardexId}>Exportar kardex</Button>
          </div>
          {kardexId && (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["Fecha", "Tipo", "Entrada", "Salida", "Saldo", "Nota"].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.filter(m => m.productId === Number(kardexId)).slice().reverse().map(m => (
                    <tr key={m.id} className="border-b border-slate-50">
                      <td className="px-3 py-2.5 text-xs text-slate-500">{m.date}</td>
                      <td className="px-3 py-2.5"><Badge color="blue">{movementLabel[m.type]}</Badge></td>
                      <td className="px-3 py-2.5 text-emerald-600 font-semibold">{m.qty > 0 ? m.qty : "—"}</td>
                      <td className="px-3 py-2.5 text-red-600 font-semibold">{m.qty < 0 ? Math.abs(m.qty) : "—"}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-800">{m.balanceAfter}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{m.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Clients ─────────────────────────────────────────────────────────────────

function Clientes({ clients, setClients }: { clients: Client[]; setClients: (c: Client[]) => void }) {
  const [detail, setDetail] = useState<Client | null>(null);
  const [showModal, setShowModal] = useState(false);
  const emptyForm = { name: "", phone: "", email: "", address: "", idNumber: "", birthDate: "" };
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const addClient = async () => {
    if (!form.name) return;
    const saved = await api<Client>("/clients", {
      method: "POST",
      body: JSON.stringify({ ...form, birthDate: form.birthDate || null }),
    });
    setClients([...clients, saved]);
    setShowModal(false);
    setForm(emptyForm);
  };

  if (detail) return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>← Volver</Button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{detail.name}</h1>
          <p className="text-slate-500 text-sm">{detail.phone} · {detail.email}</p>
          <p className="text-slate-500 text-sm">{detail.address || "Sin dirección"} · Cédula {detail.idNumber || "—"} · Nacimiento {detail.birthDate || "—"}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Total comprado</p><p className="text-xl font-bold text-blue-700">{fmt(detail.totalBought)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Última compra</p><p className="text-xl font-bold text-slate-700">{detail.lastPurchase}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Pedidos</p><p className="text-xl font-bold text-slate-700">{detail.history.length}</p></Card>
      </div>
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 font-bold text-slate-700">Historial de compras</div>
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50"><th className="px-4 py-2 text-left text-xs text-slate-500">Fecha</th><th className="px-4 py-2 text-left text-xs text-slate-500">Productos</th><th className="px-4 py-2 text-right text-xs text-slate-500">Total</th></tr></thead>
          <tbody>
            {detail.history.map((h, i) => (
              <tr key={i} className="border-t border-slate-50">
                <td className="px-4 py-3 text-slate-500">{h.date}</td>
                <td className="px-4 py-3 text-slate-700">{h.items}</td>
                <td className="px-4 py-3 font-semibold text-right text-slate-800">{fmt(h.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {detail.history.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">Sin historial</p>}
      </Card>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-800">Clientes</h1><p className="text-slate-500 text-sm">{clients.length} clientes</p></div>
        <Button onClick={() => setShowModal(true)}>+ Agregar cliente</Button>
      </div>
      <Input placeholder="Buscar por nombre o teléfono..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-72" />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 border-b border-slate-100">
            {["Nombre", "Teléfono", "Email", "Dirección", "Cédula", "Nacimiento", "Total comprado", "Última compra", ""].map(h =>
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>)}
          </tr></thead>
          <tbody>{filtered.map(c => (
            <tr key={c.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition">
              <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.phone}</td>
              <td className="px-4 py-3 text-slate-500">{c.email}</td>
              <td className="px-4 py-3 text-slate-600">{c.address || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{c.idNumber || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{c.birthDate || "—"}</td>
              <td className="px-4 py-3 font-semibold text-blue-700">{fmt(c.totalBought)}</td>
              <td className="px-4 py-3 text-slate-500">{c.lastPurchase}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => setDetail(c)} className="text-xs text-blue-600 hover:underline">Ver detalle</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      {showModal && (
        <Modal title="Agregar cliente" onClose={() => setShowModal(false)}>
          <div className="flex flex-col gap-3">
            <Input label="Nombre completo" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input label="Teléfono" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <Input label="Dirección" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            <Input label="Número de cédula" value={form.idNumber} onChange={e => setForm({ ...form, idNumber: e.target.value })} />
            <Input label="Fecha de nacimiento" type="date" value={form.birthDate} onChange={e => setForm({ ...form, birthDate: e.target.value })} />
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={() => { void addClient(); }}>Guardar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

function Proveedores({ suppliers, setSuppliers, setProducts, products, movements, setMovements }: {
  suppliers: Supplier[]; setSuppliers: (s: Supplier[]) => void;
  products: Product[]; setProducts: (p: Product[]) => void;
  movements: InventoryMovement[]; setMovements: (m: InventoryMovement[]) => void;
}) {
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [showOrder, setShowOrder] = useState(false);
  const [order, setOrder] = useState({ productId: "", qty: "", unitPrice: "", invoice: "" });
  const [showNew, setShowNew] = useState(false);
  const [newSupp, setNewSupp] = useState({ name: "", phone: "", products: "" });

  const confirmOrder = async () => {
    if (!selected || !order.productId || !order.qty || !order.unitPrice) return;
    const product = products.find(p => p.id === Number(order.productId));
    if (!product) return;
    const qty = Number(order.qty);
    const unitPrice = Number(order.unitPrice);
    const invoice = order.invoice.trim() || `OC-${Date.now().toString().slice(-6)}`;
    const updated = await api<Supplier>(`/suppliers/${selected.id}/orders`, {
      method: "POST",
      body: JSON.stringify({ product: product.name, productId: product.id, qty, unitPrice, invoice }),
    });
    setSuppliers(suppliers.map(item => item.id === updated.id ? updated : item));
    setSelected(updated);
    setProducts(normalizeProducts(await api<Product[]>("/products")));
    setMovements(await api<InventoryMovement[]>("/inventory/movements"));
    setShowOrder(false);
    setOrder({ productId: "", qty: "", unitPrice: "", invoice: "" });
  };

  const addSupplier = async () => {
    if (!newSupp.name) return;
    const saved = await api<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(newSupp) });
    setSuppliers([...suppliers, saved]);
    setShowNew(false);
    setNewSupp({ name: "", phone: "", products: "" });
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-800">Proveedores</h1><p className="text-slate-500 text-sm">{suppliers.length} proveedores</p></div>
        <Button onClick={() => setShowNew(true)}>+ Agregar proveedor</Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Supplier list */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-700 text-sm">Lista de proveedores</div>
          {suppliers.map(s => (
            <button key={s.id} onClick={() => setSelected(s)}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-blue-50 transition flex items-center justify-between ${selected?.id === s.id ? "bg-blue-50 border-l-2 border-l-blue-600" : ""}`}>
              <div>
                <p className="font-medium text-slate-800 text-sm">{s.name}</p>
                <p className="text-xs text-slate-500">{s.products}</p>
              </div>
              <span className="font-mono text-xs text-slate-400">{s.phone}</span>
            </button>
          ))}
        </Card>

        {/* Orders */}
        <div className="flex flex-col gap-4">
          {selected ? (
            <>
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold text-slate-800">{selected.name}</p>
                    <p className="text-xs text-slate-500">{selected.products}</p>
                  </div>
                  <Button size="sm" onClick={() => setShowOrder(true)}>Nueva orden</Button>
                </div>
              </Card>
              <Card className="overflow-hidden flex-1">
                <div className="p-4 border-b border-slate-100 font-semibold text-slate-700 text-sm">Órdenes de compra</div>
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50"><th className="px-3 py-2 text-left text-xs text-slate-500">Fecha</th><th className="px-3 py-2 text-left text-xs text-slate-500">Factura</th><th className="px-3 py-2 text-left text-xs text-slate-500">Producto</th><th className="px-3 py-2 text-center text-xs text-slate-500">Cant.</th><th className="px-3 py-2 text-right text-xs text-slate-500">Precios</th></tr></thead>
                  <tbody>
                    {selected.orders.map((o, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="px-3 py-2.5 text-slate-500 text-xs">{o.date}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{o.invoice ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-700">{o.product}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-slate-700">{o.qty}</td>
                        <td className="px-3 py-2.5 text-right">
                          <p className="text-[11px] text-slate-500">Unitario {fmt(o.unitPrice)}</p>
                          <p className="font-medium text-slate-700">Total {fmt(o.price)}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selected.orders.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">Sin órdenes</p>}
              </Card>
            </>
          ) : <Card className="p-12 flex items-center justify-center text-slate-400 text-sm">Selecciona un proveedor</Card>}
        </div>
      </div>

      {showOrder && selected && (
        <Modal title={`Nueva factura / orden — ${selected.name}`} onClose={() => setShowOrder(false)}>
          <div className="flex flex-col gap-3">
            <Input label="Nº factura del proveedor" placeholder="Ej. FC-4580" value={order.invoice} onChange={e => setOrder({ ...order, invoice: e.target.value })} />
            <Select label="Producto del catálogo" value={order.productId} onChange={e => {
              const p = products.find(x => x.id === Number(e.target.value));
              setOrder({
                ...order,
                productId: e.target.value,
                unitPrice: p ? String(p.buyPrice) : order.unitPrice,
              });
            }}>
              <option value="">Seleccionar producto…</option>
              {products.filter(p => p.tracksInventory).map(p => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name} ({p.saleMode === "granel" ? "granel" : "unidad"})
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Cantidad" type="number" min="1" value={order.qty} onChange={e => setOrder({ ...order, qty: e.target.value })} />
              <Input label="Precio unitario (COP)" type="number" min="0" value={order.unitPrice} onChange={e => setOrder({ ...order, unitPrice: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Precio total (COP)</label>
              <div className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-800">
                {order.qty && order.unitPrice ? fmt(Number(order.qty) * Number(order.unitPrice)) : fmt(0)}
              </div>
            </div>
            <div className="bg-blue-50 text-blue-700 rounded-lg px-3 py-2 text-xs">
              Al confirmar se crea un movimiento ENTRADA_COMPRA y se actualiza el inventario automáticamente.
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="ghost" onClick={() => setShowOrder(false)}>Cancelar</Button>
            <Button onClick={() => { void confirmOrder(); }}>Confirmar y actualizar inventario</Button>
          </div>
        </Modal>
      )}

      {showNew && (
        <Modal title="Agregar proveedor" onClose={() => setShowNew(false)}>
          <div className="flex flex-col gap-3">
            <Input label="Nombre del proveedor" value={newSupp.name} onChange={e => setNewSupp({ ...newSupp, name: e.target.value })} />
            <Input label="Teléfono" value={newSupp.phone} onChange={e => setNewSupp({ ...newSupp, phone: e.target.value })} />
            <Input label="Productos que suministra" value={newSupp.products} onChange={e => setNewSupp({ ...newSupp, products: e.target.value })} />
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={() => { void addSupplier(); }}>Guardar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── POS / Ventas ─────────────────────────────────────────────────────────────

const createTicket = (num = 1): PosTicket => ({
  id: Date.now() + num,
  label: `Ticket ${num}`,
  cart: [],
  payment: null,
  clientId: null,
});

const nextTicketNum = (list: PosTicket[]) =>
  list.reduce((max, t) => {
    const m = t.label.match(/Ticket (\d+)/);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0) + 1;

function Ventas({ products, setProducts, clients, setClients, movements, setMovements }: {
  products: Product[]; setProducts: (p: Product[]) => void;
  clients: Client[]; setClients: (c: Client[]) => void;
  movements: InventoryMovement[]; setMovements: (m: InventoryMovement[]) => void;
}) {
  const [tickets, setTickets] = useState<PosTicket[]>(() => [createTicket(1)]);
  const [activeId, setActiveId] = useState(tickets[0].id);
  const [search, setSearch] = useState("");
  const [weight, setWeight] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");
  const [lastSale, setLastSale] = useState<SaleReceipt | null>(null);
  const [saleError, setSaleError] = useState("");
  const barcodeRef = useRef<HTMLInputElement>(null);

  const active = tickets.find(t => t.id === activeId) ?? tickets[0];
  const cart = active?.cart ?? [];
  const payment = active?.payment ?? null;
  const clientId = active?.clientId ?? null;

  const updateActive = (patch: Partial<PosTicket> | ((t: PosTicket) => Partial<PosTicket>)) => {
    setTickets(prev => prev.map(t => {
      if (t.id !== activeId) return t;
      const next = typeof patch === "function" ? patch(t) : patch;
      return { ...t, ...next };
    }));
  };

  const openTicket = () => {
    const t = createTicket(nextTicketNum(tickets));
    setTickets(prev => [...prev, t]);
    setActiveId(t.id);
    setSearch("");
  };

  const closeTicket = (id: number) => {
    setTickets(prev => {
      if (prev.length === 1) {
        const fresh = createTicket(1);
        setActiveId(fresh.id);
        return [fresh];
      }
      const next = prev.filter(t => t.id !== id);
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  const filtered = search.length > 1
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.code === search)
    : [];

  const addToCart = (p: Product, weightKg?: number) => {
    const isBulk = p.saleMode === "granel";
    if (p.tracksInventory && p.stock <= 0) return;
    const qty = isBulk ? (weightKg || 1) : 1;
    updateActive(t => {
      const ex = t.cart.find(i => i.product.id === p.id);
      const cart = ex
        ? t.cart.map(i => i.product.id === p.id ? { ...i, qty: i.qty + qty } : i)
        : [...t.cart, { product: p, qty, weight: isBulk ? qty : undefined }];
      return { cart };
    });
    setSearch("");
  };

  const removeFromCart = (id: number) =>
    updateActive(t => ({ cart: t.cart.filter(i => i.product.id !== id) }));

  const total = cart.reduce((s, i) => s + i.product.sellPrice * i.qty, 0);
  const paidNum = Number(amountPaid);
  const change = Number.isFinite(paidNum) ? Math.max(0, paidNum - total) : 0;
  const canConfirm =
    !!payment &&
    cart.length > 0 &&
    Number.isFinite(paidNum) &&
    paidNum >= total &&
    amountPaid !== "";

  const openCheckout = () => {
    if (!payment || cart.length === 0) return;
    setSaleError("");
    setAmountPaid(payment === "tarjeta" ? String(total) : "");
    setShowCheckout(true);
  };

  const confirmSale = async (withPrint: boolean) => {
    if (!canConfirm || !payment || !active) return;
    setSaleError("");
    try {
      const saved = await api<SaleTicket>("/sales", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          payment,
          items: cart.map(item => ({
            productId: item.product.id,
            qty: item.qty,
            weight: item.product.saleMode === "granel" ? item.qty : null,
          })),
        }),
      });
      const code = saved.ticket;
      const clientName = clientId ? clients.find(c => c.id === clientId)?.name : undefined;
      const sale: SaleReceipt = {
        code,
        items: cart.map(i => ({
          name: i.product.name,
          qty: i.qty,
          weight: i.weight,
          lineTotal: i.product.sellPrice * i.qty,
        })),
        total,
        paid: paidNum,
        change,
        payment,
        clientName,
        printed: withPrint,
      };
      openCashDrawer();
      if (withPrint) printSaleTicket(sale);
      setProducts(normalizeProducts(await api<Product[]>("/products")));
      setClients(await api<Client[]>("/clients"));
      setMovements(await api<InventoryMovement[]>("/inventory/movements"));
      setShowCheckout(false);
      setAmountPaid("");
      setLastSale(sale);
      closeTicket(active.id);
    } catch (err) {
      setSaleError(err instanceof ApiError ? err.message : "No pudimos confirmar la venta.");
    }
  };

  if (lastSale) return (
    <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[70vh] gap-5">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">Venta confirmada</h2>
        <p className="text-slate-500 text-sm mb-4">Ticket #{lastSale.code}</p>
        <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 mb-3 space-y-1.5 text-left">
          <div className="flex justify-between"><span>Total</span><span className="font-semibold">{fmt(lastSale.total)}</span></div>
          <div className="flex justify-between"><span>Pagó</span><span>{fmt(lastSale.paid)}</span></div>
          <div className="flex justify-between text-emerald-700 font-bold"><span>Cambio</span><span>{fmt(lastSale.change)}</span></div>
        </div>
        <div className="bg-amber-50 text-amber-800 rounded-lg px-3 py-2 text-xs mb-2">
          Cajón monedero abierto
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {lastSale.printed ? "Ticket enviado a impresión" : "Venta sin impresión de ticket"}
          {" · "}
          {tickets.length} ticket{tickets.length === 1 ? "" : "s"} abierto{tickets.length === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => setLastSale(null)}>Continuar</Button>
          {!lastSale.printed && (
            <Button size="sm" className="flex-1" onClick={() => {
              printSaleTicket({ ...lastSale, printed: true });
              setLastSale({ ...lastSale, printed: true });
            }}>
              Imprimir ahora
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-col gap-5 p-4 sm:p-6 lg:h-full lg:flex-row">
      {/* Left: search + products */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-800">Punto de Venta</h1>
          <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg font-medium">
            {tickets.length} ticket{tickets.length === 1 ? "" : "s"} abierto{tickets.length === 1 ? "" : "s"}
          </span>
        </div>
        {/* Barcode / search */}
        <div className="relative">
          <input
            ref={barcodeRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto o escanear código de barras..."
            className="w-full border-2 border-blue-300 rounded-xl px-5 py-4 text-base focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 transition font-medium"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 text-xl">⌕</span>
        </div>

        {/* Product results */}
        {filtered.length > 0 && (
          <Card className="overflow-hidden">
            {filtered.map(p => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 px-4 py-3 transition hover:bg-blue-50">
                <div>
                  <p className="font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400 font-mono">
                    {p.code}
                    {" · "}
                    {p.saleMode === "granel" ? "Granel" : "Unidad"}
                    {" · "}
                    {p.tracksInventory
                      ? `Stock: ${p.stock}${p.saleMode === "granel" ? " kg" : ""}`
                      : "Sin inventario"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                  <span className="font-bold text-blue-700">
                    {fmt(p.sellPrice)}{p.saleMode === "granel" ? <span className="text-xs font-normal">/kg</span> : null}
                  </span>
                  {p.saleMode === "granel" ? (
                    <div className="flex items-center gap-1">
                      <input type="number" min="0.01" step="0.01" placeholder="kg" value={weight} onChange={e => setWeight(e.target.value)}
                        className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center" />
                      <Button
                        size="sm"
                        onClick={() => { addToCart(p, Number(weight) || 1); setWeight(""); }}
                        disabled={p.tracksInventory && p.stock <= 0}
                      >
                        {p.tracksInventory && p.stock <= 0 ? "Sin stock" : "+"}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => addToCart(p)} disabled={p.tracksInventory && p.stock <= 0}>
                      {p.tracksInventory && p.stock <= 0 ? "Sin stock" : "Agregar"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* Client selector */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">Cliente (opcional)</p>
          <select value={clientId ?? ""} onChange={e => updateActive({ clientId: e.target.value ? Number(e.target.value) : null })}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15">
            <option value="">Sin cliente registrado</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Card>
      </div>

      {/* Right: Cart */}
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
        {/* Ticket tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {tickets.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`group flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition duration-200 ${
                t.id === activeId
                  ? "border-navy-900 bg-navy-900 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:-translate-y-px hover:border-brand-300"
              }`}
            >
              <span>{t.label}</span>
              {t.cart.length > 0 && (
                <span className={`min-w-4 h-4 px-1 rounded-full text-[10px] flex items-center justify-center ${
                  t.id === activeId ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"
                }`}>{t.cart.length}</span>
              )}
              <span
                role="button"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); closeTicket(t.id); }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); closeTicket(t.id); } }}
                className={`ml-0.5 w-4 h-4 rounded flex items-center justify-center text-sm leading-none ${
                  t.id === activeId ? "hover:bg-blue-600" : "hover:bg-slate-100 text-slate-400"
                }`}
              >×</span>
            </button>
          ))}
          <button
            onClick={openTicket}
            title="Nuevo ticket"
            className="shrink-0 w-8 h-8 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50 text-lg font-semibold flex items-center justify-center transition"
          >+</button>
        </div>

        <Card className="p-4 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800">{active?.label ?? "Carrito"}</h2>
            {cart.length > 0 && (
              <button onClick={() => updateActive({ cart: [] })} className="text-xs text-red-400 hover:text-red-600">Vaciar</button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {cart.length === 0
              ? <div className="h-full flex items-center justify-center text-slate-300 text-sm">Agrega productos</div>
              : cart.map(item => {
                const isBulk = item.product.saleMode === "granel";
                const step = isBulk ? 0.1 : 1;
                const minQty = isBulk ? 0.1 : 1;
                return (
                <div key={item.product.id} className="flex items-center gap-2 py-2.5 border-b border-slate-50 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.product.name}</p>
                    <p className="text-xs text-slate-400">{isBulk ? `${item.qty}kg` : `×${item.qty}`} · {fmt(item.product.sellPrice * item.qty)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateActive(t => ({
                      cart: t.cart.map(i => i.product.id === item.product.id
                        ? { ...i, qty: Math.max(minQty, Math.round((i.qty - step) * 100) / 100) }
                        : i),
                    }))}
                      className="w-6 h-6 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm flex items-center justify-center">−</button>
                    <span className="text-sm w-7 text-center font-semibold">{isBulk ? item.qty.toFixed(2) : item.qty}</span>
                    <button onClick={() => updateActive(t => ({
                      cart: t.cart.map(i => i.product.id === item.product.id
                        ? { ...i, qty: Math.round((i.qty + step) * 100) / 100 }
                        : i),
                    }))}
                      className="w-6 h-6 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm flex items-center justify-center">+</button>
                    <button onClick={() => removeFromCart(item.product.id)} className="w-6 h-6 text-red-400 hover:text-red-600 ml-1 opacity-0 group-hover:opacity-100 transition">×</button>
                  </div>
                </div>
                );
              })}
          </div>

          {/* Total */}
          <div className="border-t border-slate-100 pt-3 mt-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-slate-500">Subtotal</span>
              <span className="text-sm text-slate-700">{fmt(total)}</span>
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold text-slate-800">Total</span>
              <span className="text-xl font-bold text-blue-700">{fmt(total)}</span>
            </div>

            {/* Payment method */}
            <p className="text-xs font-semibold text-slate-500 mb-2">Método de pago</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(["efectivo", "tarjeta"] as const).map(m => (
                <button key={m} onClick={() => updateActive({ payment: m })}
                  className={`py-2.5 rounded-xl text-sm font-semibold capitalize transition border-2 ${payment === m ? "border-blue-600 bg-blue-700 text-white" : "border-slate-200 text-slate-600 hover:border-blue-400"}`}>
                  {m === "efectivo" ? "Efectivo" : "Tarjeta"}
                </button>
              ))}
            </div>

            {saleError && <p className="mb-2 text-xs text-red-600">{saleError}</p>}
            <Button onClick={openCheckout} disabled={cart.length === 0 || !payment} className="w-full" size="lg">
              Cobrar
            </Button>
          </div>
        </Card>
      </div>

      {showCheckout && (
        <Modal title="Cobrar venta" onClose={() => setShowCheckout(false)}>
          <div className="flex flex-col gap-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Método</span>
                <span className="font-semibold text-slate-800 capitalize">{payment}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Total a pagar</span>
                <span className="text-2xl font-bold text-blue-700">{fmt(total)}</span>
              </div>
            </div>

            <Input
              label="¿Con cuánto paga? (COP)"
              type="number"
              min={total}
              step="100"
              value={amountPaid}
              onChange={e => setAmountPaid(e.target.value)}
              placeholder={String(total)}
              autoFocus
            />

            <div className={`rounded-xl px-4 py-3 flex justify-between items-center ${
              canConfirm ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"
            }`}>
              <span className="text-sm font-medium">Cambio</span>
              <span className="text-xl font-bold">{canConfirm ? fmt(change) : "—"}</span>
            </div>

            {amountPaid !== "" && paidNum < total && (
              <p className="text-xs text-red-600">El monto pagado debe ser mayor o igual al total.</p>
            )}
            {saleError && <p className="text-xs text-red-600">{saleError}</p>}

            <p className="text-xs text-slate-400">
              Al confirmar se abrirá el cajón monedero.
            </p>
          </div>
          <div className="flex flex-col gap-2 mt-5">
            <Button onClick={() => confirmSale(true)} disabled={!canConfirm} className="w-full" size="lg">
              Confirmar e imprimir ticket
            </Button>
            <Button variant="secondary" onClick={() => confirmSale(false)} disabled={!canConfirm} className="w-full">
              Confirmar sin imprimir
            </Button>
            <Button variant="ghost" onClick={() => setShowCheckout(false)} className="w-full">
              Cancelar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────

const peripheralIcons: Record<string, string> = { barcode: "▥", scale: "⊖", printer: "⊟", drawer: "▣", dian: "◫" };

function Integraciones() {
  const [state, setState] = useState<IntegrationsState | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api<IntegrationsState>("/integrations").then(setState).catch(() => setNotice("No pudimos cargar las integraciones."));
  }, []);

  const toggle = async (id: string, connected: boolean) => {
    setState(await api<IntegrationsState>(`/integrations/peripherals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ connected: !connected }),
    }));
  };

  const savePrinter = async () => {
    if (!state) return;
    setState(await api<IntegrationsState>("/integrations/printer", { method: "PUT", body: JSON.stringify(state.printer) }));
    setNotice("Configuración de impresora guardada.");
  };

  const saveDian = async () => {
    if (!state) return;
    setState(await api<IntegrationsState>("/integrations/dian", { method: "PUT", body: JSON.stringify(state.dian) }));
    setNotice("Configuración DIAN guardada.");
  };

  if (!state) return <div className="p-6 text-slate-500">{notice || "Cargando integraciones…"}</div>;
  const peripherals = state.peripherals.map(item => ({ ...item, icon: peripheralIcons[item.id] ?? "▣" }));

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Integraciones</h1>
        <p className="text-slate-500 text-sm">Estado de periféricos y servicios externos</p>
        {notice && <p className="text-sm text-blue-700 mt-1">{notice}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {peripherals.map(p => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${p.connected ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"}`}>{p.icon}</div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{p.label}</p>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">{p.port}</p>
                </div>
              </div>
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${p.connected ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${p.connected ? "bg-emerald-500" : "bg-red-400"}`}></span>
                {p.connected ? "Conectado" : "Desconectado"}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant={p.connected ? "danger" : "primary"} size="sm" onClick={() => { void toggle(p.id, p.connected); }}>
                {p.connected ? "Desconectar" : "Conectar"}
              </Button>
              <Button variant="ghost" size="sm">Configurar</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="font-bold text-slate-700 mb-4 text-sm">Configuración de impresora de tickets</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="IP / Puerto" value={state.printer.host} onChange={e => setState({ ...state, printer: { ...state.printer, host: e.target.value } })} />
          <Input label="Puerto TCP" type="number" value={state.printer.tcpPort} onChange={e => setState({ ...state, printer: { ...state.printer, tcpPort: Number(e.target.value) } })} />
          <Select label="Ancho de papel" value={state.printer.paperWidth} onChange={e => setState({ ...state, printer: { ...state.printer, paperWidth: e.target.value } })}><option>80mm</option><option>58mm</option></Select>
        </div>
        <div className="flex gap-2 mt-4">
          <Button size="sm" onClick={() => { void savePrinter(); }}>Guardar configuración</Button>
          <Button variant="secondary" size="sm">Imprimir prueba</Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-slate-700 mb-4 text-sm">DIAN — Facturación electrónica</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="NIT empresa" value={state.dian.nit} onChange={e => setState({ ...state, dian: { ...state.dian, nit: e.target.value } })} />
          <Input label="Software ID" value={state.dian.softwareId} onChange={e => setState({ ...state, dian: { ...state.dian, softwareId: e.target.value } })} />
          <Input label="PIN de software" type="password" value={state.dian.softwarePin} onChange={e => setState({ ...state, dian: { ...state.dian, softwarePin: e.target.value } })} />
          <Select label="Ambiente" value={state.dian.environment} onChange={e => setState({ ...state, dian: { ...state.dian, environment: e.target.value } })}><option>Producción</option><option>Habilitación / Pruebas</option></Select>
        </div>
        <div className="mt-4 p-3 bg-emerald-50 rounded-xl flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <p className="text-sm text-emerald-700 font-medium">{state.peripherals.find(item => item.id === "dian")?.connected ? "Conexión marcada como activa con servicios DIAN" : "DIAN desconectada"}</p>
        </div>
      </Card>
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────

interface AccountUser {
  id: number;
  email: string;
  is_active: boolean;
  created_at: string;
}

function Usuarios() {
  const emptyForm = { email: "", password: "" };
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    setUsers(await api<AccountUser[]>("/users"));
  };

  useEffect(() => {
    loadUsers()
      .catch(() => setError("No pudimos cargar los usuarios."))
      .finally(() => setLoading(false));
  }, []);

  const createUser = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.password.length < 6) return;
    setError("");
    try {
      const saved = await api<AccountUser>("/users", {
        method: "POST",
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      });
      setUsers([saved, ...users.filter(user => user.id !== saved.id)]);
      setForm(emptyForm);
      setShowModal(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos crear el usuario.");
    }
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Usuarios</h1>
          <p className="text-slate-500 text-sm">{users.length} cuentas con acceso al sistema</p>
        </div>
        <Button onClick={() => { setError(""); setShowModal(true); }}>+ Crear usuario</Button>
      </div>

      {error && !showModal && <p className="text-sm text-red-600">{error}</p>}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {["Correo", "Estado", "Creado"].map(heading => (
                <th key={heading} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{user.email}</td>
                <td className="px-4 py-3"><Badge color={user.is_active ? "green" : "gray"}>{user.is_active ? "Activo" : "Inactivo"}</Badge></td>
                <td className="px-4 py-3 text-slate-500">{new Date(user.created_at).toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && <p className="text-center text-slate-400 py-12 text-sm">Aún no hay usuarios</p>}
        {loading && <p className="text-center text-slate-400 py-12 text-sm">Cargando usuarios…</p>}
      </Card>

      {showModal && (
        <Modal title="Crear usuario" onClose={() => setShowModal(false)}>
          <div className="flex flex-col gap-3">
            <Input label="Correo electrónico" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <Input label="Contraseña" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <p className="text-xs text-slate-500">Mínimo 6 caracteres. La persona entra con este correo y esta contraseña.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={() => { void createUser(); }} disabled={!form.email.trim() || form.password.length < 6}>Guardar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [module, setModule] = useState<Module>("dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    restoreSession()
      .then((session) => setSessionEmail(session?.user.email ?? null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (!sessionEmail) return;
    Promise.all([
      api<Product[]>("/products"),
      api<Client[]>("/clients"),
      api<Supplier[]>("/suppliers"),
      api<DashboardStats>("/dashboard"),
      api<Category[]>("/categories"),
      api<InventoryMovement[]>("/inventory/movements"),
    ]).then(([nextProducts, nextClients, nextSuppliers, nextStats, nextCategories, nextMovements]) => {
      setProducts(normalizeProducts(nextProducts));
      setClients(nextClients);
      setSuppliers(nextSuppliers);
      setStats(nextStats);
      setCategories(nextCategories);
      setMovements(nextMovements);
    }).catch(() => undefined);
  }, [sessionEmail]);

  useEffect(() => {
    if (!sessionEmail || module !== "dashboard") return;
    api<DashboardStats>("/dashboard").then(setStats).catch(() => undefined);
  }, [sessionEmail, module]);

  if (!authReady) {
    return (
      <div className="mesh-navy grid min-h-dvh place-items-center">
        <img src="/brand/promethixia-mark.svg" alt="" width={72} height={72} className="size-16 animate-shimmer drop-shadow-[0_12px_28px_rgba(59,130,246,0.45)]" />
      </div>
    );
  }

  if (!sessionEmail) {
    return <LoginScreen onSuccess={setSessionEmail} />;
  }

  const moduleLabel = navItems.find(item => item.id === module)?.label ?? "Promethixia";

  return (
    <div className="flex min-h-dvh overflow-x-hidden font-body">
      <Sidebar
        active={module}
        open={menuOpen}
        onNav={(next) => {
          setModule(next);
          setMenuOpen(false);
        }}
        email={sessionEmail}
        onLogout={() => {
          void signOut().then(() => setSessionEmail(null));
        }}
      />
      {menuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-navy-900/50 backdrop-blur-sm lg:hidden"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <main className="app-canvas relative min-w-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-lg text-navy-900"
          >
            ☰
          </button>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold text-navy-900">{moduleLabel}</p>
            <p className="truncate text-xs text-slate-500">{sessionEmail}</p>
          </div>
        </div>
        <div key={module} className="animate-rise">
        {module === "dashboard" && <Dashboard stats={stats} />}
        {module === "productos" && (
          <Productos
            products={products} setProducts={setProducts}
            categories={categories} setCategories={setCategories}
            movements={movements} setMovements={setMovements}
          />
        )}
        {module === "inventario" && (
          <Inventario
            products={products} setProducts={setProducts}
            movements={movements} setMovements={setMovements}
          />
        )}
        {module === "clientes" && <Clientes clients={clients} setClients={setClients} />}
        {module === "proveedores" && (
          <Proveedores
            suppliers={suppliers} setSuppliers={setSuppliers}
            products={products} setProducts={setProducts}
            movements={movements} setMovements={setMovements}
          />
        )}
        {module === "ventas" && (
          <Ventas
            products={products} setProducts={setProducts}
            clients={clients} setClients={setClients}
            movements={movements} setMovements={setMovements}
          />
        )}
        {module === "integraciones" && <Integraciones />}
        {module === "usuarios" && <Usuarios />}
        </div>
      </main>
    </div>
  );
}
