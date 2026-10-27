import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, FileText, Filter, Pencil, Search, Trash2, XCircle } from "lucide-react";
import * as api from "../api/client.ts";
import type { InvoiceRecord } from "../types/api.ts";
import { fmtMoney } from "./Mini.tsx";

type Props = {
  showToast: (t: "success" | "error" | "info", m: string) => void;
  refresh: number;
  canEdit?: boolean;
  onEdit?: (invoice: InvoiceRecord) => void;
};

export function HistorialTab({ showToast, refresh, canEdit = false, onEdit }: Props) {
  const [rows, setRows] = useState<InvoiceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 15, totalPages: 1 });
  const [detail, setDetail] = useState<InvoiceRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchRows = useCallback(async (nextPage = 1) => {
    const response = await api.getFacturas({ page: nextPage, pageSize: 15, search: search || undefined, estado });
    if (response.success) {
      setRows(response.data || []);
      setMeta({
        total: response.meta?.total ?? 0,
        page: response.meta?.page ?? nextPage,
        pageSize: response.meta?.pageSize ?? 15,
        totalPages: response.meta?.totalPages ?? 1,
      });
      setPage(nextPage);
    } else {
      showToast("error", response.error || "Error al cargar.");
    }
  }, [estado, search, showToast]);

  useEffect(() => {
    void fetchRows(1);
  }, [fetchRows, refresh]);

  const openDetail = async (row: InvoiceRecord) => {
    setDetailLoading(true);
    const response = await api.getFactura(row.id);
    if (response.success && response.data) {
      setDetail(response.data);
    } else {
      showToast("error", response.error || "No se pudo cargar la factura.");
    }
    setDetailLoading(false);
  };


  const openEdit = async (row: InvoiceRecord) => {
    if (!onEdit) return;
    const response = await api.getFactura(row.id);
    if (response.success && response.data) {
      onEdit(response.data);
    } else {
      showToast("error", response.error || "No se pudo cargar la factura para editar.");
    }
  };

  const del = async (id: string, noFactura: string) => {
    if (!confirm(`Eliminar la factura ${noFactura || id}?`)) return;
    const response = await api.deleteFactura(id);
    if (response.success) {
      showToast("success", "Factura eliminada.");
      setDetail(null);
      void fetchRows(page);
    } else {
      showToast("error", response.error || "Error.");
    }
  };

  return (
    <motion.div key="historial" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="space-y-5">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="grid md:grid-cols-[1fr,180px,auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="text"
              placeholder="Buscar por cliente, factura, cuenta o codigo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-emerald-400"
            />
          </div>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300">
            <option value="all">Todos</option>
            <option value="procesado">Procesado</option>
            <option value="pendiente">Pendiente</option>
            <option value="error">Error</option>
          </select>
          <button onClick={() => void fetchRows(1)} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl flex items-center gap-1.5 transition-colors justify-center">
            <Filter className="w-3.5 h-3.5" />
            Buscar
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">No. Factura</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">Periodo</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 hidden md:table-cell">Servicios</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Total</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 w-24">Acc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-20 text-center text-gray-300 dark:text-gray-600">
                    Sin facturas guardadas en SGF_FACTURAS
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors" onClick={() => void openDetail(r)}>
                    <td className="px-4 py-2.5 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold">{r.no_factura || r.id}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 max-w-[320px] truncate">{r.cliente || "-"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 hidden lg:table-cell">{r.periodo_consumo || "-"}</td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-500 hidden md:table-cell">{r.servicios_count ?? 0}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">${fmtMoney(Number(r.total_pagar) || 0)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${r.estado === "procesado" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : r.estado === "pendiente" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"}`}>
                        {r.estado}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && onEdit && (
                          <button onClick={() => void openEdit(r)} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded text-gray-400 hover:text-blue-500">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => del(r.id, r.no_factura)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-400">
              {meta.total} facturas · Pag {page}/{meta.totalPages}
            </span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => void fetchRows(page - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button disabled={page >= meta.totalPages} onClick={() => void fetchRows(page + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {(detail || detailLoading) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="flex justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                {detailLoading ? "Cargando detalle..." : `Factura: ${detail?.no_factura || detail?.id}`}
              </h3>
              <div className="flex items-center gap-2">
                {canEdit && onEdit && detail && !detailLoading && (
                  <button onClick={() => void openEdit(detail)} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <Pencil className="w-4 h-4" />
                    Editar
                  </button>
                )}
                <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            {detailLoading || !detail ? (
              <div className="py-10 text-center text-gray-400">Cargando...</div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <D label="Cliente" v={detail.cliente || "-"} />
                  <D label="No. Cliente" v={detail.numero_cliente || "-"} />
                  <D label="No. Cuenta" v={detail.numero_cuenta || "-"} />
                  <D label="NIT" v={detail.nit || "-"} />
                  <D label="Fecha Factura" v={detail.fecha_emision || "-"} />
                  <D label="Fecha Vencimiento" v={detail.fecha_vencimiento || "-"} />
                  <D label="Periodo" v={detail.periodo_consumo || "-"} />
                  <D label="Codigo Pago" v={detail.codigo_pago || "-"} />
                  <D label="Cuota" v={`$${fmtMoney(Number(detail.cuota) || 0)}`} />
                  <D label="Consumo" v={`$${fmtMoney(Number(detail.consumo) || 0)}`} />
                  <D label="Comision" v={`$${fmtMoney(Number(detail.comision) || 0)}`} />
                  <D label="Impuesto" v={`$${fmtMoney(Number(detail.impuesto) || 0)}`} />
                </div>

                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900 p-4">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">Total a pagar</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">${fmtMoney(Number(detail.total_pagar) || 0)} {detail.moneda}</p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Servicios ({detail.servicios?.length || 0})</h4>
                  <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Numero</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Cuota</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Consumo</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Comision</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Impuesto</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {(detail.servicios || []).map((s) => (
                          <tr key={s.id || s.numero_servicio}>
                            <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{s.numero_servicio}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">${fmtMoney(Number(s.cuota) || 0)}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">${fmtMoney(Number(s.consumo) || 0)}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">${fmtMoney(Number(s.comision) || 0)}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">${fmtMoney(Number(s.impuesto) || 0)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-gray-700 dark:text-gray-300">${fmtMoney(Number(s.importe) || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function D({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-800 dark:text-gray-200 break-words">{v}</p>
    </div>
  );
}
