import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock3, Eye, FileText, Filter, Pencil, RefreshCcw, Search, XCircle } from "lucide-react";
import * as api from "../api/client.ts";
import type { InvoiceRecord } from "../types/api.ts";
import { fmtMoney } from "./Mini.tsx";

type Props = {
  showToast: (t: "success" | "error" | "info", m: string) => void;
  refresh: number;
  onEdit?: (invoice: InvoiceRecord) => void;
};

export function RevisionQueueTab({ showToast, refresh, onEdit }: Props) {
  const [rows, setRows] = useState<InvoiceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"review" | "pendiente" | "error">("review");
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<InvoiceRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadStats = useCallback(async () => {
    const response = await api.getFacturaStats();
    if (response.success) setStats(response.data || null);
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const response = await api.getFacturas({ page: 1, pageSize: 100, search: search || undefined, estado });
    if (response.success) {
      setRows(response.data || []);
    } else {
      showToast("error", response.error || "No se pudo cargar la cola de revision.");
    }
    setLoading(false);
  }, [estado, search, showToast]);

  useEffect(() => {
    void Promise.all([fetchRows(), loadStats()]);
  }, [fetchRows, loadStats, refresh]);

  const openDetail = async (invoice: InvoiceRecord) => {
    setDetailLoading(true);
    const response = await api.getFactura(invoice.id);
    if (response.success && response.data) {
      setDetail(response.data);
    } else {
      showToast("error", response.error || "No se pudo cargar el detalle.");
    }
    setDetailLoading(false);
  };

  const openEdit = async (invoice: InvoiceRecord) => {
    if (!onEdit) return;
    const response = await api.getFactura(invoice.id);
    if (response.success && response.data) {
      onEdit(response.data);
    } else {
      showToast("error", response.error || "No se pudo cargar la factura para editar.");
    }
  };

  return (
    <motion.div key="revision" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <SummaryCard label="Pendientes" value={stats?.PENDIENTES ?? 0} tone="amber" icon={Clock3} />
        <SummaryCard label="Errores" value={stats?.ERRORES ?? 0} tone="red" icon={AlertTriangle} />
        <SummaryCard label="Procesadas" value={stats?.PROCESADAS ?? 0} tone="emerald" icon={CheckCircle2} />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="grid md:grid-cols-[1fr,200px,auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente, factura, cuenta o codigo..."
              className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-emerald-400"
            />
          </div>
          <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300">
            <option value="review">Toda la cola</option>
            <option value="pendiente">Solo pendientes</option>
            <option value="error">Solo errores</option>
          </select>
          <button onClick={() => void Promise.all([fetchRows(), loadStats()])} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl flex items-center gap-1.5 transition-colors justify-center">
            <RefreshCcw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Cola de revision</h3>
            <p className="text-xs text-gray-400">Facturas que requieren inspeccion manual antes de cerrar el proceso.</p>
          </div>
          <span className="text-xs text-gray-400">{rows.length} encontradas</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Factura</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Cliente</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Confianza</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 hidden lg:table-cell">Servicios</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Total</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-gray-400">Cargando cola de revision...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-gray-300 dark:text-gray-600">No hay facturas en revision.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold">{row.no_factura || row.id}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{row.periodo_consumo || "Sin periodo"}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 max-w-[300px] truncate">{row.cliente || "-"}</td>
                    <td className="px-4 py-2.5 text-center">
                      <StatusBadge row={row} />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-xs font-semibold ${row.reviewStatus === "doubtful" ? "text-red-600 dark:text-red-300" : row.reviewStatus === "review" ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}`}>
                        {row.confidence ?? 0}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-500 hidden lg:table-cell">{row.servicios_count ?? 0}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">${fmtMoney(Number(row.total_pagar) || 0)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => void openDetail(row)} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {onEdit && (
                          <button onClick={() => void openEdit(row)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {(detail || detailLoading) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                {detailLoading ? "Cargando detalle..." : `Revision: ${detail?.no_factura || detail?.id}`}
              </h3>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            {detailLoading || !detail ? (
              <div className="py-10 text-center text-gray-400">Cargando...</div>
            ) : (
              <div className="space-y-4">
                <div className="grid md:grid-cols-4 gap-3">
                  <SummaryMini label="Estado" value={detail.reviewLabel || detail.estado} />
                  <SummaryMini label="Confianza" value={`${detail.confidence ?? 0}%`} />
                  <SummaryMini label="Parser" value={detail.parser || "-"} />
                  <SummaryMini label="Servicios" value={String(detail.servicios?.length || 0)} />
                </div>

                {(detail.diagnostics || []).length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Motivos de revision</p>
                    {(detail.diagnostics || []).map((diag, index) => (
                      <div key={`${diag.code}-${index}`} className={`rounded-xl border px-3 py-2 text-xs ${diag.level === "error" ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-900 dark:text-red-300" : diag.level === "warn" ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-900 dark:text-amber-300" : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-900 dark:text-blue-300"}`}>
                        <strong className="uppercase mr-2">{diag.level}</strong>
                        {diag.message}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
                    No hay diagnosticos persistidos para esta factura. Usa la confianza, el estado y el detalle para revisarla.
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <SummaryMini label="Cliente" value={detail.cliente || "-"} />
                  <SummaryMini label="No. Cliente" value={detail.numero_cliente || "-"} />
                  <SummaryMini label="No. Cuenta" value={detail.numero_cuenta || "-"} />
                  <SummaryMini label="Codigo Pago" value={detail.codigo_pago || "-"} />
                  <SummaryMini label="Fecha factura" value={detail.fecha_emision || "-"} />
                  <SummaryMini label="Fecha vencimiento" value={detail.fecha_vencimiento || "-"} />
                  <SummaryMini label="Periodo" value={detail.periodo_consumo || "-"} />
                  <SummaryMini label="NIT" value={detail.nit || "-"} />
                </div>

                {onEdit && (
                  <div className="flex justify-end">
                    <button onClick={() => void openEdit(detail)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2">
                      <Pencil className="w-4 h-4" />
                      Abrir para corregir
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SummaryCard({ label, value, tone, icon: Icon }: { label: string; value: any; tone: "amber" | "red" | "emerald"; icon: any }) {
  const tones = {
    amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-300",
    red: "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900 text-red-700 dark:text-red-300",
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300",
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <Icon className="w-4 h-4 mb-2 opacity-70" />
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-2xl font-bold">{value ?? 0}</p>
    </div>
  );
}

function SummaryMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
      <p className="text-[11px] text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 break-words">{value}</p>
    </div>
  );
}

function StatusBadge({ row }: { row: InvoiceRecord }) {
  const isError = row.reviewStatus === "doubtful" || row.estado === "error";
  const isReview = !isError && (row.reviewStatus === "review" || row.estado === "pendiente");

  if (isError) {
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">{row.reviewLabel || "Extraccion dudosa"}</span>;
  }

  if (isReview) {
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">{row.reviewLabel || "Revisar manualmente"}</span>;
  }

  return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">Alta confianza</span>;
}
