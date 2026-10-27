import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, FileText, Pencil, Search, XCircle } from "lucide-react";
import * as api from "../api/client.ts";
import type { InvoiceRecord, ServiceSearchResult } from "../types/api.ts";
import { fmtMoney } from "./Mini.tsx";

type Props = {
  showToast: (t: "success" | "error" | "info", m: string) => void;
  onEdit?: (invoice: InvoiceRecord) => void;
};

export function ServiciosTab({ showToast, onEdit }: Props) {
  const [numero, setNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ServiceSearchResult[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [detail, setDetail] = useState<InvoiceRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchRows = useCallback(async (page = 1, value = numero) => {
    setLoading(true);
    const response = await api.searchServicios({ numero: value, page, pageSize: 20 });
    if (response.success) {
      setRows(response.data || []);
      setMeta({
        total: response.meta?.total ?? 0,
        page: response.meta?.page ?? page,
        pageSize: response.meta?.pageSize ?? 20,
        totalPages: response.meta?.totalPages ?? 1,
      });
    } else {
      showToast("error", response.error || "No se pudo buscar el servicio.");
    }
    setLoading(false);
  }, [numero, showToast]);

  useEffect(() => {
    if (!numero.trim()) {
      setRows([]);
      setMeta({ total: 0, page: 1, pageSize: 20, totalPages: 1 });
    }
  }, [numero]);

  const openDetail = async (facturaId: string) => {
    setDetailLoading(true);
    const response = await api.getFactura(facturaId);
    if (response.success && response.data) {
      setDetail(response.data);
    } else {
      showToast("error", response.error || "No se pudo cargar la factura.");
    }
    setDetailLoading(false);
  };

  const openEdit = async (facturaId: string) => {
    if (!onEdit) return;
    const response = await api.getFactura(facturaId);
    if (response.success && response.data) {
      onEdit(response.data);
    } else {
      showToast("error", response.error || "No se pudo cargar la factura para editar.");
    }
  };

  return (
    <motion.div key="servicios" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="space-y-5">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Buscar por numero de servicio, ej: 52587423"
              className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-emerald-400"
            />
          </div>
          <button onClick={() => void fetchRows(1, numero)} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors min-w-[130px]">
            <Search className="w-3.5 h-3.5" />
            Buscar
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">Esta busqueda localiza un servicio y te dice a que factura pertenece.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Resultados por servicio</h3>
          <span className="text-xs text-gray-400">{meta.total} encontrados</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Servicio</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Factura</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">Periodo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Importe</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-gray-400">Buscando servicios...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-gray-300 dark:text-gray-600">Escribe un numero de servicio para buscar.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.service_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold">{row.numero_servicio}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">{row.no_factura || row.factura_id}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 max-w-[320px] truncate">{row.cliente}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 hidden lg:table-cell">{row.periodo_consumo || "-"}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">${fmtMoney(Number(row.importe) || 0)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${row.reviewStatus === "doubtful" ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" : row.reviewStatus === "review" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"}`}>
                        {row.reviewLabel || row.estado}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => void openDetail(row.factura_id)} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {onEdit && (
                          <button onClick={() => void openEdit(row.factura_id)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
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
            <div className="flex justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                {detailLoading ? "Cargando detalle..." : `Factura asociada: ${detail?.no_factura || detail?.id}`}
              </h3>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            {detailLoading || !detail ? (
              <div className="py-10 text-center text-gray-400">Cargando...</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <Mini label="Cliente" value={detail.cliente || "-"} />
                  <Mini label="No. Factura" value={detail.no_factura || "-"} />
                  <Mini label="No. Cliente" value={detail.numero_cliente || "-"} />
                  <Mini label="No. Cuenta" value={detail.numero_cuenta || "-"} />
                  <Mini label="Periodo" value={detail.periodo_consumo || "-"} />
                  <Mini label="Codigo Pago" value={detail.codigo_pago || "-"} />
                  <Mini label="Estado" value={detail.reviewLabel || detail.estado} />
                  <Mini label="Total" value={`$${fmtMoney(Number(detail.total_pagar) || 0)}`} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Servicios de la factura</h4>
                  <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Numero</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {(detail.servicios || []).map((s) => (
                          <tr key={s.id || s.numero_servicio}>
                            <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{s.numero_servicio}</td>
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
      <p className="text-[11px] text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 break-words">{value}</p>
    </div>
  );
}
