import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { ThemeToggle } from "./components/ThemeToggle";
import { api, ApiError } from "./lib/api";
import { fmt } from "./lib/money";
import { BUSINESS_ROLES, modulesForRole, restoreSession, roleLabel, signOut, type UserRole } from "./lib/auth";
import {
  bindProductSettings,
  normalizeProduct,
  normalizeProducts,
  saveProductSaleSettings,
  type SaleMode,
} from "./lib/productSettings";
import { Badge, Button, Card, Input, Modal, PageHeader, ScreenFallback, Select } from "./ui";
import type { DashboardStats } from "./features/dashboard/Dashboard";

const Dashboard = lazy(() => import("./features/dashboard/Dashboard"));
const CierreCaja = lazy(() => import("./components/CierreCaja").then((module) => ({ default: module.CierreCaja })));
const Creditos = lazy(() => import("./components/Creditos").then((module) => ({ default: module.Creditos })));

// ─── Types ────────────────────────────────────────────────────────────────────

type Module = "dashboard" | "productos" | "inventario" | "clientes" | "proveedores" | "ventas" | "cierre" | "creditos" | "integraciones" | "usuarios";
type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "credito" | "mixto";

type MovementType = "ENTRADA_COMPRA" | "SALIDA_VENTA" | "AJUSTE" | "ENTRADA_INICIAL" | "IMPORTACION" | "ENTRADA_DEVOLUCION";
type SaleStatus = "completed" | "partially_cancelled" | "cancelled";

interface DaySaleItem {
  id: number;
  productId: number | null;
  productName: string;
  qty: number;
  cancelledQty: number;
  activeQty: number;
  weight: number | null;
  unitPrice: number;
  lineTotal: number;
}

interface DaySale {
  id: number;
  ticket: string;
  clientId: number | null;
  clientName: string | null;
  payment: string;
  total: number;
  status: SaleStatus;
  soldAt: string;
  items: DaySaleItem[];
  refunded?: number;
}

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
  payment: PaymentMethod | null;
  clientId: number | null;
}

interface PaymentAmounts {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  credito: number;
}

interface SaleTicket {
  ticket: string;
  soldAt: string;
  store: string;
}

interface TicketTemplate {
  storeName: string;
  nitLine: string;
  footer: string;
  showDate: boolean;
  showClient: boolean;
  showPayment: boolean;
  showChange: boolean;
  showReprint: boolean;
  extraHeader: string;
}

interface IntegrationsState {
  peripherals: { id: string; label: string; connected: boolean; port: string }[];
  printer: { host: string; tcpPort: number; paperWidth: string };
  ticket?: TicketTemplate;
  dian: { nit: string; softwareId: string; softwarePin: string; environment: string };
}

const DEFAULT_TICKET: TicketTemplate = {
  storeName: "Mi negocio",
  nitLine: "",
  footer: "¡Gracias por su compra!",
  showDate: true,
  showClient: true,
  showPayment: true,
  showChange: true,
  showReprint: true,
  extraHeader: "",
};

let ticketCacheOwner = "";

function ticketCacheKey(email = ticketCacheOwner): string {
  const owner = email.trim().toLowerCase();
  return owner ? `pos.ticketTemplate:${owner}` : "pos.ticketTemplate";
}

function bindTicketCache(email: string) {
  ticketCacheOwner = email.trim().toLowerCase();
}

function readTicketTemplate(): TicketTemplate {
  try {
    const raw = localStorage.getItem(ticketCacheKey());
    if (!raw) return { ...DEFAULT_TICKET };
    return { ...DEFAULT_TICKET, ...(JSON.parse(raw) as Partial<TicketTemplate>) };
  } catch {
    return { ...DEFAULT_TICKET };
  }
}

function writeTicketTemplate(ticket: TicketTemplate) {
  if (!ticketCacheOwner) return;
  localStorage.setItem(ticketCacheKey(), JSON.stringify(ticket));
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

const todayStr = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const movementLabel: Record<MovementType, string> = {
  ENTRADA_COMPRA: "Entrada compra",
  SALIDA_VENTA: "Salida venta",
  AJUSTE: "Ajuste",
  ENTRADA_INICIAL: "Entrada inicial",
  IMPORTACION: "Importación",
  ENTRADA_DEVOLUCION: "Devolución",
};

const saleStatusLabel: Record<SaleStatus, string> = {
  completed: "Completada",
  partially_cancelled: "Parcial",
  cancelled: "Cancelada",
};

const paymentLabel: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  credito: "Crédito",
  mixto: "Mixto",
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
  payment: PaymentMethod | string;
  clientName?: string;
  printed: boolean;
  soldAt?: string;
  reprint?: boolean;
};

function daySaleToReceipt(sale: DaySale): SaleReceipt {
  const items = sale.items.map(item => ({
    name: item.productName,
    qty: item.qty,
    weight: item.weight ?? undefined,
    lineTotal: item.lineTotal,
  }));
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return {
    code: sale.ticket,
    items,
    total,
    paid: total,
    change: 0,
    payment: sale.payment,
    clientName: sale.clientName ?? undefined,
    printed: true,
    soldAt: sale.soldAt,
    reprint: true,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Imprime el ticket térmico / de caja sin encabezados del navegador. */
function printSaleTicket(sale: SaleReceipt) {
  const tpl = readTicketTemplate();
  const rows = sale.items
    .map(i => {
      const qty = i.weight != null ? `${i.qty}kg` : `x${i.qty}`;
      return `<tr><td>${escapeHtml(i.name)}<br/><span style="color:#555">${qty}</span></td><td style="text-align:right">${fmt(i.lineTotal)}</td></tr>`;
    })
    .join("");
  const when = sale.soldAt
    ? new Date(sale.soldAt).toLocaleString("es-CO")
    : new Date().toLocaleString("es-CO");
  const paymentText = paymentLabel[sale.payment as PaymentMethod] ?? String(sale.payment);
  const extra = (tpl.extraHeader || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join("");
  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>\u200B</title>
    <style>
      @page{margin:0mm;size:80mm auto}
      html,body{margin:0;padding:0;background:#fff}
      @media print{
        html,body{margin:0!important;padding:0!important;background:#fff}
        .ticket{margin:0;padding:6px 8px}
      }
      body{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .ticket{width:72mm;max-width:100%;margin:0;padding:8px}
      h1{font-size:14px;text-align:center;margin:0 0 4px}
      p{margin:2px 0;text-align:center}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      td{padding:4px 0;vertical-align:top}
      .line{border-top:1px dashed #000;margin:8px 0}
      .tot{font-weight:700;font-size:13px}
    </style></head><body>
    <div class="ticket">
    <h1>${escapeHtml(tpl.storeName)}</h1>
    ${tpl.nitLine ? `<p>${escapeHtml(tpl.nitLine)}</p>` : ""}
    ${extra}
    <p>Ticket #${escapeHtml(sale.code)}</p>
    ${sale.reprint && tpl.showReprint ? "<p><strong>REIMPRESIÓN</strong></p>" : ""}
    ${tpl.showDate ? `<p>${escapeHtml(when)}</p>` : ""}
    ${tpl.showClient && sale.clientName ? `<p>Cliente: ${escapeHtml(sale.clientName)}</p>` : ""}
    <div class="line"></div>
    <table>${rows}</table>
    <div class="line"></div>
    <table>
      <tr class="tot"><td>TOTAL</td><td style="text-align:right">${fmt(sale.total)}</td></tr>
      ${tpl.showPayment ? `<tr><td>Pago (${escapeHtml(paymentText)})</td><td style="text-align:right">${fmt(sale.paid)}</td></tr>` : ""}
      ${tpl.showChange ? `<tr><td>Cambio</td><td style="text-align:right">${fmt(sale.change)}</td></tr>` : ""}
    </table>
    <div class="line"></div>
    ${tpl.footer ? `<p>${escapeHtml(tpl.footer)}</p>` : ""}
    </div>
    </body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    const popup = window.open("", "_blank", "noopener,noreferrer,width=320,height=600");
    if (!popup) return;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.document.title = "\u200B";
    popup.focus();
    popup.print();
    setTimeout(() => popup.close(), 400);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  doc.title = "\u200B";
  const cleanup = () => {
    setTimeout(() => frame.remove(), 800);
  };
  win.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(() => {
    win.focus();
    win.print();
    cleanup();
  }, 50);
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const navItems: { id: Module; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "productos", label: "Productos" },
  { id: "inventario", label: "Inventario" },
  { id: "clientes", label: "Clientes" },
  { id: "proveedores", label: "Proveedores" },
  { id: "ventas", label: "Punto de Venta" },
  { id: "cierre", label: "Cierre de caja" },
  { id: "creditos", label: "Ventas a crédito" },
  { id: "usuarios", label: "Usuarios" },
  { id: "integraciones", label: "Configuración" },
];

function NavIcon({ id }: { id: Module }) {
  const common = "size-4";
  const icons: Record<Module, React.ReactNode> = {
    dashboard: <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h7v7H4V5Zm9 0h7v4h-7V5ZM4 14h7v5H4v-5Zm9 6V11h7v9h-7Z" /></svg>,
    productos: <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.5 12 4 3 8.5v7L12 20l9-4.5v-7ZM3 8.5l9 4.5 9-4.5M12 13v7" /></svg>,
    inventario: <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16v12H4V7Zm0 4h16M9 7V5h6v2" /></svg>,
    clientes: <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 20a8 8 0 0 1 16 0" /></svg>,
    proveedores: <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3 17h18M5 17V8l5 3 4-4 5 5v5" /></svg>,
    ventas: <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16l-1.2 9.2A2 2 0 0 1 16.8 18H8.2a2 2 0 0 1-2-1.8L5 7Zm4-3h6" /></svg>,
    cierre: <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M4 10h16v8H4v-8Zm2-4h12v4H6V6Zm6 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" /></svg>,
    creditos: <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16v10H4V7Zm0 3h16M8 15h3" /></svg>,
    integraciones: <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-.5.9 1.6a1.8 1.8 0 0 1-1.9 2.6l-1.8-.5a7 7 0 0 1-1.2.7l-.3 1.9a1.8 1.8 0 0 1-3.5 0l-.3-1.9a7 7 0 0 1-1.2-.7l-1.8.5a1.8 1.8 0 0 1-1.9-2.6l.9-1.6a7 7 0 0 1 0-1.4l-.9-1.6a1.8 1.8 0 0 1 1.9-2.6l1.8.5a7 7 0 0 1 1.2-.7l.3-1.9a1.8 1.8 0 0 1 3.5 0l.3 1.9a7 7 0 0 1 1.2.7l1.8-.5a1.8 1.8 0 0 1 1.9 2.6l-.9 1.6a7 7 0 0 1 0 1.4Z" /></svg>,
    usuarios: <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 13a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0 2c-3 0-5 1.8-5 4v1h10v-1c0-2.2-2-4-5-4Zm8 0c-.7 0-1.4.1-2 .4 1.5.9 2.5 2.3 2.5 4v.6H21v-.6c0-2.2-1.8-4.4-5-4.4Z" /></svg>,
  };
  return icons[id];
}

function Sidebar({ active, onNav, email, onLogout, open, collapsed, onToggle, items }: {
  active: Module; onNav: (m: Module) => void; email: string; onLogout: () => void;
  open: boolean; collapsed: boolean; onToggle: () => void; items: typeof navItems;
}) {
  return (
    <aside className={`mesh-navy group/sidebar fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shrink-0 select-none text-white transition-[width,translate] duration-300 lg:static lg:z-auto lg:min-h-dvh lg:self-stretch lg:max-w-none ${open ? "" : "drawer-closed"} ${collapsed ? "lg:w-[4.75rem]" : "lg:w-[17.5rem]"}`}>
      <div className="relative flex h-dvh flex-col overflow-hidden lg:sticky lg:top-0">
      <span className="aurora-orb top-8 -right-10 size-40 bg-cyan-400/30" />
      <span className="aurora-orb bottom-24 -left-12 size-44 bg-brand-500/40" style={{ animationDelay: "1.4s" }} />
      <div className={`relative border-b border-white/10 px-4 py-5 ${collapsed ? "lg:px-2 lg:py-4" : ""}`}>
        <div className={`flex items-center justify-between gap-2 ${collapsed ? "lg:flex-col" : ""}`}>
          <div className="flex min-w-0 items-center gap-3">
            <img src="/brand/promethixia-mark.svg" alt="" width={42} height={42} className="size-10 shrink-0 drop-shadow-[0_8px_18px_rgba(34,211,238,0.35)]" />
            <div className={collapsed ? "lg:hidden" : ""}>
              <p className="font-display text-sm font-bold leading-tight">Promethixia</p>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">Punto de venta</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="hidden size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-brand-700 text-white transition hover:bg-brand-600 hover:text-white active:bg-brand-800 active:text-white lg:grid"
            aria-label={collapsed ? "Mostrar menú" : "Ocultar menú"}
            aria-expanded={!collapsed}
            title={collapsed ? "Mostrar menú" : "Ocultar menú"}
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              {collapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />}
            </svg>
          </button>
        </div>
      </div>
      <nav className={`relative z-10 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3 ${collapsed ? "lg:px-2" : ""}`}>
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onNav(item.id)}
            title={item.label}
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold transition duration-200
              ${collapsed ? "lg:justify-center lg:gap-0 lg:px-0" : ""}
              ${active === item.id
                ? "bg-white text-navy-900 shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
                : "text-white hover:bg-brand-600 hover:text-white active:bg-brand-700 active:text-white"
              }`}
          >
            <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${active === item.id ? "bg-brand-100 text-brand-700" : "bg-brand-800 text-white"}`}>
              <NavIcon id={item.id} />
            </span>
            <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className={`relative z-10 mt-auto flex shrink-0 flex-col gap-3 px-4 pb-5 pt-2 ${collapsed ? "lg:items-center lg:px-2" : ""}`}>
        <div className={collapsed ? "lg:grid lg:place-items-center" : ""}>
          <span className={collapsed ? "hidden lg:inline-flex" : "hidden"}>
            <ThemeToggle compact tone="navy" />
          </span>
          <div className={collapsed ? "lg:hidden" : ""}>
            <ThemeToggle tone="navy" />
          </div>
        </div>
        <div className={`rounded-2xl border border-white/15 bg-white/8 p-3 text-xs text-blue-100 backdrop-blur-md ${collapsed ? "lg:grid lg:size-10 lg:place-items-center lg:p-0" : ""}`} title={email}>
          {collapsed ? (
            <span className="hidden text-sm font-bold text-white lg:inline">{email.slice(0, 1).toUpperCase()}</span>
          ) : null}
          <div className={collapsed ? "lg:hidden" : ""}>
            <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Sesión</p>
            <p className="truncate font-semibold text-white">{email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Cerrar sesión"
          className={`w-full rounded-2xl border border-white/15 bg-brand-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 hover:text-white active:bg-brand-700 active:text-white ${collapsed ? "lg:grid lg:size-10 lg:place-items-center lg:px-0 lg:py-0" : ""}`}
        >
          <svg className={`size-4 shrink-0 ${collapsed ? "hidden lg:block" : "hidden"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H4m11 0-3-3m3 3-3 3M10 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7" />
          </svg>
          <span className={collapsed ? "lg:hidden" : ""}>Cerrar sesión</span>
        </button>
      </div>
      </div>
    </aside>
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
    const body = {
      code: form.code,
      name: form.name,
      category: form.category || "Sin categoría",
      buyPrice: Number(form.buyPrice) || 0,
      sellPrice: Number(form.sellPrice) || 0,
      saleMode,
      tracksInventory,
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
            body: JSON.stringify({ code, name, category, buyPrice, sellPrice, saleMode, tracksInventory }),
          });
          updated++;
        } else {
          await api<Product>("/products", {
            method: "POST",
            body: JSON.stringify({
              code, name, category, buyPrice, sellPrice, stock,
              saleMode, tracksInventory,
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
      <PageHeader
        title="Productos"
        subtitle={`${products.length} productos · ${categories.length} categorías`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => setShowCats(true)}>Categorías</Button>
            <Button variant="secondary" onClick={() => importRef.current?.click()}>Importar CSV</Button>
            <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />
            <Button onClick={openCreate}>+ Agregar producto</Button>
          </div>
        }
      />

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
                  <button onClick={() => openEdit(p)} className="text-xs font-semibold text-brand-600 hover:underline">Editar</button>
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
      <PageHeader
        title="Inventario"
        subtitle={`${inventoried.length} con inventario · ${movements.length} movimientos`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={exportGeneral}>Exportar inventario</Button>
            <Button variant="secondary" size="sm" onClick={exportMovements}>Exportar movimientos</Button>
          </div>
        }
      />

      <div className="flex w-full flex-wrap gap-1 rounded-2xl border border-slate-200 bg-[var(--surface)] p-1 shadow-card sm:w-fit">
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
                  <td className="px-3 py-2.5"><Badge color={m.qty >= 0 ? "green" : "red"}>{movementLabel[m.type] ?? m.type}</Badge></td>
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
          <h1 className="text-xl font-bold tracking-tight text-navy-900">{detail.name}</h1>
          <p className="text-slate-500 text-sm">{detail.phone} · {detail.email}</p>
          <p className="text-slate-500 text-sm">{detail.address || "Sin dirección"} · Cédula {detail.idNumber || "—"} · Nacimiento {detail.birthDate || "—"}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Total comprado</p><p className="font-display text-xl font-extrabold text-brand-700">{fmt(detail.totalBought)}</p></Card>
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
      <PageHeader title="Clientes" subtitle={`${clients.length} clientes`} actions={<Button onClick={() => setShowModal(true)}>+ Agregar cliente</Button>} />
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
      <PageHeader title="Proveedores" subtitle={`${suppliers.length} proveedores`} actions={<Button onClick={() => setShowNew(true)}>+ Agregar proveedor</Button>} />

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

function Ventas({ products, setProducts, clients, setClients, movements, setMovements, onConfigureTicket }: {
  products: Product[]; setProducts: (p: Product[]) => void;
  clients: Client[]; setClients: (c: Client[]) => void;
  movements: InventoryMovement[]; setMovements: (m: InventoryMovement[]) => void;
  onConfigureTicket?: () => void;
}) {
  const [tickets, setTickets] = useState<PosTicket[]>(() => [createTicket(1)]);
  const [activeId, setActiveId] = useState(tickets[0].id);
  const [search, setSearch] = useState("");
  const [weight, setWeight] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");
  const [lastSale, setLastSale] = useState<SaleReceipt | null>(null);
  const [saleError, setSaleError] = useState("");
  const [showDaySales, setShowDaySales] = useState(false);
  const [salesDate, setSalesDate] = useState(todayStr());
  const [daySales, setDaySales] = useState<DaySale[]>([]);
  const [daySalesLoading, setDaySalesLoading] = useState(false);
  const [daySalesError, setDaySalesError] = useState("");
  const [selectedSale, setSelectedSale] = useState<DaySale | null>(null);
  const [returnQty, setReturnQty] = useState<Record<number, string>>({});
  const [returnReason, setReturnReason] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);
  const [mixAmounts, setMixAmounts] = useState({ efectivo: "", tarjeta: "", transferencia: "", credito: "" });
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const active = tickets.find(t => t.id === activeId) ?? tickets[0];
  const cart = active?.cart ?? [];
  const payment = active?.payment ?? null;
  const clientId = active?.clientId ?? null;

  useEffect(() => {
    api<{ id: number } | null>("/shifts/current")
      .then(shift => setShiftOpen(!!shift))
      .catch(() => setShiftOpen(false));
  }, []);

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
  const mixTotal = ["efectivo", "tarjeta", "transferencia", "credito"].reduce(
    (sum, key) => sum + (Number(mixAmounts[key as keyof typeof mixAmounts]) || 0),
    0,
  );
  const creditNeedsClient = payment === "credito" || (payment === "mixto" && (Number(mixAmounts.credito) || 0) > 0);
  const paidNum = payment === "efectivo" || payment === "mixto"
    ? Number(amountPaid)
    : total;
  const change = payment === "efectivo" && Number.isFinite(paidNum) ? Math.max(0, paidNum - total) : 0;
  const mixOk = payment !== "mixto" || Math.abs(mixTotal - total) < 0.01;
  const mixCash = Number(mixAmounts.efectivo) || 0;
  const canConfirm =
    !!payment &&
    cart.length > 0 &&
    shiftOpen === true &&
    mixOk &&
    (!creditNeedsClient || !!clientId) &&
    (payment === "efectivo"
      ? Number.isFinite(paidNum) && paidNum >= total && amountPaid !== ""
      : payment === "mixto"
        ? mixCash === 0 || (Number.isFinite(paidNum) && paidNum >= mixCash && amountPaid !== "")
        : true);

  const openCheckout = () => {
    if (!payment || cart.length === 0) return;
    if (shiftOpen === false) {
      setSaleError("Abre un turno en Cierre de caja antes de vender.");
      return;
    }
    if (creditNeedsClient && !clientId) {
      setSaleError("Selecciona un cliente para ventas a crédito.");
      return;
    }
    setSaleError("");
    if (payment === "efectivo") setAmountPaid("");
    else if (payment === "mixto") setAmountPaid(String(Number(mixAmounts.efectivo) || total));
    else setAmountPaid(String(total));
    setShowCheckout(true);
  };

  const buildAmounts = (): PaymentAmounts | undefined => {
    if (!payment) return undefined;
    if (payment === "mixto") {
      return {
        efectivo: Number(mixAmounts.efectivo) || 0,
        tarjeta: Number(mixAmounts.tarjeta) || 0,
        transferencia: Number(mixAmounts.transferencia) || 0,
        credito: Number(mixAmounts.credito) || 0,
      };
    }
    return undefined;
  };

  const loadDaySales = async (date = salesDate) => {
    setDaySalesLoading(true);
    setDaySalesError("");
    try {
      const list = await api<DaySale[]>(`/sales?date=${date}`);
      setDaySales(list);
      setSelectedSale(prev => {
        if (!prev) return null;
        return list.find(sale => sale.id === prev.id) ?? null;
      });
    } catch (err) {
      setDaySalesError(err instanceof ApiError ? err.message : "No pudimos cargar las ventas.");
      setDaySales([]);
    } finally {
      setDaySalesLoading(false);
    }
  };

  const openDaySales = async () => {
    const date = todayStr();
    setSalesDate(date);
    setShowDaySales(true);
    setSelectedSale(null);
    setReturnQty({});
    setReturnReason("");
    setDaySalesError("");
    setDaySalesLoading(true);
    try {
      setDaySales(await api<DaySale[]>(`/sales?date=${date}`));
    } catch (err) {
      setDaySalesError(err instanceof ApiError ? err.message : "No pudimos cargar las ventas.");
      setDaySales([]);
    } finally {
      setDaySalesLoading(false);
    }
  };

  const refreshAfterReturn = async (updated: DaySale) => {
    setSelectedSale(updated);
    setReturnQty({});
    setReturnReason("");
    setProducts(normalizeProducts(await api<Product[]>("/products")));
    setClients(await api<Client[]>("/clients"));
    setMovements(await api<InventoryMovement[]>("/inventory/movements"));
    await loadDaySales(salesDate);
  };

  const cancelWholeSale = async (sale: DaySale) => {
    if (sale.status === "cancelled") return;
    if (!window.confirm(`¿Cancelar por completo la venta ${sale.ticket}? Se devolverá el inventario.`)) return;
    setReturnBusy(true);
    setDaySalesError("");
    try {
      const updated = await api<DaySale>(`/sales/${sale.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: returnReason || "Cancelación total" }),
      });
      await refreshAfterReturn(updated);
    } catch (err) {
      setDaySalesError(err instanceof ApiError ? err.message : "No pudimos cancelar la venta.");
    } finally {
      setReturnBusy(false);
    }
  };

  const returnSelectedItems = async (sale: DaySale) => {
    const items = sale.items
      .map(item => ({ itemId: item.id, qty: Number(returnQty[item.id] || 0) }))
      .filter(entry => entry.qty > 0);
    if (items.length === 0) {
      setDaySalesError("Indica la cantidad a devolver en al menos un producto.");
      return;
    }
    setReturnBusy(true);
    setDaySalesError("");
    try {
      const updated = await api<DaySale>(`/sales/${sale.id}/returns`, {
        method: "POST",
        body: JSON.stringify({
          items,
          reason: returnReason || "Devolución / cambio",
        }),
      });
      await refreshAfterReturn(updated);
    } catch (err) {
      setDaySalesError(err instanceof ApiError ? err.message : "No pudimos registrar la devolución.");
    } finally {
      setReturnBusy(false);
    }
  };

  const confirmSale = async (withPrint: boolean) => {
    if (!canConfirm || !payment || !active) return;
    setSaleError("");
    try {
      const amounts = buildAmounts();
      const saved = await api<SaleTicket>("/sales", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          payment,
          ...(amounts ? { amounts } : {}),
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
      if (payment === "efectivo" || (payment === "mixto" && (amounts?.efectivo || 0) > 0)) openCashDrawer();
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
        <PageHeader
          title="Punto de Venta"
          subtitle="Busca, escanea y cobra en segundos"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {onConfigureTicket ? (
                <Button variant="secondary" size="sm" onClick={onConfigureTicket}>
                  Configurar ticket
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => { void openDaySales(); }}>
                Ventas del día
              </Button>
              <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                {tickets.length} ticket{tickets.length === 1 ? "" : "s"} abierto{tickets.length === 1 ? "" : "s"}
              </span>
            </div>
          }
        />
        {/* Barcode / search */}
        <div className="relative">
          <input
            ref={barcodeRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto o escanear código de barras..."
            className="w-full rounded-2xl border-2 border-brand-200 bg-white/90 px-5 py-4 text-base font-medium shadow-card outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
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
                  <span className="font-display font-bold text-brand-700">
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 text-lg font-semibold text-slate-500 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
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
              <span className="font-display text-xl font-extrabold text-brand-700">{fmt(total)}</span>
            </div>

            {/* Payment method */}
            <p className="text-xs font-semibold text-slate-500 mb-2">Método de pago</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(["efectivo", "tarjeta", "transferencia", "credito", "mixto"] as PaymentMethod[]).map(m => (
                <button key={m} onClick={() => updateActive({ payment: m })}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-colors border-2 ${payment === m ? "border-brand-700 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand-400 hover:bg-brand-50 hover:text-navy-900 active:bg-brand-100"}`}>
                  {paymentLabel[m]}
                </button>
              ))}
            </div>

            {payment === "mixto" && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {(["efectivo", "tarjeta", "transferencia", "credito"] as const).map(key => (
                  <label key={key} className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-slate-600">{paymentLabel[key]}</span>
                    <input
                      type="number"
                      min="0"
                      value={mixAmounts[key]}
                      onChange={e => setMixAmounts(prev => ({ ...prev, [key]: e.target.value }))}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                    />
                  </label>
                ))}
                <p className={`col-span-2 text-xs ${mixOk ? "text-emerald-600" : "text-red-600"}`}>
                  Suma {fmt(mixTotal)} / Total {fmt(total)}
                </p>
              </div>
            )}

            {shiftOpen === false && (
              <p className="mb-2 text-xs text-amber-700">Abre un turno en Cierre de caja para poder cobrar.</p>
            )}
            {saleError && <p className="mb-2 text-xs text-red-600">{saleError}</p>}
            <Button onClick={openCheckout} disabled={cart.length === 0 || !payment || shiftOpen === false} className="w-full" size="lg">
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
                <span className="font-semibold text-slate-800">{payment ? paymentLabel[payment] : "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Total a pagar</span>
                <span className="font-display text-2xl font-extrabold text-brand-700">{fmt(total)}</span>
              </div>
            </div>

            {(payment === "efectivo" || payment === "mixto") && (
              <Input
                label={payment === "mixto" ? "¿Con cuánto paga en efectivo? (COP)" : "¿Con cuánto paga? (COP)"}
                type="number"
                min={payment === "mixto" ? (Number(mixAmounts.efectivo) || 0) : total}
                step="100"
                value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                placeholder={String(payment === "mixto" ? (Number(mixAmounts.efectivo) || 0) : total)}
                autoFocus
              />
            )}

            {payment === "efectivo" && (
              <div className={`rounded-xl px-4 py-3 flex justify-between items-center ${
                canConfirm ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"
              }`}>
                <span className="text-sm font-medium">Cambio</span>
                <span className="text-xl font-bold">{canConfirm ? fmt(change) : "—"}</span>
              </div>
            )}

            {payment === "efectivo" && amountPaid !== "" && paidNum < total && (
              <p className="text-xs text-red-600">El monto pagado debe ser mayor o igual al total.</p>
            )}
            {payment === "credito" && (
              <p className="text-xs text-amber-700">Esta venta quedará como crédito del cliente seleccionado.</p>
            )}
            {saleError && <p className="text-xs text-red-600">{saleError}</p>}

            <p className="text-xs text-slate-400">
              Al confirmar se abrirá el cajón monedero cuando haya pago en efectivo.
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

      {showDaySales && (
        <Modal title="Ventas del día" onClose={() => setShowDaySales(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label="Fecha"
                type="date"
                value={salesDate}
                onChange={e => setSalesDate(e.target.value)}
                className="w-full sm:w-auto"
              />
              <Button
                variant="secondary"
                onClick={() => { void loadDaySales(salesDate); }}
                disabled={daySalesLoading || !salesDate}
              >
                Buscar
              </Button>
            </div>

            {daySalesError && <p className="text-sm text-red-600">{daySalesError}</p>}
            {daySalesLoading && <p className="text-sm text-slate-500">Cargando ventas…</p>}

            {!daySalesLoading && daySales.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                No hay ventas en esta fecha
              </p>
            )}

            {!selectedSale && !daySalesLoading && daySales.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {daySales.length} venta{daySales.length === 1 ? "" : "s"} · Total neto {fmt(daySales.reduce((sum, sale) => sum + sale.total, 0))}
                </p>
                {daySales.map(sale => (
                  <button
                    key={sale.id}
                    type="button"
                    onClick={() => {
                      setSelectedSale(sale);
                      setReturnQty({});
                      setReturnReason("");
                      setDaySalesError("");
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-brand-300 hover:bg-blue-50/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800">{sale.ticket}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(sale.soldAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {paymentLabel[sale.payment as PaymentMethod] ?? sale.payment}
                          {sale.clientName ? ` · ${sale.clientName}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-700">{fmt(sale.total)}</p>
                        <Badge color={sale.status === "cancelled" ? "red" : sale.status === "partially_cancelled" ? "yellow" : "green"}>
                          {saleStatusLabel[sale.status]}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedSale && (
              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => { setSelectedSale(null); setReturnQty({}); setDaySalesError(""); }}
                  className="w-fit text-sm text-blue-600 hover:underline"
                >
                  ← Volver al listado
                </button>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-800">{selectedSale.ticket}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(selectedSale.soldAt).toLocaleString("es-CO")}
                        {" · "}
                        {paymentLabel[selectedSale.payment as PaymentMethod] ?? selectedSale.payment}
                        {selectedSale.clientName ? ` · ${selectedSale.clientName}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-blue-700">{fmt(selectedSale.total)}</p>
                      <Badge color={selectedSale.status === "cancelled" ? "red" : selectedSale.status === "partially_cancelled" ? "yellow" : "green"}>
                        {saleStatusLabel[selectedSale.status]}
                      </Badge>
                    </div>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => printSaleTicket(daySaleToReceipt(selectedSale))}
                >
                  Reimprimir ticket
                </Button>

                {selectedSale.status !== "cancelled" ? (
                  <>
                    <p className="text-sm text-slate-600">
                      Indica cuánto devolver por producto (cambios o devoluciones). El inventario se restaura automáticamente.
                    </p>
                    <div className="flex flex-col gap-3">
                      {selectedSale.items.map(item => {
                        const max = item.activeQty;
                        const disabled = max <= 0;
                        return (
                          <div key={item.id} className={`rounded-xl border px-3 py-3 ${disabled ? "border-slate-100 bg-slate-50 opacity-70" : "border-slate-200"}`}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800">{item.productName}</p>
                                <p className="text-xs text-slate-500">
                                  Vendido {item.qty}{item.weight != null ? " kg" : ""}
                                  {item.cancelledQty > 0 ? ` · Devuelto ${item.cancelledQty}` : ""}
                                  {" · Activo "}{item.activeQty}
                                  {" · "}{fmt(item.lineTotal)}
                                </p>
                              </div>
                              <Input
                                label="Devolver"
                                type="number"
                                min="0"
                                step={item.weight != null ? "0.01" : "1"}
                                max={max}
                                disabled={disabled || returnBusy}
                                value={returnQty[item.id] ?? ""}
                                onChange={e => setReturnQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                                className="w-28"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <Input
                      label="Motivo (opcional)"
                      value={returnReason}
                      onChange={e => setReturnReason(e.target.value)}
                      placeholder="Cambio, devolución, error de cobro…"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        className="flex-1"
                        disabled={returnBusy}
                        onClick={() => { void returnSelectedItems(selectedSale); }}
                      >
                        Devolver seleccionados
                      </Button>
                      <Button
                        variant="secondary"
                        className="flex-1"
                        disabled={returnBusy}
                        onClick={() => { void cancelWholeSale(selectedSale); }}
                      >
                        Cancelar venta completa
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    Esta venta ya está cancelada por completo. El inventario fue restaurado.
                  </p>
                )}
              </div>
            )}
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
  const [ticket, setTicket] = useState<TicketTemplate>(readTicketTemplate);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api<IntegrationsState>("/integrations")
      .then(next => {
        setState(next);
        if (next.ticket) {
          const merged = { ...DEFAULT_TICKET, ...next.ticket };
          setTicket(merged);
          writeTicketTemplate(merged);
        }
        if (sessionStorage.getItem("pos.openTicketConfig") === "1") {
          sessionStorage.removeItem("pos.openTicketConfig");
          setShowTicketModal(true);
        }
      })
      .catch(() => setNotice("No pudimos cargar las integraciones."));
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

  const saveTicket = async () => {
    try {
      const next = await api<IntegrationsState>("/integrations/ticket", {
        method: "PUT",
        body: JSON.stringify(ticket),
      });
      const merged = { ...DEFAULT_TICKET, ...(next.ticket ?? ticket) };
      setState(next);
      setTicket(merged);
      writeTicketTemplate(merged);
      setShowTicketModal(false);
      setNotice("Plantilla del ticket guardada.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "No pudimos guardar la plantilla del ticket.");
    }
  };

  const previewTicket = () => {
    writeTicketTemplate(ticket);
    printSaleTicket({
      code: "VTA-000000",
      items: [{ name: "Producto de ejemplo", qty: 1, lineTotal: 10000 }],
      total: 10000,
      paid: 10000,
      change: 0,
      payment: "efectivo",
      clientName: "Cliente de prueba",
      printed: true,
      soldAt: new Date().toISOString(),
      reprint: true,
    });
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
      <PageHeader
        title="Configuración"
        subtitle="Solo de este negocio. Empieza con una plantilla por defecto y cámbiala por los datos de tu empresa."
        actions={
          <Button onClick={() => setShowTicketModal(true)}>Configurar ticket</Button>
        }
      />
      {notice && <p className="-mt-2 text-sm font-semibold text-brand-700">{notice}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {peripherals.map(p => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl ${p.connected ? "bg-gradient-to-br from-brand-50 to-cyan-100 text-brand-700" : "bg-slate-100 text-slate-400"}`}>{p.icon}</div>
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
              {p.id === "printer" ? (
                <Button variant="secondary" size="sm" onClick={() => setShowTicketModal(true)}>Configurar ticket</Button>
              ) : (
                <Button variant="secondary" size="sm">Configurar</Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-slate-700 text-sm">Configuración de impresora de tickets</h2>
          <Button variant="secondary" size="sm" onClick={() => setShowTicketModal(true)}>
            Configurar campos del ticket
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="IP / Puerto" value={state.printer.host} onChange={e => setState({ ...state, printer: { ...state.printer, host: e.target.value } })} />
          <Input label="Puerto TCP" type="number" value={state.printer.tcpPort} onChange={e => setState({ ...state, printer: { ...state.printer, tcpPort: Number(e.target.value) } })} />
          <Select label="Ancho de papel" value={state.printer.paperWidth} onChange={e => setState({ ...state, printer: { ...state.printer, paperWidth: e.target.value } })}><option>80mm</option><option>58mm</option></Select>
        </div>
        <div className="flex gap-2 mt-4">
          <Button size="sm" onClick={() => { void savePrinter(); }}>Guardar configuración</Button>
          <Button variant="secondary" size="sm" onClick={previewTicket}>Imprimir prueba</Button>
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
        <Button className="mt-4" size="sm" onClick={() => { void saveDian(); }}>Guardar DIAN</Button>
      </Card>

      {showTicketModal && (
        <Modal title="Campos del ticket de venta" onClose={() => setShowTicketModal(false)}>
          <div className="flex flex-col gap-4">
            <Input
              label="Nombre del negocio"
              value={ticket.storeName}
              onChange={e => setTicket({ ...ticket, storeName: e.target.value })}
              placeholder="Nombre de tu negocio"
            />
            <Input
              label="Línea de NIT / ciudad"
              value={ticket.nitLine}
              onChange={e => setTicket({ ...ticket, nitLine: e.target.value })}
              placeholder="NIT 900.123.456-1 · Cali"
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-navy-900">Texto extra del encabezado</label>
              <textarea
                value={ticket.extraHeader}
                onChange={e => setTicket({ ...ticket, extraHeader: e.target.value })}
                rows={3}
                placeholder="Dirección, teléfono, resolución DIAN…"
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15"
              />
            </div>
            <Input
              label="Pie de página"
              value={ticket.footer}
              onChange={e => setTicket({ ...ticket, footer: e.target.value })}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                ["showDate", "Mostrar fecha/hora de la venta"],
                ["showClient", "Mostrar cliente"],
                ["showPayment", "Mostrar método de pago"],
                ["showChange", "Mostrar cambio"],
                ["showReprint", "Mostrar etiqueta REIMPRESIÓN"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={ticket[key]}
                    onChange={e => setTicket({ ...ticket, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              La fecha de la esquina superior es del navegador. Al imprimir usamos márgenes en cero para ocultarla;
              si sigue visible, desactiva “Encabezados y pies de página” en el diálogo de impresión.
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => { void saveTicket(); }}>Guardar plantilla</Button>
            <Button variant="secondary" className="flex-1" onClick={previewTicket}>Vista previa</Button>
            <Button variant="ghost" className="flex-1" onClick={() => setShowTicketModal(false)}>Cancelar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────

interface AccountUser {
  id: number;
  email: string;
  is_active: boolean;
  role?: UserRole;
  plan?: string;
  plan_label?: string;
  plan_expires_at?: string | null;
  subscription_status?: string;
  created_at: string;
}

function formatAdminDay(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function accountPlanName(user: AccountUser): string {
  if (user.role === "admin") return "Plataforma";
  if (user.plan === "trial") return "Prueba gratis";
  if (user.plan === "monthly") return "Mensual";
  return "Libre";
}

function accountAccess(user: AccountUser): { label: string; color: "green" | "red" | "gray" } {
  if (!user.is_active) return { label: "Inactiva", color: "gray" };
  if (user.role !== "admin" && user.subscription_status === "vencido") return { label: "Bloqueada", color: "red" };
  return { label: "Activa", color: "green" };
}

function accountBlock(user: AccountUser): { date: string; hint: string } {
  if (user.role === "admin") return { date: "No aplica", hint: "Cuenta de la plataforma" };
  if (!user.plan || !user.plan_expires_at) {
    return { date: "Sin fecha de corte", hint: "Todavía no tiene prueba ni mensual, no se vence" };
  }
  const date = formatAdminDay(user.plan_expires_at);
  const days = Math.ceil((new Date(user.plan_expires_at).getTime() - Date.now()) / 86_400_000);
  if (user.subscription_status === "vencido" || days <= 0) return { date, hint: "Ya bloqueada" };
  if (days === 1) return { date, hint: "Se bloquea mañana" };
  return { date, hint: `Se bloquea en ${days} días` };
}

function Usuarios({ role, sessionEmail }: { role: UserRole; sessionEmail: string }) {
  const emptyForm = { email: "", password: "", role: "administrador" as UserRole, plan: "trial" as "trial" | "monthly" };
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AccountUser | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteCountdown, setDeleteCountdown] = useState(5);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const isAdmin = role === "admin";

  const loadUsers = async () => {
    setUsers(await api<AccountUser[]>("/users"));
  };

  useEffect(() => {
    loadUsers()
      .catch(() => setError("No pudimos cargar los usuarios."))
      .finally(() => setLoading(false));
  }, []);

  const createUser = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.password.length < 8) return;
    setError("");
    try {
      const saved = await api<AccountUser>("/users", {
        method: "POST",
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          ...(isAdmin ? { plan: form.plan } : { role: form.role }),
        }),
      });
      setUsers([saved, ...users.filter(user => user.id !== saved.id)]);
      setForm(emptyForm);
      setShowModal(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos crear el usuario.");
    }
  };

  const renewPlan = async (user: AccountUser) => {
    setError("");
    try {
      const updated = await api<AccountUser>(`/users/${user.id}/subscription`, {
        method: "PATCH",
        body: JSON.stringify({ action: "renew" }),
      });
      setUsers(users.map(item => item.id === updated.id ? updated : item));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos renovar el plan.");
    }
  };

  const canDelete = (user: AccountUser) => {
    if (user.email === sessionEmail || user.role === "admin") return false;
    if (isAdmin) return user.role === "owner";
    return user.role !== "owner";
  };

  const openDelete = (user: AccountUser) => {
    setError("");
    setPendingDelete(user);
    setDeleteStep(1);
    setDeleteCountdown(5);
    setDeleteEmail("");
    setDeleting(false);
  };

  const closeDelete = () => {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteStep(1);
    setDeleteEmail("");
    setError("");
  };

  useEffect(() => {
    if (!pendingDelete || deleteStep !== 1 || deleteCountdown <= 0) return;
    const timer = window.setTimeout(() => setDeleteCountdown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [pendingDelete, deleteStep, deleteCountdown]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (deleteEmail.trim().toLowerCase() !== pendingDelete.email.trim().toLowerCase()) {
      setError("El correo no coincide. Escríbelo tal cual, sin pegarlo.");
      return;
    }
    setError("");
    setDeleting(true);
    try {
      await api(`/users/${pendingDelete.id}`, { method: "DELETE" });
      setUsers(users.filter(item => item.id !== pendingDelete.id));
      setPendingDelete(null);
      setDeleteEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos eliminar el usuario.");
    } finally {
      setDeleting(false);
    }
  };

  const blockClipboard = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  const changeRole = async (user: AccountUser, nextRole: UserRole) => {
    setError("");
    try {
      const updated = await api<AccountUser>(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      setUsers(users.map(item => item.id === updated.id ? updated : item));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cambiar el rol.");
    }
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <PageHeader
        title={isAdmin ? "Negocios" : "Usuarios del negocio"}
        subtitle={isAdmin
          ? "Prueba gratis dura 15 días. Mensual dura 30. Libre es una cuenta vieja: no se vence hasta que le pongas un plan."
          : "Crea personas de tu equipo y asígnales el rol con el que van a entrar."}
        actions={<Button onClick={() => { setError(""); setShowModal(true); }}>{isAdmin ? "+ Crear negocio" : "+ Crear usuario"}</Button>}
      />

      {error && !showModal && !pendingDelete && <p className="text-sm text-red-600">{error}</p>}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {(isAdmin
                ? ["Correo", "Plan", "Fecha de creación", "Se bloquea", "Cuenta", ""]
                : ["Correo", "Rol", "Estado", "Creado", ""]
              ).map(heading => (
                <th key={heading || "acciones"} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const access = accountAccess(user);
              const block = accountBlock(user);
              const planName = accountPlanName(user);
              return (
              <tr key={user.id} className="border-b border-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{user.email}</p>
                  {isAdmin && (
                    <p className="mt-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">{roleLabel(user.role)}</p>
                  )}
                </td>
                {isAdmin ? (
                  <>
                    <td className="px-4 py-3">
                      <Badge color={planName === "Prueba gratis" ? "yellow" : planName === "Mensual" ? "blue" : "gray"}>
                        {planName}
                      </Badge>
                      {planName === "Libre" && (
                        <p className="mt-1 text-xs text-slate-500">Sin prueba ni mensual</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatAdminDay(user.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className={`font-medium ${block.hint === "Ya bloqueada" ? "text-rose-700" : "text-slate-700"}`}>{block.date}</p>
                      {block.hint && <p className={`mt-0.5 text-xs ${block.hint === "Ya bloqueada" ? "text-rose-600" : "text-slate-500"}`}>{block.hint}</p>}
                    </td>
                    <td className="px-4 py-3"><Badge color={access.color}>{access.label}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {user.role === "owner" && (
                          <Button size="sm" variant={user.subscription_status === "vencido" ? "primary" : "secondary"} onClick={() => { void renewPlan(user); }}>
                            {user.plan === "monthly" ? "Renovar un mes" : user.plan === "trial" ? "Activar plan mensual" : "Poner plan mensual"}
                          </Button>
                        )}
                        {canDelete(user) && (
                          <Button size="sm" variant="danger" onClick={() => openDelete(user)}>Eliminar</Button>
                        )}
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      {user.role !== "owner" && user.role !== "admin" ? (
                        <select
                          value={user.role ?? "cajero"}
                          onChange={event => { void changeRole(user, event.target.value as UserRole); }}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-400"
                        >
                          {BUSINESS_ROLES.map(option => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      ) : (
                        <Badge color={user.role === "admin" ? "blue" : user.role === "owner" ? "green" : "gray"}>
                          {roleLabel(user.role)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={user.is_active ? "green" : "gray"}>{user.is_active ? "Activo" : "Inactivo"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(user.created_at).toLocaleString("es-CO")}</td>
                    <td className="px-4 py-3 text-right">
                      {canDelete(user) && (
                        <Button size="sm" variant="danger" onClick={() => openDelete(user)}>Eliminar</Button>
                      )}
                    </td>
                  </>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && users.length === 0 && <p className="text-center text-slate-400 py-12 text-sm">Aún no hay usuarios</p>}
        {loading && <p className="text-center text-slate-400 py-12 text-sm">Cargando usuarios…</p>}
      </Card>

      {pendingDelete && (
        <Modal title={deleteStep === 1 ? "Verifica antes de eliminar" : "Escribe el correo para confirmar"} onClose={closeDelete}>
          {deleteStep === 1 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-rose-700">
                {isAdmin
                  ? "Se va a borrar este negocio, su equipo y no se puede deshacer."
                  : "Se va a borrar este usuario y no se puede deshacer."}
              </p>
              <dl
                className="select-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                onCopy={blockClipboard}
                onCut={blockClipboard}
                onContextMenu={blockClipboard}
              >
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-slate-500">Correo</dt>
                  <dd className="break-all font-semibold text-navy-900">{pendingDelete.email}</dd>
                </div>
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-slate-500">Rol</dt>
                  <dd className="font-semibold text-navy-900">{roleLabel(pendingDelete.role)}</dd>
                </div>
                {isAdmin && (
                  <>
                    <div className="flex justify-between gap-3 py-1">
                      <dt className="text-slate-500">Plan</dt>
                      <dd className="font-semibold text-navy-900">{accountPlanName(pendingDelete)}</dd>
                    </div>
                    <div className="flex justify-between gap-3 py-1">
                      <dt className="text-slate-500">Se bloquea</dt>
                      <dd className="font-semibold text-navy-900">{accountBlock(pendingDelete).date}</dd>
                    </div>
                    <div className="flex justify-between gap-3 py-1">
                      <dt className="text-slate-500">Cuenta</dt>
                      <dd className="font-semibold text-navy-900">{accountAccess(pendingDelete).label}</dd>
                    </div>
                  </>
                )}
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-slate-500">Creada</dt>
                  <dd className="font-semibold text-navy-900">{formatAdminDay(pendingDelete.created_at)}</dd>
                </div>
              </dl>
              <div className="mt-1 flex justify-end gap-2">
                <Button variant="ghost" onClick={closeDelete}>Cancelar</Button>
                {deleteCountdown > 0 ? (
                  <Button variant="danger" disabled>Eliminar en {deleteCountdown}s</Button>
                ) : (
                  <Button variant="danger" onClick={() => { setError(""); setDeleteEmail(""); setDeleteStep(2); }}>Continuar a eliminar</Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-slate-600">
                Escribe a mano el correo de la cuenta que viste. No se puede copiar ni pegar.
              </p>
              <Input
                label="Correo de la cuenta"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={deleteEmail}
                onChange={e => setDeleteEmail(e.target.value)}
                onPaste={blockClipboard}
                onDrop={blockClipboard}
                onCopy={blockClipboard}
                onCut={blockClipboard}
                onContextMenu={blockClipboard}
                onKeyDown={event => {
                  if ((event.ctrlKey || event.metaKey) && ["c", "v", "x"].includes(event.key.toLowerCase())) {
                    event.preventDefault();
                  }
                }}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" disabled={deleting} onClick={() => { setDeleteStep(1); setDeleteCountdown(5); setDeleteEmail(""); setError(""); }}>Volver</Button>
                <Button
                  variant="danger"
                  disabled={deleting || deleteEmail.trim().toLowerCase() !== pendingDelete.email.trim().toLowerCase()}
                  onClick={() => { void confirmDelete(); }}
                >
                  {deleting ? "Eliminando…" : "Eliminar cuenta"}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {showModal && (
        <Modal title={isAdmin ? "Crear negocio" : "Crear usuario"} onClose={() => setShowModal(false)}>
          <div className="flex flex-col gap-3">
            <Input label="Correo electrónico" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <Input label="Contraseña" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            {!isAdmin && (
              <Select label="Rol" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as UserRole })}>
                {BUSINESS_ROLES.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </Select>
            )}
            {isAdmin && (
              <Select label="Plan" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value as "trial" | "monthly" })}>
                <option value="trial">Prueba gratis 15 días</option>
                <option value="monthly">Plan mensual</option>
              </Select>
            )}
            <p className="text-xs text-slate-500">
              {isAdmin
                ? form.plan === "trial"
                  ? "Podrá entrar 15 días. Al vencerse la cuenta se bloquea hasta que actives el plan mensual."
                  : "Podrá entrar 30 días. Cuando se venza, renuévalo desde esta lista."
                : "Administrador ve todo y crea usuarios. Cajero cobra. Inventario solo productos y stock. Lo puedes cambiar después."}
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={() => { void createUser(); }} disabled={!form.email.trim() || form.password.length < 8}>Guardar</Button>
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
  const [sessionRole, setSessionRole] = useState<UserRole>("owner");
  const [authReady, setAuthReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem("promethixia-nav-collapsed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("promethixia-nav-collapsed", navCollapsed ? "1" : "0");
    } catch {
      /* ignore quota / private mode */
    }
  }, [navCollapsed]);

  useEffect(() => {
    restoreSession()
      .then((session) => {
        setSessionEmail(session?.user.email ?? null);
        setSessionRole(session?.user.role ?? "owner");
      })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    setProducts([]);
    setCategories([]);
    setMovements([]);
    setClients([]);
    setSuppliers([]);
    setStats(emptyStats);
    if (!sessionEmail) {
      bindTicketCache("");
      bindProductSettings("");
      return;
    }
    bindTicketCache(sessionEmail);
    bindProductSettings(sessionEmail);
    if (sessionRole === "admin") return;
    Promise.all([
      api<Product[]>("/products"),
      api<Client[]>("/clients"),
      api<Supplier[]>("/suppliers"),
      api<DashboardStats>("/dashboard"),
      api<Category[]>("/categories"),
      api<InventoryMovement[]>("/inventory/movements"),
      api<IntegrationsState>("/integrations"),
    ]).then(([nextProducts, nextClients, nextSuppliers, nextStats, nextCategories, nextMovements, integrations]) => {
      setProducts(normalizeProducts(nextProducts));
      setClients(nextClients);
      setSuppliers(nextSuppliers);
      setStats(nextStats);
      setCategories(nextCategories);
      setMovements(nextMovements);
      if (integrations.ticket) writeTicketTemplate(integrations.ticket);
    }).catch(() => undefined);
  }, [sessionEmail, sessionRole]);

  useEffect(() => {
    if (!sessionEmail || sessionRole === "admin" || module !== "dashboard") return;
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
    return (
      <LoginScreen
        onSuccess={(email, role) => {
          setSessionEmail(email);
          setSessionRole(role);
          setModule(role === "admin" ? "usuarios" : "dashboard");
        }}
      />
    );
  }

  const allowedModules = modulesForRole(sessionRole);
  const visibleNav = navItems.filter(item => allowedModules.includes(item.id));
  const activeModule = visibleNav.some(item => item.id === module) ? module : (visibleNav[0]?.id ?? "dashboard");
  const moduleLabel = visibleNav.find(item => item.id === activeModule)?.label ?? "Promethixia";

  return (
    <div className="flex min-h-dvh font-body">
      <Sidebar
        active={activeModule}
        open={menuOpen}
        collapsed={navCollapsed}
        onToggle={() => setNavCollapsed(current => !current)}
        items={visibleNav}
        onNav={(next) => {
          setModule(next);
          setMenuOpen(false);
        }}
        email={sessionEmail}
        onLogout={() => {
          void signOut().then(() => {
            bindTicketCache("");
            bindProductSettings("");
            setSessionEmail(null);
            setSessionRole("owner");
          });
        }}
      />
      {menuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-navy-900/50 lg:hidden"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <main className="app-canvas relative min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-[var(--surface)] px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            className="grid size-10 place-items-center rounded-2xl border border-brand-100 bg-white text-navy-900 shadow-sm"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold text-navy-900">{moduleLabel}</p>
            <p className="truncate text-xs text-slate-500">{sessionEmail}</p>
          </div>
          <ThemeToggle compact />
        </div>
        <div key={`${sessionEmail}:${activeModule}`} className="animate-rise">
        <Suspense fallback={<ScreenFallback />}>
        {activeModule === "dashboard" && <Dashboard stats={stats} />}
        {activeModule === "productos" && (
          <Productos
            products={products} setProducts={setProducts}
            categories={categories} setCategories={setCategories}
            movements={movements} setMovements={setMovements}
          />
        )}
        {activeModule === "inventario" && (
          <Inventario
            products={products} setProducts={setProducts}
            movements={movements} setMovements={setMovements}
          />
        )}
        {activeModule === "clientes" && <Clientes clients={clients} setClients={setClients} />}
        {activeModule === "proveedores" && (
          <Proveedores
            suppliers={suppliers} setSuppliers={setSuppliers}
            products={products} setProducts={setProducts}
            movements={movements} setMovements={setMovements}
          />
        )}
        {activeModule === "ventas" && (
          <Ventas
            products={products} setProducts={setProducts}
            clients={clients} setClients={setClients}
            movements={movements} setMovements={setMovements}
            onConfigureTicket={allowedModules.includes("integraciones") ? () => {
              sessionStorage.setItem("pos.openTicketConfig", "1");
              setModule("integraciones");
            } : undefined}
          />
        )}
        {activeModule === "cierre" && <CierreCaja />}
        {activeModule === "creditos" && <Creditos />}
        {activeModule === "integraciones" && <Integraciones />}
        {activeModule === "usuarios" && <Usuarios role={sessionRole} sessionEmail={sessionEmail} />}
        </Suspense>
        </div>
      </main>
    </div>
  );
}
