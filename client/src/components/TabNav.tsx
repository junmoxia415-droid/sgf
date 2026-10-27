import { AlertTriangle, BarChart3, FileSearch, FileText, Settings, Upload, Users, FileSpreadsheet, type LucideIcon } from "lucide-react";

export type TabId = "procesar" | "historial" | "servicios" | "revision" | "estadisticas" | "usuarios" | "logs" | "importar";
export type TabDef = { id: TabId; label: string; icon: LucideIcon; adminOnly?: boolean };

export const TABS: TabDef[] = [
  { id: "procesar", label: "Procesar", icon: Upload },
  { id: "historial", label: "Historial", icon: FileText },
  { id: "servicios", label: "Servicios", icon: FileSearch },
  { id: "revision", label: "Revision", icon: AlertTriangle, adminOnly: true },
  { id: "estadisticas", label: "Estadisticas", icon: BarChart3, adminOnly: true },
  { id: "usuarios", label: "Usuarios", icon: Users, adminOnly: true },
  { id: "logs", label: "Auditoria", icon: Settings, adminOnly: true },
  { id: "importar", label: "Importar Excel", icon: FileSpreadsheet, adminOnly: true },
];

export function TabNav({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: TabId) => void }) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const on = active === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 border-b-[2.5px] font-medium text-[13px] transition-all whitespace-nowrap ${on ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300"}`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
