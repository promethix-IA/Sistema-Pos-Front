import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { downloadAuthenticatedPost } from "../../lib/download";
import { Button, Input, Modal, Select } from "../../ui";

const EQUIPO = /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/;

export type PeriodoLicencia = "mensual" | "trimestral" | "anual";

const PERIODOS: { id: PeriodoLicencia; meses: number; label: string }[] = [
  { id: "mensual", meses: 1, label: "Mensualidad (1 mes)" },
  { id: "trimestral", meses: 3, label: "Tres meses" },
  { id: "anual", meses: 12, label: "Anualidad (1 año)" },
];

function hastaDe(periodo: PeriodoLicencia): string {
  const meses = PERIODOS.find((item) => item.id === periodo)?.meses ?? 12;
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + meses);
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function formatearDia(valor: string): string {
  const [anio, mes, dia] = valor.split("-").map(Number);
  if (!anio || !mes || !dia) return valor;
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function etiquetaPeriodo(periodo: PeriodoLicencia): string {
  return PERIODOS.find((item) => item.id === periodo)?.label ?? "Anualidad (1 año)";
}

async function emitirLicencia(cliente: string, equipo: string, periodo: PeriodoLicencia): Promise<string> {
  return downloadAuthenticatedPost(
    "/licenses",
    {
      cliente: cliente.trim(),
      equipo: equipo.replace(/\s+/g, "").toUpperCase(),
      periodo,
    },
    "licencia.lic",
  );
}

function CamposLicencia({
  cliente,
  equipo,
  periodo,
  onCliente,
  onEquipo,
  onPeriodo,
}: {
  cliente: string;
  equipo: string;
  periodo: PeriodoLicencia;
  onCliente: (value: string) => void;
  onEquipo: (value: string) => void;
  onPeriodo: (value: PeriodoLicencia) => void;
}) {
  return (
    <>
      <Input
        label="Nombre del negocio"
        value={cliente}
        placeholder="Tienda Don Pepe"
        onChange={(event) => onCliente(event.target.value)}
      />
      <Input
        label="Código del equipo"
        value={equipo}
        placeholder="00E8-B682-7EC7-9CEC"
        onChange={(event) => onEquipo(event.target.value)}
      />
      <p className="text-xs text-slate-500">Ese código sale en la pantalla “Active su licencia”. La licencia solo sirve en ese computador.</p>
      <Select label="Vigencia del aplicativo" value={periodo} onChange={(event) => onPeriodo(event.target.value as PeriodoLicencia)}>
        {PERIODOS.map((item) => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
      </Select>
      <p className="text-xs text-slate-500">
        El .lic queda hasta el {formatearDia(hastaDe(periodo))}. La descarga del programa no usa esta fecha.
      </p>
    </>
  );
}

export function CrearLicenciaModal({
  initialCliente = "",
  onClose,
  onCreated,
}: {
  initialCliente?: string;
  onClose: () => void;
  onCreated: (filename: string, periodo: PeriodoLicencia, hasta: string) => void;
}) {
  const [form, setForm] = useState({
    cliente: initialCliente,
    equipo: "",
    periodo: "anual" as PeriodoLicencia,
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
      const filename = await emitirLicencia(form.cliente, form.equipo, form.periodo);
      onCreated(filename, form.periodo, hastaDe(form.periodo));
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
        <CamposLicencia
          cliente={form.cliente}
          equipo={form.equipo}
          periodo={form.periodo}
          onCliente={(cliente) => setForm({ ...form, cliente })}
          onEquipo={(equipo) => setForm({ ...form, equipo })}
          onPeriodo={(periodo) => setForm({ ...form, periodo })}
        />
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

export function FormularioLicencia({
  initialCliente = "",
  onCreated,
}: {
  initialCliente?: string;
  onCreated?: (filename: string, periodo: PeriodoLicencia, hasta: string) => void;
}) {
  const [ready, setReady] = useState(true);
  const [aviso, setAviso] = useState("");
  const [form, setForm] = useState({ cliente: initialCliente, equipo: "", periodo: "anual" as PeriodoLicencia });
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
      const periodo = form.periodo;
      const filename = await emitirLicencia(form.cliente, form.equipo, periodo);
      const hasta = hastaDe(periodo);
      setForm({ cliente: initialCliente, equipo: "", periodo: "anual" });
      onCreated?.(filename, periodo, hasta);
      setNotice(`Se descargó ${filename} (${etiquetaPeriodo(periodo)} hasta ${formatearDia(hasta)}). Envíasela al cliente; no queda en el servidor.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos crear la licencia.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!ready && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {aviso || "El servidor todavía no tiene la llave para firmar licencias."}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <CamposLicencia
        cliente={form.cliente}
        equipo={form.equipo}
        periodo={form.periodo}
        onCliente={(cliente) => setForm({ ...form, cliente })}
        onEquipo={(equipo) => setForm({ ...form, equipo })}
        onPeriodo={(periodo) => setForm({ ...form, periodo })}
      />
      <div>
        <Button disabled={!puedeCrear} onClick={() => { void crear(); }}>
          {saving ? "Creando…" : "Crear y descargar .lic"}
        </Button>
      </div>
    </div>
  );
}
