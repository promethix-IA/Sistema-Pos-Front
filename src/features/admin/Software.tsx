import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { downloadDesktopInstaller } from "../../lib/download";
import { Badge, Button, Card, PageHeader, Select } from "../../ui";
import { CrearLicenciaModal, FormularioLicencia, type PeriodoLicencia } from "../licencias/Licencias";
import { formatAdminDay, type AccountUser } from "./cuentas";

export function Software() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [licenseFor, setLicenseFor] = useState<AccountUser | null>(null);

  useEffect(() => {
    api<AccountUser[]>("/users")
      .then((data) => setUsers(data.filter((user) => user.role === "owner")))
      .catch(() => setError("No pudimos cargar los negocios."))
      .finally(() => setLoading(false));
  }, []);

  const saveChannel = async (user: AccountUser, channel: string) => {
    setError("");
    setSavingId(user.id);
    try {
      const updated = await api<AccountUser>(`/users/${user.id}/desktop`, {
        method: "PATCH",
        body: JSON.stringify({ channel }),
      });
      setUsers(users.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(`Windows de ${updated.email}: ${channel === "windows7-8" ? "7/8" : "10/11"}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar el Windows.");
    } finally {
      setSavingId(null);
    }
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

  const avisoLicencia = (filename: string, periodo: PeriodoLicencia, hasta: string) => {
    const vigencia = periodo === "mensual" ? "mensualidad" : periodo === "trimestral" ? "tres meses" : "anualidad";
    setNotice(`Se descargó ${filename} (${vigencia} hasta ${formatAdminDay(hasta)}). Envíasela al cliente para “Active su licencia”.`);
  };

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Software de escritorio"
        subtitle="Aquí va el aplicativo: Windows, instalador y licencia .lic. El plan web y la renovación están en Negocios."
      />

      <Card className="p-5">
        <p className="text-sm font-semibold text-navy-900">Cómo se entrega el programa</p>
        <ol className="mt-3 grid gap-3 text-sm text-slate-600 lg:grid-cols-3">
          <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="font-bold text-brand-700">1.</span> Elige Windows 10/11 o 7/8 y descarga el instalador. El cliente lo ejecuta encima; los datos no se borran.
          </li>
          <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="font-bold text-brand-700">2.</span> Crea el .lic con mensualidad, tres meses o anualidad. Esa fecha es del aplicativo.
          </li>
          <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="font-bold text-brand-700">3.</span> Envíale el archivo. En el POS carga “Active su licencia”. El .lic no se queda en el servidor.
          </li>
        </ol>
      </Card>

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && !licenseFor && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        {users.map((user) => (
          <Card key={user.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold text-navy-900">{user.email}</p>
                <p className="mt-0.5 text-xs text-slate-500">Activa la descarga en Negocios. Aquí solo el programa y la licencia.</p>
              </div>
              <Badge color={user.desktop_download ? "green" : "gray"}>
                {user.desktop_download ? "Descarga activa" : "Descarga oculta"}
              </Badge>
            </div>

            <div className="mt-4 max-w-sm">
              <Select
                label="Windows del computador"
                value={user.desktop_channel === "windows7-8" ? "windows7-8" : "windows10-11"}
                disabled={savingId === user.id}
                onChange={(event) => { void saveChannel(user, event.target.value); }}
              >
                <option value="windows10-11">Windows 10 u 11</option>
                <option value="windows7-8">Windows 7, 8 u 8.1</option>
              </Select>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={downloadingId === `${user.id}:windows10-11`} onClick={() => { void downloadDesktop(user, "windows10-11"); }}>
                {downloadingId === `${user.id}:windows10-11` ? "Descargando…" : "Instalador 10/11"}
              </Button>
              <Button size="sm" variant="secondary" disabled={downloadingId === `${user.id}:windows7-8`} onClick={() => { void downloadDesktop(user, "windows7-8"); }}>
                {downloadingId === `${user.id}:windows7-8` ? "Descargando…" : "Instalador 7/8"}
              </Button>
              <Button size="sm" onClick={() => { setError(""); setLicenseFor(user); }}>
                Crear licencia .lic
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {!loading && users.length === 0 && <p className="py-4 text-sm text-slate-400">Aún no hay negocios. Créalos en Negocios.</p>}
      {loading && <p className="py-4 text-sm text-slate-400">Cargando negocios…</p>}

      <Card className="max-w-xl p-5">
        <p className="font-display text-lg font-bold text-navy-900">Licencia para un equipo</p>
        <p className="mt-1 text-sm text-slate-600">
          Si ya tienes el código del computador, créala aquí con mensualidad, tres meses o anualidad.
        </p>
        <div className="mt-4">
          <FormularioLicencia />
        </div>
      </Card>

      {licenseFor && (
        <CrearLicenciaModal
          initialCliente={licenseFor.email.split("@")[0] || licenseFor.email}
          onClose={() => setLicenseFor(null)}
          onCreated={(filename, periodo, hasta) => avisoLicencia(filename, periodo, hasta)}
        />
      )}
    </div>
  );
}
