import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { downloadAuthenticatedPost } from "../../lib/download";
import { Button, Card, Input, Modal, PageHeader } from "../../ui";

const EQUIPO = /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/;

function dentroDeUnAnio(): string {
  const fecha = new Date();
  fecha.setFullYear(fecha.getFullYear() + 1);
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

async function emitirLicencia(cliente: string, equipo: string, hasta: string): Promise<string> {
  return downloadAuthenticatedPost(
    "/licenses",
    {
      cliente: cliente.trim(),
      equipo: equipo.replace(/\s+/g, "").toUpperCase(),
      actualizaciones_hasta: hasta,
    },
    "licencia.lic",
  );
}

export function CrearLicenciaModal({
  initialCliente = "",
  initialHasta = "",
  onClose,
  onCreated,
}: {
  initialCliente?: string;
  initialHasta?: string;
  onClose: () => void;
  onCreated: (filename: string) => void;
}) {
  const [form, setForm] = useState({
    cliente: initialCliente,
    equipo: "",
    hasta: initialHasta || dentroDeUnAnio(),
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const equipoNormalizado = form.equipo.replace(/\s+/g, "").toUpperCase();
  const puedeCrear = form.cliente.trim().length > 0 && EQUIPO.test(equipoNormalizado) && !saving;

  const crear = async () => {
    if (!puedeCrear) return;
    setError("");
    setSaving(true);
    try {
      const filename = await emitirLicencia(form.cliente, form.equipo, form.hasta);
      onCreated(filename);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos crear la licencia.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Crear licencia de escritorio" onClose={() => { if (!saving) onClose(); }}>
      <div className="flex flex-col gap-3">
        <Input
          label="Nombre del negocio"
          value={form.cliente}
          placeholder="Tienda Don Pepe"
          onChange={(event) => setForm({ ...form, cliente: event.target.value })}
        />
        <Input
          label="Código del equipo"
          value={form.equipo}
          placeholder="00E8-B682-7EC7-9CEC"
          onChange={(event) => setForm({ ...form, equipo: event.target.value })}
        />
        <p className="text-xs text-slate-500">Ese código sale en la pantalla “Active su licencia”. La licencia solo sirve en ese computador.</p>
        <Input
          label="Licencia válida hasta"
          type="date"
          value={form.hasta}
          onChange={(event) => setForm({ ...form, hasta: event.target.value })}
        />
        <p className="text-xs text-slate-500">Por defecto 1 año. Eso vive en el .lic, no en la descarga del programa.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" disabled={saving} onClick={onClose}>Cancelar</Button>
        <Button disabled={!puedeCrear} onClick={() => { void crear(); }}>
          {saving ? "Creando…" : "Crear y descargar .lic"}
        </Button>
      </div>
    </Modal>
  );
}

export function Licencias() {
  const [ready, setReady] = useState(true);
  const [aviso, setAviso] = useState("");
  const [form, setForm] = useState({ cliente: "", equipo: "", hasta: dentroDeUnAnio() });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const equipoNormalizado = form.equipo.replace(/\s+/g, "").toUpperCase();
  const puedeCrear = ready && form.cliente.trim().length > 0 && EQUIPO.test(equipoNormalizado) && !saving;

  useEffect(() => {
    api<{ ready: boolean; message: string }>("/licenses")
      .then((data) => {
        setReady(data.ready);
        setAviso(data.message);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No pudimos cargar licencias."));
  }, []);

  const crear = async () => {
    if (!puedeCrear) return;
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const filename = await emitirLicencia(form.cliente, form.equipo, form.hasta);
      setForm({ cliente: "", equipo: "", hasta: dentroDeUnAnio() });
      setNotice(`Se descargó ${filename}. No queda guardada en el servidor: envíasela al cliente y listo.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos crear la licencia.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Licencias de escritorio"
        subtitle="Escribe el código del computador, descarga el .lic y envíaselo al cliente. El archivo no se queda en el sistema."
      />
      {!ready && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {aviso || "El servidor todavía no tiene la llave para firmar licencias."}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card className="max-w-xl p-5">
        <div className="flex flex-col gap-3">
          <Input
            label="Nombre del negocio"
            value={form.cliente}
            placeholder="Tienda Don Pepe"
            onChange={(event) => setForm({ ...form, cliente: event.target.value })}
          />
          <Input
            label="Código del equipo"
            value={form.equipo}
            placeholder="00E8-B682-7EC7-9CEC"
            onChange={(event) => setForm({ ...form, equipo: event.target.value })}
          />
          <p className="text-xs text-slate-500">Cópialo de la pantalla roja del POS. Ejemplo: 00E8-B682-7EC7-9CEC</p>
          <Input
            label="Licencia válida hasta"
            type="date"
            value={form.hasta}
            onChange={(event) => setForm({ ...form, hasta: event.target.value })}
          />
          <p className="text-xs text-slate-500">Por defecto 1 año. La descarga del aplicativo no usa esta fecha.</p>
          <div>
            <Button disabled={!puedeCrear} onClick={() => { void crear(); }}>
              {saving ? "Creando…" : "Crear y descargar .lic"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
