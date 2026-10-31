import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { downloadAuthenticated } from "../../lib/download";
import { Button, Card, PageHeader, Select } from "../../ui";

interface InstaladorCanal {
  id: string;
  label: string;
  ready: boolean;
  filename: string;
  size: number;
}

interface EscritorioEstado {
  allowed: boolean;
  version?: string;
  channel?: string;
  updates_until?: string;
  items?: InstaladorCanal[];
}

function peso(bytes: number): string {
  if (!bytes) return "";
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function formatearDia(valor?: string): string {
  if (!valor) return "—";
  const [anio, mes, dia] = valor.split("-").map(Number);
  if (!anio || !mes || !dia) return valor;
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export function DescargarPos() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [channel, setChannel] = useState("windows10-11");
  const [version, setVersion] = useState("");
  const [updatesUntil, setUpdatesUntil] = useState("");
  const [items, setItems] = useState<InstaladorCanal[]>([
    { id: "windows10-11", label: "Windows 10 y 11", ready: false, filename: "", size: 0 },
    { id: "windows7-8", label: "Windows 7, 8 y 8.1", ready: false, filename: "", size: 0 },
  ]);

  const cargar = async () => {
    const data = await api<EscritorioEstado>("/desktop");
    if (data.items?.length) setItems(data.items);
    if (data.channel) setChannel(data.channel);
    setVersion(data.version || "");
    setUpdatesUntil(data.updates_until || "");
  };

  useEffect(() => {
    cargar().catch((err) => setError(err instanceof ApiError ? err.message : "No pudimos ver los instaladores."));
  }, []);

  const guardarPerfil = async () => {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await api("/users/me/desktop", { method: "PATCH", body: JSON.stringify({ channel }) });
      setNotice("Guardamos el Windows de este negocio. La próxima actualización usará ese instalador.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  const descargar = async (canal: string) => {
    setError("");
    setNotice("");
    setLoadingId(canal);
    try {
      const item = items.find((entry) => entry.id === canal);
      await downloadAuthenticated(`/desktop/installer?channel=${canal}`, item?.filename || `Promethixia-POS-${canal}.exe`);
      setNotice("Actualización descargada. Cierra el POS de escritorio y ejecuta el archivo encima. No desinstales. La base de datos no se toca.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos descargar la actualización del POS.");
    } finally {
      setLoadingId(null);
    }
  };

  const propio = items.find((item) => item.id === channel) || items[0];
  const licenciaVencida = Boolean(version && updatesUntil && version > updatesUntil);

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="POS de escritorio"
        subtitle="Instala o actualiza Promethixia en el computador del negocio. La base de datos no se borra."
      />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="max-w-2xl rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-card">
        <p className="font-display text-lg font-bold text-navy-900">La base de datos no se pierde</p>
        <p className="mt-2 text-sm text-slate-700">
          Ventas, productos, clientes y la licencia están en una carpeta aparte del computador, no dentro del instalador.
          Actualizar solo cambia el programa. No hay que desinstalar.
        </p>
      </div>

      <Card className="max-w-2xl p-6">
        <p className="font-display text-lg font-bold text-navy-900">Perfil de este computador</p>
        <p className="mt-1 text-sm text-slate-600">
          Versión publicada: {formatearDia(version)}. Actualizaciones pagadas hasta: {formatearDia(updatesUntil)}.
        </p>
        {licenciaVencida && (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Esta versión es más nueva que las actualizaciones de tu licencia. Pide a Promethixia que renueve el .lic antes de instalar.
          </p>
        )}
        <div className="mt-4 max-w-md">
          <Select label="Windows del computador" value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="windows10-11">Windows 10 u 11 (64 bits)</option>
            <option value="windows7-8">Windows 7 SP1, 8 u 8.1 (64 bits)</option>
          </Select>
        </div>
        <div className="mt-4">
          <Button variant="secondary" disabled={saving} onClick={() => { void guardarPerfil(); }}>
            {saving ? "Guardando…" : "Guardar perfil"}
          </Button>
        </div>
      </Card>

      <Card className="max-w-2xl p-6">
        <p className="font-display text-lg font-bold text-navy-900">Actualizar ahora</p>
        <p className="mt-1 text-sm text-slate-600">
          Baja el programa con los cambios de hoy. Si ya está instalado, se pone encima. Si es la primera vez, instala.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>Si el POS de escritorio está abierto, ciérralo.</li>
          <li>Pulsa el botón y espera la descarga.</li>
          <li>Ejecuta el archivo. No desinstales. Productos y ventas se quedan.</li>
          <li>Si pide licencia, carga el .lic nuevo que te envió Promethixia.</li>
        </ol>
        {propio?.size ? <p className="mt-3 text-xs text-slate-400">{propio.label} · {peso(propio.size)}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button disabled={!propio?.ready || licenciaVencida || loadingId === channel} onClick={() => { void descargar(channel); }}>
            {!propio?.ready
              ? "Aún no está este instalador"
              : licenciaVencida
                ? "Hay que renovar la licencia"
                : loadingId === channel
                  ? "Descargando…"
                  : "Actualizar ahora"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
