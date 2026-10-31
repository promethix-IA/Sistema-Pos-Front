import type { UserRole } from "../../lib/auth";

export interface AccountUser {
  id: number;
  email: string;
  is_active: boolean;
  role?: UserRole;
  plan?: string;
  plan_label?: string;
  plan_expires_at?: string | null;
  subscription_status?: string;
  desktop_download?: boolean;
  desktop_channel?: string;
  desktop_updates_until?: string;
  created_at: string;
}

export function inOneYear(): string {
  const fecha = new Date();
  fecha.setFullYear(fecha.getFullYear() + 1);
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function formatAdminDay(value?: string | null): string {
  if (!value) return "—";
  const soloDia = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soloDia) {
    return new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3])).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return new Date(value).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export function accountPlanName(user: AccountUser): string {
  if (user.role === "admin") return "Plataforma";
  if (user.plan === "trial") return "Prueba gratis";
  if (user.plan === "monthly") return "Mensual";
  return "Libre";
}

export function accountAccess(user: AccountUser): { label: string; color: "green" | "red" | "gray" } {
  if (!user.is_active) return { label: "Inactiva", color: "gray" };
  if (user.role !== "admin" && user.subscription_status === "vencido") return { label: "Bloqueada", color: "red" };
  return { label: "Activa", color: "green" };
}

export function accountBlock(user: AccountUser): { date: string; hint: string } {
  if (user.role === "admin") return { date: "No aplica", hint: "Cuenta de la plataforma" };
  if (!user.plan || !user.plan_expires_at) {
    return { date: "Sin fecha de corte", hint: "Todavía no tiene prueba ni mensual" };
  }
  const date = formatAdminDay(user.plan_expires_at);
  const days = Math.ceil((new Date(user.plan_expires_at).getTime() - Date.now()) / 86_400_000);
  if (user.subscription_status === "vencido" || days <= 0) return { date, hint: "Ya bloqueada" };
  if (days === 1) return { date, hint: "Se bloquea mañana" };
  return { date, hint: `Se bloquea en ${days} días` };
}
