import { useState, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Module = "dashboard" | "productos" | "clientes" | "proveedores" | "ventas" | "integraciones";

interface Product {
  id: number; code: string; name: string; category: string;
  buyPrice: number; sellPrice: number; stock: number;
}

interface Client {
  id: number; name: string; phone: string; email: string;
  totalBought: number; lastPurchase: string;
  history: { date: string; items: string; total: number }[];
}

interface Supplier {
  id: number; name: string; phone: string; products: string;
  orders: { date: string; product: string; qty: number; price: number }[];
}

interface CartItem {
  product: Product; qty: number; weight?: number;
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
  { id: 1, name: "María López", phone: "3114567890", email: "maria@gmail.com", totalBought: 145000, lastPurchase: "2026-09-14",
    history: [{ date: "2026-09-14", items: "Café × 2, Brownie × 1", total: 10000 }, { date: "2026-09-12", items: "Sándwich × 1, Agua × 2", total: 9600 }] },
  { id: 2, name: "Carlos Ruiz", phone: "3009876543", email: "c.ruiz@outlook.com", totalBought: 98000, lastPurchase: "2026-09-13",
    history: [{ date: "2026-09-13", items: "Café × 3, Té × 1", total: 13300 }] },
  { id: 3, name: "Luisa Fernández", phone: "3201112233", email: "luisaf@yahoo.com", totalBought: 220000, lastPurchase: "2026-09-15",
    history: [{ date: "2026-09-15", items: "Queso 0.5kg, Empanada × 2", total: 19000 }] },
  { id: 4, name: "Andrés Moreno", phone: "3158889900", email: "andres.m@empresa.co", totalBought: 67000, lastPurchase: "2026-09-10",
    history: [{ date: "2026-09-10", items: "Agua × 5, Brownie × 2", total: 15000 }] },
];

const initSuppliers: Supplier[] = [
  { id: 1, name: "Café del Norte SAS", phone: "6014441122", products: "Café, Té",
    orders: [{ date: "2026-09-01", product: "Café Americano", qty: 50, price: 60000 }] },
  { id: 2, name: "Pan y Más Ltda.", phone: "6025556677", products: "Panadería, Empanadas",
    orders: [{ date: "2026-09-05", product: "Brownie", qty: 30, price: 30000 }] },
  { id: 3, name: "Lácteos El Campo", phone: "3206667788", products: "Queso, Mantequilla",
    orders: [] },
];

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

function Select({ label, children, ...props }: { label?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1">
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

function Productos({ products, setProducts }: { products: Product[]; setProducts: (p: Product[]) => void }) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Todas");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", category: "", buyPrice: "", sellPrice: "", stock: "" });

  const categories = ["Todas", ...Array.from(new Set(products.map(p => p.category)))];
  const filtered = products.filter(p =>
    (catFilter === "Todas" || p.category === catFilter) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search))
  );

  const addProduct = () => {
    if (!form.name || !form.code) return;
    const np: Product = {
      id: Date.now(), code: form.code, name: form.name, category: form.category || "Sin categoría",
      buyPrice: Number(form.buyPrice), sellPrice: Number(form.sellPrice), stock: Number(form.stock),
    };
    setProducts([...products, np]);
    setShowModal(false);
    setForm({ code: "", name: "", category: "", buyPrice: "", sellPrice: "", stock: "" });
  };

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Productos</h1>
          <p className="text-slate-500 text-sm">{products.length} productos registrados</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Agregar producto</Button>
      </div>

      <div className="flex gap-3">
        <Input placeholder="Buscar por nombre o código..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
        <Select value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          {categories.map(c => <option key={c}>{c}</option>)}
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
                  <button className="text-xs text-blue-600 hover:underline">Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center text-slate-400 py-12 text-sm">Sin resultados</p>}
      </Card>

      {showModal && (
        <Modal title="Agregar producto" onClose={() => setShowModal(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre del producto" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="col-span-2" />
            <Input label="Código de barras" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
            <Input label="Categoría" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            <Input label="Precio de compra (COP)" type="number" value={form.buyPrice} onChange={e => setForm({ ...form, buyPrice: e.target.value })} />
            <Input label="Precio de venta (COP)" type="number" value={form.sellPrice} onChange={e => setForm({ ...form, sellPrice: e.target.value })} />
            <Input label="Stock inicial" type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="col-span-2" />
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={addProduct}>Guardar producto</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Clients ─────────────────────────────────────────────────────────────────

function Clientes({ clients, setClients }: { clients: Client[]; setClients: (c: Client[]) => void }) {
  const [detail, setDetail] = useState<Client | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [search, setSearch] = useState("");

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const addClient = () => {
    if (!form.name) return;
    const nc: Client = { id: Date.now(), name: form.name, phone: form.phone, email: form.email, totalBought: 0, lastPurchase: "—", history: [] };
    setClients([...clients, nc]);
    setShowModal(false);
    setForm({ name: "", phone: "", email: "" });
  };

  if (detail) return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>← Volver</Button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{detail.name}</h1>
          <p className="text-slate-500 text-sm">{detail.phone} · {detail.email}</p>
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
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 border-b border-slate-100">
            {["Nombre", "Teléfono", "Email", "Total comprado", "Última compra", ""].map(h =>
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>)}
          </tr></thead>
          <tbody>{filtered.map(c => (
            <tr key={c.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition">
              <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.phone}</td>
              <td className="px-4 py-3 text-slate-500">{c.email}</td>
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

function Proveedores({ suppliers, setSuppliers, setProducts, products }: {
  suppliers: Supplier[]; setSuppliers: (s: Supplier[]) => void;
  products: Product[]; setProducts: (p: Product[]) => void;
}) {
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [showOrder, setShowOrder] = useState(false);
  const [order, setOrder] = useState({ product: "", qty: "", price: "" });
  const [showNew, setShowNew] = useState(false);
  const [newSupp, setNewSupp] = useState({ name: "", phone: "", products: "" });

  const confirmOrder = () => {
    if (!selected || !order.product || !order.qty) return;
    const updated = suppliers.map(s => s.id === selected.id
      ? { ...s, orders: [...s.orders, { date: "2026-09-15", product: order.product, qty: Number(order.qty), price: Number(order.price) }] }
      : s);
    setSuppliers(updated);
    setSelected(updated.find(s => s.id === selected.id)!);
    // Update stock
    const updatedProducts = products.map(p =>
      p.name.toLowerCase().includes(order.product.toLowerCase()) ? { ...p, stock: p.stock + Number(order.qty) } : p
    );
    setProducts(updatedProducts);
    setShowOrder(false);
    setOrder({ product: "", qty: "", price: "" });
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

      <div className="grid grid-cols-2 gap-5">
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
                  <thead><tr className="bg-slate-50"><th className="px-3 py-2 text-left text-xs text-slate-500">Fecha</th><th className="px-3 py-2 text-left text-xs text-slate-500">Producto</th><th className="px-3 py-2 text-center text-xs text-slate-500">Cant.</th><th className="px-3 py-2 text-right text-xs text-slate-500">Precio</th></tr></thead>
                  <tbody>
                    {selected.orders.map((o, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="px-3 py-2.5 text-slate-500 text-xs">{o.date}</td>
                        <td className="px-3 py-2.5 text-slate-700">{o.product}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-slate-700">{o.qty}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{fmt(o.price)}</td>
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
        <Modal title={`Nueva orden — ${selected.name}`} onClose={() => setShowOrder(false)}>
          <div className="flex flex-col gap-3">
            <Input label="Producto" placeholder="Nombre del producto comprado" value={order.product} onChange={e => setOrder({ ...order, product: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Cantidad" type="number" value={order.qty} onChange={e => setOrder({ ...order, qty: e.target.value })} />
              <Input label="Precio total (COP)" type="number" value={order.price} onChange={e => setOrder({ ...order, price: e.target.value })} />
            </div>
            <div className="bg-blue-50 text-blue-700 rounded-lg px-3 py-2 text-xs">
              Al confirmar, se sumará la cantidad al stock del producto coincidente.
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="ghost" onClick={() => setShowOrder(false)}>Cancelar</Button>
            <Button onClick={confirmOrder}>Confirmar orden</Button>
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

function Ventas({ products, setProducts, clients, setClients }: {
  products: Product[]; setProducts: (p: Product[]) => void;
  clients: Client[]; setClients: (c: Client[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<"efectivo" | "tarjeta" | null>(null);
  const [clientId, setClientId] = useState<number | null>(null);
  const [weight, setWeight] = useState("");
  const [showTicket, setShowTicket] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const filtered = search.length > 1
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.code === search)
    : [];

  const addToCart = (p: Product, weightKg?: number) => {
    if (p.stock <= 0) return;
    const qty = weightKg || 1;
    setCart(prev => {
      const ex = prev.find(i => i.product.id === p.id);
      if (ex) return prev.map(i => i.product.id === p.id ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { product: p, qty, weight: weightKg }];
    });
    setSearch("");
  };

  const removeFromCart = (id: number) => setCart(prev => prev.filter(i => i.product.id !== id));
  const total = cart.reduce((s, i) => s + i.product.sellPrice * i.qty, 0);

  const confirmSale = () => {
    if (!payment || cart.length === 0) return;
    // Deduct stock
    const updatedProducts = products.map(p => {
      const item = cart.find(i => i.product.id === p.id);
      return item ? { ...p, stock: Math.max(0, p.stock - Math.ceil(item.qty)) } : p;
    });
    setProducts(updatedProducts);
    // Update client history
    if (clientId) {
      const itemsStr = cart.map(i => `${i.product.name} ×${i.qty}`).join(", ");
      const updatedClients = clients.map(c => c.id === clientId
        ? { ...c, totalBought: c.totalBought + total, lastPurchase: "2026-09-15", history: [{ date: "2026-09-15", items: itemsStr, total }, ...c.history] }
        : c);
      setClients(updatedClients);
    }
    setShowTicket(true);
    setCart([]);
    setPayment(null);
    setClientId(null);
  };

  if (showTicket) return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[70vh] gap-5">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">Venta confirmada</h2>
        <p className="text-slate-500 text-sm mb-4">Ticket #VTA-{Date.now().toString().slice(-6)}</p>
        <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 mb-4">Tienda Central · 2026-09-15 · 14:32</div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShowTicket(false)}>Nueva venta</Button>
          <Button size="sm" className="flex-1" onClick={() => { window.print(); }}>Imprimir ticket</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 flex gap-5 h-full">
      {/* Left: search + products */}
      <div className="flex-1 flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Punto de Venta</h1>
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
          <select value={clientId ?? ""} onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            <option value="">Sin cliente registrado</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Card>
      </div>

      {/* Right: Cart */}
      <div className="w-80 flex flex-col gap-3">
        <Card className="p-4 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800">Carrito</h2>
            {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600">Vaciar</button>}
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
                    <button onClick={() => setCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, qty: Math.max(1, i.qty - 1) } : i))}
                      className="w-6 h-6 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm flex items-center justify-center">−</button>
                    <span className="text-sm w-5 text-center font-semibold">{item.weight ? item.qty.toFixed(2) : item.qty}</span>
                    <button onClick={() => setCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, qty: i.qty + (item.weight ? 0.1 : 1) } : i))}
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
                <button key={m} onClick={() => setPayment(m)}
                  className={`py-2.5 rounded-xl text-sm font-semibold capitalize transition border-2 ${payment === m ? "border-blue-600 bg-blue-700 text-white" : "border-slate-200 text-slate-600 hover:border-blue-400"}`}>
                  {m === "efectivo" ? "💵 Efectivo" : "💳 Tarjeta"}
                </button>
              ))}
            </div>

            <Button onClick={confirmSale} disabled={cart.length === 0 || !payment} className="w-full" size="lg">
              Confirmar venta
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────

function Integraciones() {
  const [peripherals, setPeripherals] = useState([
    { id: "barcode", label: "Lector de código de barras", icon: "▥", connected: true, port: "USB-HID" },
    { id: "scale", label: "Balanza digital", icon: "⊖", connected: false, port: "COM3" },
    { id: "printer", label: "Impresora de tickets", icon: "⊟", connected: true, port: "192.168.1.50" },
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
  const [clients, setClients] = useState<Client[]>(initClients);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initSuppliers);

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <Sidebar active={module} onNav={setModule} />
      <main className="flex-1 overflow-auto bg-[#F0F4FF]">
        {module === "dashboard" && <Dashboard products={products} />}
        {module === "productos" && <Productos products={products} setProducts={setProducts} />}
        {module === "clientes" && <Clientes clients={clients} setClients={setClients} />}
        {module === "proveedores" && <Proveedores suppliers={suppliers} setSuppliers={setSuppliers} products={products} setProducts={setProducts} />}
        {module === "ventas" && <Ventas products={products} setProducts={setProducts} clients={clients} setClients={setClients} />}
        {module === "integraciones" && <Integraciones />}
      </main>
    </div>
  );
}
