import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { downloadDesktopInstaller } from "../../lib/download";
import { roleLabel } from "../../lib/auth";
import { Badge, Button, Card, Input, Modal, PageHeader, Select } from "../../ui";
import { CrearLicenciaModal } from "../licencias/Licencias";
import { accountAccess, accountBlock, accountPlanName, formatAdminDay, inOneYear, type AccountUser } from "./cuentas";

export function Negocios({ sessionEmail }: { sessionEmail: string }) {
  const emptyForm = { email: "", password: "", plan: "trial" as "trial" | "monthly" };
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AccountUser | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteCountdown, setDeleteCountdown] = useState(5);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [licenseFor, setLicenseFor] = useState<AccountUser | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const loadUsers = async () => {
    setUsers(await api<AccountUser[]>("/users"));
  };

  useEffect(() => {
    loadUsers()
      .catch(() => setError("No pudimos cargar los negocios."))
      .finally(() => setLoading(false));
  }, []);

  const createUser = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.password.length < 8) return;
    setError("");
    try {
      const saved = await api<AccountUser>("/users", {
        method: "POST",
        body: JSON.stringify({ email: form.email.trim(), password: form.password, plan: form.plan }),
      });
      setUsers([saved, ...users.filter((user) => user.id !== saved.id)]);
      setForm(emptyForm);
      setShowModal(false);
      setNotice(`Negocio creado: ${saved.email}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos crear el negocio.");
    }
  };

  const patchDesktop = async (user: AccountUser, body: Record<string, unknown>, ok: string) => {
    setError("");
    setTogglingId(user.id);
    try {
      const updated = await api<AccountUser>(`/users/${user.id}/desktop`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setUsers(users.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(ok);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar el perfil del POS.");
    } finally {
      setTogglingId(null);
    }
  };

  const toggleDesktop = async (user: AccountUser) => {
    setError("");
    setTogglingId(user.id);
    try {
      const updated = await api<AccountUser>(`/users/${user.id}/desktop`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !user.desktop_download }),
      });
      setUsers(users.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(
        updated.desktop_download
          ? `${updated.email} ya ve “Descargar POS” en su menú.`
          : `Quitamos “Descargar POS” del menú de ${updated.email}.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cambiar la descarga del POS.");
    } finally {
      setTogglingId(null);
    }
  };

  const saveChannel = async (user: AccountUser, channel: string) => {
    await patchDesktop(user, { channel }, `Windows de ${user.email}: ${channel === "windows7-8" ? "7/8" : "10/11"}.`);
  };

  const renewPlan = async (user: AccountUser) => {
    setError("");
    try {
      const updated = await api<AccountUser>(`/users/${user.id}/subscription`, {
        method: "PATCH",
        body: JSON.stringify({ action: "renew" }),
      });
      setUsers(users.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(`Plan actualizado para ${updated.email}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos renovar el plan.");
    }
  };

  const canDelete = (user: AccountUser) => user.email !== sessionEmail && user.role === "owner";

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
    const timer = window.setTimeout(() => setDeleteCountdown((value) => value - 1), 1000);
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
      setUsers(users.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
      setDeleteEmail("");
      setNotice("Negocio eliminado.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos eliminar el negocio.");
    } finally {
      setDeleting(false);
    }
  };

  const blockClipboard = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  const downloadDesktop = async (user: AccountUser, channel: "windows10-11" | "windows7-8") => {
    setError("");
    setDownloadingId(`${user.id}:${channel}`);
    try {
      const etiqueta = channel === "windows7-8" ? "Windows7-8" : "Windows10-11";
      await downloadDesktopInstaller(channel, user.id);
      setNotice(`Instalador ${etiqueta} listo para ${user.email}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos descargar el POS de escritorio.");
    } finally {
      setDownloadingId(null);
    }
  };

  const negocios = users.filter((user) => user.role !== "admin");
  const plataforma = users.filter((user) => user.role === "admin");

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Configuración de negocios"
        subtitle="Activa la descarga, elige el Windows del negocio y envíale el .lic de 1 año. La fecha va solo en la licencia, no en la descarga."
        actions={<Button onClick={() => { setError(""); setShowModal(true); }}>+ Crear negocio</Button>}
      />

      <Card className="p-5">
        <p className="text-sm font-semibold text-navy-900">Cómo se entrega el POS de escritorio</p>
        <ol className="mt-3 grid gap-3 text-sm text-slate-600 lg:grid-cols-4">
          <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="font-bold text-brand-700">1.</span> Activa el interruptor para que vean “Descargar POS” y elige si su computador es Windows 10/11 o 7/8.
          </li>
          <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="font-bold text-brand-700">2.</span> Crea el .lic de 1 año con el código del computador. Ese archivo es la vigencia; la descarga no pide fecha.
          </li>
          <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="font-bold text-brand-700">3.</span> El cliente entra al POS en el navegador, baja el instalador y lo ejecuta encima. Los datos no se borran.
          </li>
          <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="font-bold text-brand-700">4.</span> Si el programa pide licencia, carga el .lic. El archivo no se queda en el servidor.
          </li>
        </ol>
      </Card>

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && !showModal && !pendingDelete && !licenseFor && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        {negocios.map((user) => {
          const access = accountAccess(user);
          const block = accountBlock(user);
          const planName = accountPlanName(user);
          return (
            <Card key={user.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-bold text-navy-900">{user.email}</p>
                  <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{roleLabel(user.role)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge color={planName === "Prueba gratis" ? "yellow" : planName === "Mensual" ? "blue" : "gray"}>{planName}</Badge>
                  <Badge color={access.color}>{access.label}</Badge>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Creado</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{formatAdminDay(user.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Se bloquea</dt>
                  <dd className={`mt-0.5 font-medium ${block.hint === "Ya bloqueada" ? "text-rose-700" : "text-slate-800"}`}>{block.date}</dd>
                  {block.hint && <p className={`text-xs ${block.hint === "Ya bloqueada" ? "text-rose-600" : "text-slate-500"}`}>{block.hint}</p>}
                </div>
              </dl>

              {user.role === "owner" && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-navy-900">POS de escritorio</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {user.desktop_download
                          ? "Este negocio ve “Descargar POS” al entrar."
                          : "Oculto. Actívalo para que puedan instalar o actualizar el programa."}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(user.desktop_download)}
                      disabled={togglingId === user.id}
                      onClick={() => { void toggleDesktop(user); }}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${user.desktop_download ? "bg-brand-600" : "bg-slate-300"} disabled:opacity-50`}
                    >
                      <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform ${user.desktop_download ? "left-5" : "left-0.5"}`} />
                    </button>
                  </div>
                  <div className="mt-3 max-w-sm">
                    <Select
                      label="Windows del negocio"
                      value={user.desktop_channel === "windows7-8" ? "windows7-8" : "windows10-11"}
                      disabled={togglingId === user.id}
                      onChange={(event) => { void saveChannel(user, event.target.value); }}
                    >
                      <option value="windows10-11">Windows 10 u 11</option>
                      <option value="windows7-8">Windows 7, 8 u 8.1</option>
                    </Select>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={downloadingId === `${user.id}:windows10-11`} onClick={() => { void downloadDesktop(user, "windows10-11"); }}>
                      {downloadingId === `${user.id}:windows10-11` ? "Descargando…" : "Windows 10/11"}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={downloadingId === `${user.id}:windows7-8`} onClick={() => { void downloadDesktop(user, "windows7-8"); }}>
                      {downloadingId === `${user.id}:windows7-8` ? "Descargando…" : "Windows 7/8"}
                    </Button>
                    <Button size="sm" onClick={() => { setError(""); setLicenseFor(user); }}>
                      Crear licencia .lic
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {user.role === "owner" && (
                  <Button size="sm" variant={user.subscription_status === "vencido" ? "primary" : "secondary"} onClick={() => { void renewPlan(user); }}>
                    {user.plan === "monthly" ? "Renovar un mes" : user.plan === "trial" ? "Activar plan mensual" : "Poner plan mensual"}
                  </Button>
                )}
                {canDelete(user) && (
                  <Button size="sm" variant="danger" onClick={() => openDelete(user)}>Eliminar</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {plataforma.length > 0 && (
        <p className="text-xs text-slate-400">
          Cuenta de plataforma: {plataforma.map((user) => user.email).join(", ")}.
        </p>
      )}

      {!loading && negocios.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Aún no hay negocios</p>}
      {loading && <p className="py-8 text-center text-sm text-slate-400">Cargando negocios…</p>}

      {licenseFor && (
        <CrearLicenciaModal
          initialCliente={licenseFor.email.split("@")[0] || licenseFor.email}
          initialHasta={inOneYear()}
          onClose={() => setLicenseFor(null)}
          onCreated={(filename) => {
            setNotice(`Se descargó ${filename}. No queda en el servidor: envíasela al cliente para “Active su licencia”.`);
          }}
        />
      )}

      {pendingDelete && (
        <Modal title={deleteStep === 1 ? "Verifica antes de eliminar" : "Escribe el correo para confirmar"} onClose={closeDelete}>
          {deleteStep === 1 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-rose-700">
                Se va a borrar este negocio, su equipo y no se puede deshacer.
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
                onChange={(event) => setDeleteEmail(event.target.value)}
                onPaste={blockClipboard}
                onDrop={blockClipboard}
                onCopy={blockClipboard}
                onCut={blockClipboard}
                onContextMenu={blockClipboard}
                onKeyDown={(event) => {
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
        <Modal title="Crear negocio" onClose={() => setShowModal(false)}>
          <div className="flex flex-col gap-3">
            <Input label="Correo electrónico" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <Input label="Contraseña" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            <Select label="Plan" value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value as "trial" | "monthly" })}>
              <option value="trial">Prueba gratis 15 días</option>
              <option value="monthly">Plan mensual</option>
            </Select>
            <p className="text-xs text-slate-500">
              {form.plan === "trial"
                ? "Podrá entrar 15 días. Al vencerse la cuenta se bloquea hasta que actives el plan mensual."
                : "Podrá entrar 30 días. Cuando se venza, renuévalo desde esta lista."}
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button disabled={!form.email.trim() || form.password.length < 8} onClick={() => { void createUser(); }}>Guardar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
