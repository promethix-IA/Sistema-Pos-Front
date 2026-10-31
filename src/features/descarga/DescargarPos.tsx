import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { downloadDesktopInstaller } from "../../lib/download";
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
  channel?: string;
  items?: InstaladorCanal[];
}

function peso(bytes: number): string {
  if (!bytes) return "";
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function DescargarPos() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [channel, setChannel] = useState("windows10-11");
  const [items, setItems] = useState<InstaladorCanal[]>([
    { id: "windows10-11", label: "Windows 10 y 11", ready: false, filename: "", size: 0 },
    { id: "windows7-8", label: "Windows 7, 8 y 8.1", ready: false, filename: "", size: 0 },
  ]);

  useEffect(() => {
    api<EscritorioEstado>("/desktop")
      .then((data) => {
        if (data.items?.length) setItems(data.items);
        if (data.channel) setChannel(data.channel);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No pudimos ver los instaladores."));
  }, []);

  const descargar = async (canal: string) => {
    setError("");
    setNotice("");
    setLoadingId(canal);
    try {
      await downloadDesktopInstaller(canal);
      setNotice("Instalador listo. Si el POS ya está instalado, ciérralo y ejecuta el archivo encima. No desinstales: la base de datos no se toca. La licencia de 1 año es el archivo .lic, no hace falta fecha para descargar.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos descargar el POS.");
    } finally {
      setLoadingId(null);
    }
  };

  const propio = items.find((item) => item.id === channel) || items[0];

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Descargar POS"
        subtitle="Baja el programa para el computador del negocio. No pide fecha: la vigencia de 1 año va en la licencia .lic."
      />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="max-w-2xl rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-card">
        <p className="font-display text-lg font-bold text-navy-900">La base de datos no se pierde</p>
        <p className="mt-2 text-sm text-slate-700">
          Ventas, productos y clientes están en una carpeta aparte del computador. Actualizar solo cambia el programa.
        </p>
      </div>

      <Card className="max-w-2xl p-6">
        <p className="font-display text-lg font-bold text-navy-900">Windows de este computador</p>
        <p className="mt-1 text-sm text-slate-600">Elige el sistema del equipo e instala. Si ya lo tiene, se pone encima.</p>
        <div className="mt-4 max-w-md">
          <Select label="Windows del computador" value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="windows10-11">Windows 10 u 11 (64 bits)</option>
            <option value="windows7-8">Windows 7 SP1, 8 u 8.1 (64 bits)</option>
          </Select>
        </div>
        {propio?.size ? <p className="mt-3 text-xs text-slate-400">{propio.label} · {peso(propio.size)}</p> : null}
        <div className="mt-5">
          <Button disabled={!propio?.ready || loadingId === channel} onClick={() => { void descargar(channel); }}>
            {!propio?.ready
              ? "Aún no está este instalador"
              : loadingId === channel
                ? "Descargando…"
                : "Descargar aplicativo"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
