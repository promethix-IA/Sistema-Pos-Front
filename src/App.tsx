import { useState, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Module = "dashboard" | "productos" | "inventario" | "clientes" | "proveedores" | "ventas" | "integraciones";

type MovementType = "ENTRADA_COMPRA" | "SALIDA_VENTA" | "AJUSTE" | "ENTRADA_INICIAL" | "IMPORTACION";

interface Product {
  id: number; code: string; name: string; category: string;
  buyPrice: number; sellPrice: number; stock: number;
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

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const initProducts: Product[] = [
  { id: 1, code: "001", name: "Café Americano", category: "Bebidas", buyPrice: 1200, sellPrice: 3500, stock: 45 },
  { id: 2, code: "002", name: "Empanada de pipián", category: "Comida", buyPrice: 800, sellPrice: 2500, stock: 3 },
  { id: 3, code: "003", name: "Agua mineral 500ml", category: "Bebidas", buyPrice: 600, sellPrice: 1800, stock: 60 },
  { id: 4, code: "004", name: "Sándwich mixto", category: "Comida", buyPrice: 2500, sellPrice: 6000, stock: 8 },
  { id: 5, code: "005", name: "Brownie", category: "Panadería", buyPrice: 1000, sellPrice: 3000, stock: 2 },
  { id: 6, code: "006", name: "Té verde", category: "Bebidas", buyPrice: 900, sellPrice: 2800, stock: 30 },
  { id: 7, code: "007", name: "Queso (kg)", category: "Lácteos", buyPrice: 18000, sellPrice: 28000, stock: 12 },
];

const initClients: Client[] = [
  { id: 1, name: "María López", phone: "3114567890", email: "maria@gmail.com", address: "Cra 5 #12-40", idNumber: "1144088123", birthDate: "1992-03-18", totalBought: 145000, lastPurchase: "2026-09-14",
    history: [{ date: "2026-09-14", items: "Café × 2, Brownie × 1", total: 10000 }, { date: "2026-09-12", items: "Sándwich × 1, Agua × 2", total: 9600 }] },
  { id: 2, name: "Carlos Ruiz", phone: "3009876543", email: "c.ruiz@outlook.com", address: "Calle 23 #8-15", idNumber: "1098765432", birthDate: "1988-11-02", totalBought: 98000, lastPurchase: "2026-09-13",
    history: [{ date: "2026-09-13", items: "Café × 3, Té × 1", total: 13300 }] },
  { id: 3, name: "Luisa Fernández", phone: "3201112233", email: "luisaf@yahoo.com", address: "Av. Roosevelt #45-10", idNumber: "3155566677", birthDate: "1996-07-25", totalBought: 220000, lastPurchase: "2026-09-15",
    history: [{ date: "2026-09-15", items: "Queso 0.5kg, Empanada × 2", total: 19000 }] },
  { id: 4, name: "Andrés Moreno", phone: "3158889900", email: "andres.m@empresa.co", address: "Calle 70 #3-22", idNumber: "8012345678", birthDate: "1985-01-09", totalBought: 67000, lastPurchase: "2026-09-10",
    history: [{ date: "2026-09-10", items: "Agua × 5, Brownie × 2", total: 15000 }] },
];

const initCategories: Category[] = [
  { id: 1, name: "Bebidas" },
  { id: 2, name: "Comida" },
  { id: 3, name: "Panadería" },
  { id: 4, name: "Lácteos" },
];

const initSuppliers: Supplier[] = [
  { id: 1, name: "Café del Norte SAS", phone: "6014441122", products: "Café, Té",
    orders: [{ date: "2026-09-01", product: "Café Americano", productId: 1, qty: 50, unitPrice: 1200, price: 60000, invoice: "FC-1001" }] },
  { id: 2, name: "Pan y Más Ltda.", phone: "6025556677", products: "Panadería, Empanadas",
    orders: [{ date: "2026-09-05", product: "Brownie", productId: 5, qty: 30, unitPrice: 1000, price: 30000, invoice: "FC-2044" }] },
  { id: 3, name: "Lácteos El Campo", phone: "3206667788", products: "Queso, Mantequilla",
    orders: [] },
];

const initMovements: InventoryMovement[] = initProducts.map((p, i) => ({
  id: i + 1,
  date: "2026-09-01",
  productId: p.id,
  productName: p.name,
  productCode: p.code,
  type: "ENTRADA_INICIAL",
  qty: p.stock,
  balanceAfter: p.stock,
  note: "Stock inicial del sistema",
  ref: "INI",
}));

const salesData = [
  { label: "Lun", amount: 185000 }, { label: "Mar", amount: 240000 }, { label: "Mié", amount: 198000 },
  { label: "Jue", amount: 310000 }, { label: "Vie", amount: 428000 }, { label: "Sáb", amount: 512000 },
  { label: "Hoy", amount: 287000 },
];

const monthData = [
  { label: "Mar", amount: 4200000 }, { label: "Abr", amount: 3980000 }, { label: "May", amount: 5100000 },
  { label: "Jun", amount: 4750000 }, { label: "Jul", amount: 5400000 }, { label: "Ago", amount: 6100000 },
  { label: "Sep", amount: 2870000 },
];

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
    blue: "bg-blue-100 text-blue-700", green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700", yellow: "bg-amber-100 text-amber-700",
    gray: "bg-slate-100 text-slate-600",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>{children}</span>;
}

function Button({ children, onClick, variant = "primary", size = "md", className = "", disabled = false }: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg"; className?: string; disabled?: boolean;
}) {
  const base = "inline-flex items-center justify-center font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-blue-700 text-white hover:bg-blue-800 focus:ring-blue-500",
    secondary: "bg-blue-50 text-blue-700 hover:bg-blue-100 focus:ring-blue-300",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 focus:ring-slate-300",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-400",
  };
  const sizes = { sm: "px-3 py-1.5 text-sm gap-1.5", md: "px-4 py-2 text-sm gap-2", lg: "px-6 py-3 text-base gap-2" };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${className}`}>{children}</div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, ...props }: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
      <input {...props} className={`border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition ${props.className ?? ""}`} />
    </div>
  );
}

function Select({ label, children, className = "", ...props }: { label?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
      <select {...props} className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
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
];

function Sidebar({ active, onNav }: { active: Module; onNav: (m: Module) => void }) {
  return (
    <aside className="w-64 min-h-screen bg-blue-900 flex flex-col select-none shrink-0">
      <div className="px-6 py-6 border-b border-blue-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold text-lg">E</div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">ERP POS</p>
            <p className="text-blue-300 text-xs">v2.1 · Tienda</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNav(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left
              ${active === item.id
                ? "bg-blue-700 text-white shadow-sm"
                : "text-blue-200 hover:bg-blue-800 hover:text-white"
              }`}
          >
            <span className="text-base opacity-80">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="px-4 pb-5">
        <div className="bg-blue-800 rounded-xl p-3 text-xs text-blue-300">
          <p className="font-semibold text-blue-200 mb-1">Tienda Central</p>
          <p>NIT 900.123.456-1</p>
          <p>Cali, Colombia</p>
        </div>
      </div>
    </aside>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ products }: { products: Product[] }) {
  const [chartView, setChartView] = useState<"semana" | "mes">("semana");
  const data = chartView === "semana" ? salesData : monthData;
  const lowStock = products.filter(p => p.stock < 5);
  const topProducts = [...products].sort((a, b) => b.sellPrice - a.sellPrice).slice(0, 5);

  return (
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm">Martes, 15 de septiembre de 2026</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Ventas Hoy", value: fmt(287000), sub: "+12% vs ayer", color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Ventas Semana", value: fmt(2160000), sub: "+8% vs semana pasada", color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Ventas Año", value: fmt(38420000), sub: "Meta: $45M COP", color: "text-violet-600", bg: "bg-violet-50" },
        ].map(card => (
          <Card key={card.label} className="p-5">
            <p className="text-sm text-slate-500 font-medium mb-2">{card.label}</p>
            <p className="text-2xl font-bold text-slate-800 mb-1">{card.value}</p>
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${card.bg} ${card.color}`}>{card.sub}</span>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Sales Chart */}
        <Card className="col-span-3 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-700">Ventas por período</h2>
            <div className="flex gap-1">
              {(["semana", "mes"] as const).map(v => (
                <button key={v} onClick={() => setChartView(v)}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition ${chartView === v ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
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
              <Bar dataKey="amount" fill="#1D4ED8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Top Products & Low Stock */}
        <div className="col-span-2 flex flex-col gap-4">
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
  const emptyForm = { code: "", name: "", category: "", buyPrice: "", sellPrice: "", stock: "" };
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Todas");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
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
    setForm({ ...emptyForm, category: categories[0]?.name ?? "" });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      code: p.code, name: p.name, category: p.category,
      buyPrice: String(p.buyPrice), sellPrice: String(p.sellPrice), stock: String(p.stock),
    });
    setShowModal(true);
  };

  const saveProduct = () => {
    if (!form.name || !form.code) return;
    if (editing) {
      setProducts(products.map(p => p.id === editing.id ? {
        ...p,
        code: form.code,
        name: form.name,
        category: form.category || "Sin categoría",
        buyPrice: Number(form.buyPrice) || 0,
        sellPrice: Number(form.sellPrice) || 0,
      } : p));
    } else {
      const stock = Number(form.stock) || 0;
      const np: Product = {
        id: Date.now(), code: form.code, name: form.name, category: form.category || "Sin categoría",
        buyPrice: Number(form.buyPrice) || 0, sellPrice: Number(form.sellPrice) || 0, stock,
      };
      let nextProducts = [...products, np];
      let nextMovements = movements;
      if (stock > 0) {
        const r = pushMovements(nextProducts, movements, [{
          productId: np.id, qty: stock, type: "ENTRADA_INICIAL", note: "Stock inicial al crear producto",
        }]);
        nextProducts = r.products;
        nextMovements = r.movements;
      }
      setProducts(nextProducts);
      setMovements(nextMovements);
    }
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const addCategory = () => {
    const name = newCat.trim();
    if (!name) return;
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      setNewCat("");
      return;
    }
    setCategories([...categories, { id: Date.now(), name }]);
    setNewCat("");
  };

  const removeCategory = (id: number) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    if (products.some(p => p.category === cat.name)) return;
    setCategories(categories.filter(c => c.id !== id));
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
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
      if (iCode < 0 || iName < 0) {
        setImportMsg("CSV inválido. Encabezados mínimos: codigo, nombre");
        return;
      }
      let nextProducts = [...products];
      let nextCats = [...categories];
      const stockEntries: { productId: number; qty: number; type: MovementType; note: string }[] = [];
      let added = 0;
      let updated = 0;
      for (const line of lines.slice(1)) {
        const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        const code = cols[iCode];
        const name = cols[iName];
        if (!code || !name) continue;
        const category = (iCat >= 0 ? cols[iCat] : "") || "Sin categoría";
        const buyPrice = Number(iBuy >= 0 ? cols[iBuy] : 0) || 0;
        const sellPrice = Number(iSell >= 0 ? cols[iSell] : 0) || 0;
        const stock = Number(iStock >= 0 ? cols[iStock] : 0) || 0;
        if (!nextCats.some(c => c.name.toLowerCase() === category.toLowerCase())) {
          nextCats = [...nextCats, { id: Date.now() + nextCats.length, name: category }];
        }
        const existing = nextProducts.find(p => p.code === code);
        if (existing) {
          nextProducts = nextProducts.map(p => p.code === code
            ? { ...p, name, category, buyPrice, sellPrice }
            : p);
          updated++;
        } else {
          const np: Product = { id: Date.now() + added, code, name, category, buyPrice, sellPrice, stock: 0 };
          nextProducts = [...nextProducts, np];
          if (stock > 0) {
            stockEntries.push({ productId: np.id, qty: stock, type: "IMPORTACION", note: "Importación masiva CSV" });
          }
          added++;
        }
      }
      const r = pushMovements(nextProducts, movements, stockEntries);
      setCategories(nextCats);
      setProducts(r.products);
      setMovements(r.movements);
      setImportMsg(`Importación lista: ${added} nuevos, ${updated} actualizados.`);
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-6 flex flex-col gap-5">
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
        <Input placeholder="Buscar por nombre o código..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
        <Select value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          {filterOpts.map(c => <option key={c}>{c}</option>)}
        </Select>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {["Código", "Nombre", "Categoría", "P. Compra", "P. Venta", "Stock", ""].map(h => (
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
                <td className="px-4 py-3 text-slate-600">{fmt(p.buyPrice)}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{fmt(p.sellPrice)}</td>
                <td className="px-4 py-3">
                  <span className={`font-bold ${p.stock < 5 ? "text-red-600" : p.stock < 15 ? "text-amber-600" : "text-emerald-600"}`}>{p.stock}</span>
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
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre del producto" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="col-span-2" />
            <Input label="Código de barras" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
            <Select label="Categoría" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="">Seleccionar…</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </Select>
            <Input label="Precio de compra (COP)" type="number" value={form.buyPrice} onChange={e => setForm({ ...form, buyPrice: e.target.value })} />
            <Input label="Precio de venta (COP)" type="number" value={form.sellPrice} onChange={e => setForm({ ...form, sellPrice: e.target.value })} />
            {!editing && (
              <Input label="Stock inicial" type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="col-span-2" />
            )}
            {editing && (
              <p className="col-span-2 text-xs text-slate-500">El stock se gestiona en Inventario (ajustes y entradas).</p>
            )}
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={saveProduct}>{editing ? "Guardar cambios" : "Guardar producto"}</Button>
          </div>
        </Modal>
      )}

      {showCats && (
        <Modal title="Categorías" onClose={() => setShowCats(false)}>
          <div className="flex gap-2 mb-4">
            <Input placeholder="Nueva categoría" value={newCat} onChange={e => setNewCat(e.target.value)} className="flex-1" />
            <Button onClick={addCategory}>Agregar</Button>
          </div>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {categories.map(c => {
              const inUse = products.some(p => p.category === c.name);
              return (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50">
                  <span className="text-sm font-medium text-slate-800">{c.name}</span>
                  <button
                    disabled={inUse}
                    onClick={() => removeCategory(c.id)}
                    className={`text-xs ${inUse ? "text-slate-300 cursor-not-allowed" : "text-red-500 hover:underline"}`}
                    title={inUse ? "En uso por productos" : "Eliminar"}
                  >
                    {inUse ? "En uso" : "Eliminar"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3">CSV: codigo,nombre,categoria,precio_compra,precio_venta,stock</p>
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
  const [kardexId, setKardexId] = useState<string>("");

  const filteredStock = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search)
  );

  const applyAdjust = () => {
    const productId = Number(adjust.productId);
    const p = products.find(x => x.id === productId);
    if (!p || !adjust.qty) return;
    const value = Number(adjust.qty);
    if (!Number.isFinite(value)) return;
    const delta = adjust.mode === "set" ? value - p.stock : value;
    if (delta === 0) return;
    const r = pushMovements(products, movements, [{
      productId,
      qty: delta,
      type: "AJUSTE",
      note: adjust.reason || (adjust.mode === "set" ? `Ajuste a cantidad ${value}` : `Ajuste relativo ${delta > 0 ? "+" : ""}${delta}`),
      ref: "AJUSTE",
    }]);
    setProducts(r.products);
    setMovements(r.movements);
    setAdjust({ productId: "", qty: "", reason: "", mode: "set" });
  };

  const exportGeneral = () => {
    downloadCsv(
      `inventario-general-${todayStr()}.csv`,
      ["codigo", "nombre", "categoria", "stock", "precio_compra", "precio_venta", "valor_inventario"],
      products.map(p => [p.code, p.name, p.category, p.stock, p.buyPrice, p.sellPrice, p.stock * p.buyPrice]),
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
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventario</h1>
          <p className="text-slate-500 text-sm">{products.length} productos · {movements.length} movimientos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={exportGeneral}>Exportar inventario</Button>
          <Button variant="secondary" size="sm" onClick={exportMovements}>Exportar movimientos</Button>
        </div>
      </div>

      <div className="flex gap-1 bg-white border border-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === t.id ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
          <Input placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="w-72" />
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Código", "Producto", "Categoría", "Stock", "Valor (costo)"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStock.map(p => (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-3"><Badge color="gray">{p.category}</Badge></td>
                    <td className={`px-4 py-3 font-bold ${p.stock < 5 ? "text-red-600" : "text-emerald-600"}`}>{p.stock}</td>
                    <td className="px-4 py-3 text-slate-600">{fmt(p.stock * p.buyPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === "ajustes" && (
        <Card className="p-5 max-w-xl">
          <h2 className="font-bold text-slate-800 mb-4">Ajuste de inventario</h2>
          <div className="flex flex-col gap-3">
            <Select label="Producto" value={adjust.productId} onChange={e => setAdjust({ ...adjust, productId: e.target.value })}>
              <option value="">Seleccionar producto…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name} (stock {p.stock})</option>)}
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
            <Button onClick={applyAdjust} disabled={!adjust.productId || !adjust.qty}>Registrar ajuste</Button>
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
            <Select label="Producto" value={kardexId} onChange={e => setKardexId(e.target.value)} className="min-w-72">
              <option value="">Seleccionar producto…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
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

  const addClient = () => {
    if (!form.name) return;
    const nc: Client = {
      id: Date.now(), name: form.name, phone: form.phone, email: form.email,
      address: form.address, idNumber: form.idNumber, birthDate: form.birthDate,
      totalBought: 0, lastPurchase: "—", history: [],
    };
    setClients([...clients, nc]);
    setShowModal(false);
    setForm(emptyForm);
  };

  if (detail) return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>← Volver</Button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{detail.name}</h1>
          <p className="text-slate-500 text-sm">{detail.phone} · {detail.email}</p>
          <p className="text-slate-500 text-sm">{detail.address || "Sin dirección"} · Cédula {detail.idNumber || "—"} · Nacimiento {detail.birthDate || "—"}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
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
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800">Clientes</h1><p className="text-slate-500 text-sm">{clients.length} clientes</p></div>
        <Button onClick={() => setShowModal(true)}>+ Agregar cliente</Button>
      </div>
      <Input placeholder="Buscar por nombre o teléfono..." value={search} onChange={e => setSearch(e.target.value)} className="w-72" />
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
            <Button onClick={addClient}>Guardar</Button>
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

  const confirmOrder = () => {
    if (!selected || !order.productId || !order.qty || !order.unitPrice) return;
    const product = products.find(p => p.id === Number(order.productId));
    if (!product) return;
    const qty = Number(order.qty);
    const unitPrice = Number(order.unitPrice);
    const price = qty * unitPrice;
    const invoice = order.invoice.trim() || `OC-${Date.now().toString().slice(-6)}`;
    const updated = suppliers.map(s => s.id === selected.id
      ? {
        ...s,
        orders: [...s.orders, {
          date: todayStr(),
          product: product.name,
          productId: product.id,
          qty,
          unitPrice,
          price,
          invoice,
        }],
      }
      : s);
    setSuppliers(updated);
    setSelected(updated.find(s => s.id === selected.id)!);
    const r = pushMovements(products, movements, [{
      productId: product.id,
      qty,
      type: "ENTRADA_COMPRA",
      note: `Factura ${invoice} · ${selected.name}`,
      ref: invoice,
    }]);
    // Actualiza costo de compra con el precio unitario de la factura
    setProducts(r.products.map(p => p.id === product.id ? { ...p, buyPrice: unitPrice } : p));
    setMovements(r.movements);
    setShowOrder(false);
    setOrder({ productId: "", qty: "", unitPrice: "", invoice: "" });
  };

  const addSupplier = () => {
    if (!newSupp.name) return;
    setSuppliers([...suppliers, { id: Date.now(), name: newSupp.name, phone: newSupp.phone, products: newSupp.products, orders: [] }]);
    setShowNew(false);
    setNewSupp({ name: "", phone: "", products: "" });
  };

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
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
              {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-3">
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
            <Button onClick={confirmOrder}>Confirmar y actualizar inventario</Button>
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
            <Button onClick={addSupplier}>Guardar</Button>
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
    if (p.stock <= 0) return;
    const qty = weightKg || 1;
    updateActive(t => {
      const ex = t.cart.find(i => i.product.id === p.id);
      const cart = ex
        ? t.cart.map(i => i.product.id === p.id ? { ...i, qty: i.qty + qty } : i)
        : [...t.cart, { product: p, qty, weight: weightKg }];
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
    setAmountPaid(payment === "tarjeta" ? String(total) : "");
    setShowCheckout(true);
  };

  const confirmSale = (withPrint: boolean) => {
    if (!canConfirm || !payment || !active) return;
    const code = `VTA-${Date.now().toString().slice(-6)}`;
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

    const stockEntries = cart.map(item => ({
      productId: item.product.id,
      qty: -Math.ceil(item.qty),
      type: "SALIDA_VENTA" as MovementType,
      note: `Venta ${code}`,
      ref: code,
    }));
    const r = pushMovements(products, movements, stockEntries);
    setProducts(r.products);
    setMovements(r.movements);
    if (clientId) {
      const itemsStr = cart.map(i => `${i.product.name} ×${i.qty}`).join(", ");
      const updatedClients = clients.map(c => c.id === clientId
        ? { ...c, totalBought: c.totalBought + total, lastPurchase: "2026-09-15", history: [{ date: "2026-09-15", items: itemsStr, total }, ...c.history] }
        : c);
      setClients(updatedClients);
    }
    setShowCheckout(false);
    setAmountPaid("");
    setLastSale(sale);
    closeTicket(active.id);
  };

  if (lastSale) return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[70vh] gap-5">
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
    <div className="p-6 flex gap-5 h-full">
      {/* Left: search + products */}
      <div className="flex-1 flex flex-col gap-4">
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
              <div key={p.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-50 hover:bg-blue-50 transition">
                <div>
                  <p className="font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{p.code} · Stock: {p.stock}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-blue-700">{fmt(p.sellPrice)}</span>
                  {p.category === "Lácteos" ? (
                    <div className="flex items-center gap-1">
                      <input type="number" placeholder="kg" value={weight} onChange={e => setWeight(e.target.value)}
                        className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center" />
                      <Button size="sm" onClick={() => { addToCart(p, Number(weight) || 1); setWeight(""); }}>+</Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => addToCart(p)} disabled={p.stock <= 0}>
                      {p.stock <= 0 ? "Sin stock" : "Agregar"}
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
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            <option value="">Sin cliente registrado</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Card>
      </div>

      {/* Right: Cart */}
      <div className="w-80 flex flex-col gap-3">
        {/* Ticket tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {tickets.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`group flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition border ${
                t.id === activeId
                  ? "bg-blue-700 text-white border-blue-700"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
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
              : cart.map(item => (
                <div key={item.product.id} className="flex items-center gap-2 py-2.5 border-b border-slate-50 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.product.name}</p>
                    <p className="text-xs text-slate-400">{item.weight ? `${item.qty}kg` : `×${item.qty}`} · {fmt(item.product.sellPrice * item.qty)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateActive(t => ({
                      cart: t.cart.map(i => i.product.id === item.product.id ? { ...i, qty: Math.max(1, i.qty - 1) } : i),
                    }))}
                      className="w-6 h-6 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm flex items-center justify-center">−</button>
                    <span className="text-sm w-5 text-center font-semibold">{item.weight ? item.qty.toFixed(2) : item.qty}</span>
                    <button onClick={() => updateActive(t => ({
                      cart: t.cart.map(i => i.product.id === item.product.id ? { ...i, qty: i.qty + (item.weight ? 0.1 : 1) } : i),
                    }))}
                      className="w-6 h-6 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm flex items-center justify-center">+</button>
                    <button onClick={() => removeFromCart(item.product.id)} className="w-6 h-6 text-red-400 hover:text-red-600 ml-1 opacity-0 group-hover:opacity-100 transition">×</button>
                  </div>
                </div>
              ))}
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

function Integraciones() {
  const [peripherals, setPeripherals] = useState([
    { id: "barcode", label: "Lector de código de barras", icon: "▥", connected: true, port: "USB-HID" },
    { id: "scale", label: "Balanza digital", icon: "⊖", connected: false, port: "COM3" },
    { id: "printer", label: "Impresora de tickets", icon: "⊟", connected: true, port: "192.168.1.50" },
    { id: "drawer", label: "Cajón monedero", icon: "▣", connected: true, port: "RJ11 · vía impresora" },
    { id: "dian", label: "DIAN Facturación Electrónica", icon: "◫", connected: true, port: "API REST" },
  ]);

  const toggle = (id: string) => setPeripherals(prev => prev.map(p => p.id === id ? { ...p, connected: !p.connected } : p));

  return (
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Integraciones</h1>
        <p className="text-slate-500 text-sm">Estado de periféricos y servicios externos</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
              <Button variant={p.connected ? "danger" : "primary"} size="sm" onClick={() => toggle(p.id)}>
                {p.connected ? "Desconectar" : "Conectar"}
              </Button>
              <Button variant="ghost" size="sm">Configurar</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="font-bold text-slate-700 mb-4 text-sm">Configuración de impresora de tickets</h2>
        <div className="grid grid-cols-3 gap-4">
          <Input label="IP / Puerto" defaultValue="192.168.1.50" />
          <Input label="Puerto TCP" defaultValue="9100" />
          <Select label="Ancho de papel"><option>80mm</option><option>58mm</option></Select>
        </div>
        <div className="flex gap-2 mt-4">
          <Button size="sm">Guardar configuración</Button>
          <Button variant="secondary" size="sm">Imprimir prueba</Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-slate-700 mb-4 text-sm">DIAN — Facturación electrónica</h2>
        <div className="grid grid-cols-2 gap-4">
          <Input label="NIT empresa" defaultValue="900.123.456-1" />
          <Input label="Software ID" defaultValue="abc123-dian-prod" />
          <Input label="PIN de software" type="password" defaultValue="••••••••" />
          <Select label="Ambiente"><option>Producción</option><option>Habilitación / Pruebas</option></Select>
        </div>
        <div className="mt-4 p-3 bg-emerald-50 rounded-xl flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <p className="text-sm text-emerald-700 font-medium">Conexión activa con servicios DIAN · Último ping: 14:31:02</p>
        </div>
      </Card>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [module, setModule] = useState<Module>("dashboard");
  const [products, setProducts] = useState<Product[]>(initProducts);
  const [categories, setCategories] = useState<Category[]>(initCategories);
  const [movements, setMovements] = useState<InventoryMovement[]>(initMovements);
  const [clients, setClients] = useState<Client[]>(initClients);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initSuppliers);

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <Sidebar active={module} onNav={setModule} />
      <main className="flex-1 overflow-auto bg-[#F0F4FF]">
        {module === "dashboard" && <Dashboard products={products} />}
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
      </main>
    </div>
  );
}
