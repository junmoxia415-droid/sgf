import {
  Database,
  HardDrive,
  LogOut,
  Moon,
  Server,
  Sun,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { SessionUser } from "../types/api.ts";

type Props = {
  user: SessionUser;
  theme: "light" | "dark";
  dbOk: boolean;
  dbMode?: string;
  onToggleTheme: () => void;
  onLogout: () => void;
  onDisconnect: () => void;
};

function MotorIcon({ mode, className }: { mode?: string; className?: string }) {
  if (mode === "mssql") return <Server className={className} />;
  if (mode === "oracle") return <Database className={className} />;
  if (mode === "sqlite") return <HardDrive className={className} />;
  return <Database className={className} />;
}

function MotorLabel(mode?: string): string {
  if (mode === "mssql") return "SQL Server";
  if (mode === "oracle") return "Oracle";
  if (mode === "sqlite") return "SQLite";
  return "BD";
}

export function Header({ user, theme, dbOk, dbMode, onToggleTheme, onLogout, onDisconnect }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm">
            <Database className="w-4 h-4 text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">SGF</h1>
            <p className="text-[10px] text-gray-400 leading-tight">Facturas ETECSA</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Solo Desconectar dentro de la app - ya no abre modal de config */}
          <button
            onClick={onDisconnect}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              dbOk
                ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500"
            }`}
            title={`Motor activo: ${MotorLabel(dbMode)} - Click para desconectar y volver a SQLite`}
          >
            {dbOk ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <MotorIcon mode={dbMode} className="w-3 h-3 opacity-70" />
            <span className="hidden md:inline">Desconectar</span>
            <span className="md:hidden uppercase">{MotorLabel(dbMode)}</span>
            <LogOut className="w-3 h-3 ml-0.5 opacity-60" />
          </button>

          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-900 dark:text-white leading-tight">{user.name}</p>
              <p className="text-[10px] text-gray-400 leading-tight">{user.role === "admin" ? "Admin" : "Usuario"}</p>
            </div>
          </div>

          <button onClick={onToggleTheme} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors">
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <button onClick={onLogout} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-600 transition-colors text-xs">
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
}
