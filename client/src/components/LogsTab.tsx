import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ChevronLeft, ChevronRight, Info, Settings, Trash2, XCircle } from "lucide-react";
import * as api from "../api/client.ts";
import type { AppLog, LogLevel } from "../types/api.ts";

const conf: Record<string, { bg: string; icon: typeof Info; color: string }> = {
  info: { bg: "bg-blue-50 dark:bg-blue-900/20", icon: Info, color: "text-blue-600" },
  warn: { bg: "bg-amber-50 dark:bg-amber-900/20", icon: AlertCircle, color: "text-amber-600" },
  error: { bg: "bg-red-50 dark:bg-red-900/20", icon: XCircle, color: "text-red-600" },
};

export function LogsTab() {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [level, setLevel] = useState<"all" | LogLevel>("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 50, totalPages: 1 });

  const fetchLogs = useCallback(async (nextPage = 1) => {
    const response = await api.getLogs({ page: nextPage, pageSize: 50, level });
    if (response.success) {
      setLogs(response.data || []);
      setMeta({
        total: response.meta?.total ?? 0,
        page: response.meta?.page ?? nextPage,
        pageSize: response.meta?.pageSize ?? 50,
        totalPages: response.meta?.totalPages ?? 1,
      });
      setPage(nextPage);
    }
  }, [level]);

  useEffect(() => {
    void fetchLogs(1);
  }, [fetchLogs]);

  const clear = async () => {
    if (!confirm("Limpiar auditoria?")) return;
    const response = await api.clearLogs();
    if (response.success) void fetchLogs(1);
  };

  return (
    <motion.div key="logs" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl border p-6">
        <div className="flex justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            Auditoria
          </h2>
          <div className="flex gap-2">
            <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className="px-3 py-1.5 border rounded-lg bg-white dark:bg-gray-700 text-sm">
              <option value="all">Todos</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <button onClick={clear} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg flex items-center gap-1">
              <Trash2 className="w-4 h-4" />
              Limpiar
            </button>
          </div>
        </div>

        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Sin registros.</p>
          ) : (
            logs.map((log) => {
              const c = conf[log.level] || conf.info;
              const Icon = c.icon;
              return (
                <div key={log.id} className={`p-3 rounded-lg ${c.bg}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`w-4 h-4 mt-0.5 ${c.color}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-semibold ${c.color}`}>{log.accion}</span>
                        <span className="text-xs text-gray-500">{log.entidad}</span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{log.detalles || "Sin detalles"}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-400">
                        <span>{log.ip_address || "sin IP"}</span>
                        <span>{new Date(log.created_at).toLocaleString("es-ES")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {meta.total > meta.pageSize && (
          <div className="flex justify-between mt-4 pt-3 border-t">
            <span className="text-xs text-gray-500">
              {meta.total} registros · Pag {page}/{meta.totalPages}
            </span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => void fetchLogs(page - 1)} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button disabled={page >= meta.totalPages} onClick={() => void fetchLogs(page + 1)} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
