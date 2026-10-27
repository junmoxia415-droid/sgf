import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import * as api from "../api/client.ts";
import type { InvoiceRecord, InvoiceStatus, ServiceRow } from "../types/api.ts";

type Props = {
  invoice: InvoiceRecord;
  onClose: () => void;
  onSaved: () => void;
  showToast: (t: "success" | "error" | "info", m: string) => void;
};

type ServiceForm = {
  id: string;
  numero_servicio: string;
  cuota: string;
  consumo: string;
  comision: string;
  impuesto: string;
  importe: string;
};

function toTextNumber(value: number | string | undefined) {
  if (value === undefined || value === null) return "0";
  return String(value);
}

function toNum(value: string) {
  const n = Number(String(value).replace(/,/g, "."));
  return Number.isFinite(n) ? n : 0;
}

function makeService(service?: Partial<ServiceRow>): ServiceForm {
  return {
    id: service?.id || crypto.randomUUID(),
    numero_servicio: String(service?.numero_servicio || ""),
    cuota: toTextNumber(service?.cuota),
    consumo: toTextNumber(service?.consumo),
    comision: toTextNumber(service?.comision),
    impuesto: toTextNumber(service?.impuesto),
    importe: toTextNumber(service?.importe),
  };
}

export function EditInvoiceModal({ invoice, onClose, onSaved, showToast }: Props) {
  const [form, setForm] = useState({
    cliente: invoice.cliente || "",
    cuenta: invoice.cuenta || "",
    numero_cliente: invoice.numero_cliente || "",
    numero_cuenta: invoice.numero_cuenta || "",
    no_factura: invoice.no_factura || "",
    fecha_emision: invoice.fecha_emision || "",
    fecha_vencimiento: invoice.fecha_vencimiento || "",
    periodo_consumo: invoice.periodo_consumo || "",
    codigo_pago: invoice.codigo_pago || "",
    moneda: invoice.moneda || "CUP",
    nit: invoice.nit || "",
    cuota: toTextNumber(invoice.cuota),
    consumo: toTextNumber(invoice.consumo),
    comision: toTextNumber(invoice.comision),
    impuesto: toTextNumber(invoice.impuesto),
    total: toTextNumber(invoice.total),
    total_pagar: toTextNumber(invoice.total_pagar),
    estado: invoice.estado || ("pendiente" as InvoiceStatus),
  });
  const [services, setServices] = useState<ServiceForm[]>((invoice.servicios || []).map(makeService));
  const [saving, setSaving] = useState(false);

  const calculatedTotals = useMemo(() => {
    return services.reduce(
      (acc, item) => ({
        cuota: acc.cuota + toNum(item.cuota),
        consumo: acc.consumo + toNum(item.consumo),
        comision: acc.comision + toNum(item.comision),
        impuesto: acc.impuesto + toNum(item.impuesto),
        importe: acc.importe + toNum(item.importe),
      }),
      { cuota: 0, consumo: 0, comision: 0, impuesto: 0, importe: 0 },
    );
  }, [services]);

  const setService = (id: string, key: keyof ServiceForm, value: string) => {
    setServices((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  };

  const addService = () => setServices((prev) => [...prev, makeService()]);
  const removeService = (id: string) => setServices((prev) => prev.filter((item) => item.id !== id));

  const useServiceTotals = () => {
    setForm((prev) => ({
      ...prev,
      cuota: String(calculatedTotals.cuota.toFixed(2)),
      consumo: String(calculatedTotals.consumo.toFixed(2)),
      comision: String(calculatedTotals.comision.toFixed(2)),
      impuesto: String(calculatedTotals.impuesto.toFixed(2)),
      total: String(calculatedTotals.importe.toFixed(2)),
      total_pagar: String(calculatedTotals.importe.toFixed(2)),
    }));
  };

  const save = async () => {
    if (!form.cliente.trim()) {
      showToast("error", "El cliente es obligatorio.");
      return;
    }
    if (!form.no_factura.trim()) {
      showToast("error", "El numero de factura es obligatorio.");
      return;
    }

    const cleanedServices = services
      .filter((item) => item.numero_servicio.trim())
      .map((item) => ({
        numero_servicio: item.numero_servicio.trim(),
        cuota: toNum(item.cuota),
        consumo: toNum(item.consumo),
        comision: toNum(item.comision),
        impuesto: toNum(item.impuesto),
        importe: toNum(item.importe),
      }));

    setSaving(true);
    const response = await api.updateFactura(invoice.id, {
      ...form,
      cuota: toNum(form.cuota),
      consumo: toNum(form.consumo),
      comision: toNum(form.comision),
      impuesto: toNum(form.impuesto),
      total: toNum(form.total),
      total_pagar: toNum(form.total_pagar),
      servicios: cleanedServices,
    });
    setSaving(false);

    if (response.success) {
      showToast("success", "Factura y servicios actualizados.");
      onSaved();
      onClose();
    } else {
      showToast("error", response.error || "Error actualizando factura.");
    }
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <motion.div initial={{ scale: 0.96, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 16 }} onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Editar factura {invoice.no_factura || invoice.id}</h3>
              <p className="text-xs text-gray-400">Se sincroniza SGF_FACTURAS, SGF_SERVICIOS y CARGARARCH.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-3 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-50">
                <Pencil className="w-4 h-4" />
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <SectionTitle title="Datos de la factura" />
              <div className="grid sm:grid-cols-2 gap-3">
                <I p="Cliente" v={form.cliente} onChange={(v) => setForm({ ...form, cliente: v })} />
                <I p="Cuenta" v={form.cuenta} onChange={(v) => setForm({ ...form, cuenta: v })} />
                <I p="No. Cliente" v={form.numero_cliente} onChange={(v) => setForm({ ...form, numero_cliente: v })} />
                <I p="No. Cuenta" v={form.numero_cuenta} onChange={(v) => setForm({ ...form, numero_cuenta: v })} />
                <I p="No. Factura" v={form.no_factura} onChange={(v) => setForm({ ...form, no_factura: v })} />
                <I p="Codigo de pago" v={form.codigo_pago} onChange={(v) => setForm({ ...form, codigo_pago: v })} />
                <I p="Fecha emision" v={form.fecha_emision} onChange={(v) => setForm({ ...form, fecha_emision: v })} />
                <I p="Fecha vencimiento" v={form.fecha_vencimiento} onChange={(v) => setForm({ ...form, fecha_vencimiento: v })} />
                <I p="Periodo consumo" v={form.periodo_consumo} onChange={(v) => setForm({ ...form, periodo_consumo: v })} />
                <I p="NIT" v={form.nit} onChange={(v) => setForm({ ...form, nit: v })} />
                <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as InvoiceStatus })} className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-sm">
                  <option value="procesado">Procesado</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="error">Error</option>
                </select>
                <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })} className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-sm">
                  <option value="CUP">CUP</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionTitle title="Totales" />
                <button onClick={useServiceTotals} className="px-3 py-2 text-xs rounded-lg border flex items-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Usar suma de servicios
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <I p="Cuota" v={form.cuota} onChange={(v) => setForm({ ...form, cuota: v })} type="number" />
                <I p="Consumo" v={form.consumo} onChange={(v) => setForm({ ...form, consumo: v })} type="number" />
                <I p="Comision" v={form.comision} onChange={(v) => setForm({ ...form, comision: v })} type="number" />
                <I p="Impuesto" v={form.impuesto} onChange={(v) => setForm({ ...form, impuesto: v })} type="number" />
                <I p="Total facturado" v={form.total} onChange={(v) => setForm({ ...form, total: v })} type="number" />
                <I p="Total a pagar" v={form.total_pagar} onChange={(v) => setForm({ ...form, total_pagar: v })} type="number" />
              </div>

              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-4 text-sm bg-gray-50 dark:bg-gray-900/30">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-2">Suma actual de servicios</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-300">
                  <span>Cuota: <strong>{calculatedTotals.cuota.toFixed(2)}</strong></span>
                  <span>Consumo: <strong>{calculatedTotals.consumo.toFixed(2)}</strong></span>
                  <span>Comision: <strong>{calculatedTotals.comision.toFixed(2)}</strong></span>
                  <span>Impuesto: <strong>{calculatedTotals.impuesto.toFixed(2)}</strong></span>
                  <span className="col-span-2">Importe: <strong>{calculatedTotals.importe.toFixed(2)}</strong></span>
                </div>
                <p className="mt-2 text-[11px] text-gray-400">Si la factura tiene descuentos o ajustes, puedes dejar los totales manuales diferentes a la suma de servicios.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionTitle title={`Servicios (${services.length})`} />
              <button onClick={addService} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                Agregar servicio
              </button>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Numero</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Cuota</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Consumo</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Comision</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Impuesto</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Importe</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {services.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">No hay servicios. Agrega al menos uno si quieres sincronizar CARGARARCH.</td>
                      </tr>
                    ) : (
                      services.map((service) => (
                        <tr key={service.id}>
                          <td className="px-3 py-2 min-w-[150px]"><I p="Numero" v={service.numero_servicio} onChange={(v) => setService(service.id, "numero_servicio", v)} compact /></td>
                          <td className="px-3 py-2 min-w-[110px]"><I p="0" v={service.cuota} onChange={(v) => setService(service.id, "cuota", v)} type="number" compact /></td>
                          <td className="px-3 py-2 min-w-[110px]"><I p="0" v={service.consumo} onChange={(v) => setService(service.id, "consumo", v)} type="number" compact /></td>
                          <td className="px-3 py-2 min-w-[110px]"><I p="0" v={service.comision} onChange={(v) => setService(service.id, "comision", v)} type="number" compact /></td>
                          <td className="px-3 py-2 min-w-[110px]"><I p="0" v={service.impuesto} onChange={(v) => setService(service.id, "impuesto", v)} type="number" compact /></td>
                          <td className="px-3 py-2 min-w-[110px]"><I p="0" v={service.importe} onChange={(v) => setService(service.id, "importe", v)} type="number" compact /></td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => removeService(service.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>;
}

function I({ p, v, onChange, type = "text", compact = false }: { p: string; v: string; onChange: (v: string) => void; type?: string; compact?: boolean }) {
  return (
    <input
      type={type}
      step={type === "number" ? "0.01" : undefined}
      placeholder={p}
      value={v}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-3 ${compact ? "py-1.5" : "py-2"} border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm`}
    />
  );
}
