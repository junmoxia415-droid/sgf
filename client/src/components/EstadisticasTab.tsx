import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, CheckCircle2, Clock3, TrendingUp } from "lucide-react";
import * as api from "../api/client.ts";
import { fmtMoney } from "./Mini.tsx";

export function EstadisticasTab() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const response = await api.getFacturaStats();
      if (response.success) setStats(response.data);
    })();
  }, []);

  if (!stats) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center">
        <div className="w-10 h-10 border-[3px] border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-400">Cargando estadisticas...</p>
      </motion.div>
    );
  }

  return (
    <motion.div key="stats" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="space-y-5">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          Estadisticas SGF
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <S label="Facturas" value={stats.TOTAL} color="indigo" icon={Activity} />
          <S label="Servicios" value={stats.TOTAL_SERVICIOS} color="emerald" icon={CheckCircle2} />
          <S label="Monto Total" value={`$${fmtMoney(Number(stats.MONTO_TOTAL) || 0)}`} color="blue" />
          <S label="Promedio" value={`$${fmtMoney(Number(stats.PROMEDIO) || 0)}`} color="amber" />
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          <S label="Procesadas" value={stats.PROCESADAS ?? 0} color="emerald" icon={CheckCircle2} />
          <S label="Pendientes" value={stats.PENDIENTES ?? 0} color="amber" icon={Clock3} />
          <S label="Errores" value={stats.ERRORES ?? 0} color="indigo" icon={Activity} />
        </div>

        {stats.ULTIMA_FECHA && (
          <div className="mt-5 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-500 dark:text-gray-300">
            Ultima factura procesada: <span className="font-semibold text-gray-700 dark:text-white">{stats.ULTIMA_FECHA}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function S({ label, value, color, icon: Icon }: { label: string; value: any; color: string; icon?: any }) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-900",
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900",
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900",
    amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900",
  };

  return (
    <div className={`rounded-xl p-4 border ${colors[color]}`}>
      {Icon ? <Icon className="w-4 h-4 mb-2 opacity-70 text-gray-700 dark:text-white" /> : null}
      <p className="text-xs opacity-70 mb-1 text-gray-600 dark:text-gray-300">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value ?? "-"}</p>
    </div>
  );
}
