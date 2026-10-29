import { useCallback, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useServerStatus } from "./hooks/useServerStatus.ts";
import { useTheme } from "./hooks/useTheme.ts";
import { useAuth } from "./hooks/useAuth.ts";
import { ServerOfflineScreen } from "./components/ServerOfflineScreen.tsx";
import { LoginScreen } from "./components/LoginScreen.tsx";
import { Header } from "./components/Header.tsx";
import { TabNav, TABS } from "./components/TabNav.tsx";
import { Toast } from "./components/Toast.tsx";
import { ProcesarTab } from "./components/ProcesarTab.tsx";
import { HistorialTab } from "./components/HistorialTab.tsx";
import { ServiciosTab } from "./components/ServiciosTab.tsx";
import { RevisionQueueTab } from "./components/RevisionQueueTab.tsx";
import { EstadisticasTab } from "./components/EstadisticasTab.tsx";
import { UsuariosTab } from "./components/UsuariosTab.tsx";
import { LogsTab } from "./components/LogsTab.tsx";
import { ImportarExcelTab } from "./components/ImportarExcelTab.tsx";
import { DbConfigPanel } from "./components/DbConfigPanel.tsx";
import { EditUserModal } from "./components/EditUserModal.tsx";
import { EditInvoiceModal } from "./components/EditInvoiceModal.tsx";
import type { InvoiceRecord, User } from "./types/api.ts";

const machineId = (() => {
  let id = "";
  return () => {
    if (!id) {
      const host = window.location.hostname || "pc";
      id = `${host === "localhost" || host === "127.0.0.1" ? "pc-local" : host}-${crypto.randomUUID?.().slice(-8) ?? "00000000"}`;
    }
    return id;
  };
})();

export default function App() {
  const server = useServerStatus();
  const theme = useTheme();
  const auth = useAuth();
  const [tab, setTab] = useState("procesar");
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [showDbConfig, setShowDbConfig] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [refresh, setRefresh] = useState(0);

  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const triggerRefresh = useCallback(() => setRefresh((n) => n + 1), []);
  const handleLogin = useCallback((u: string, p: string) => auth.login(u, p, machineId()), [auth]);
  const handleLogout = useCallback(async () => {
    await auth.logout();
    setTab("procesar");
  }, [auth]);

  const handleDbDisconnect = useCallback(async () => {
    if (!confirm("¿Desconectar de BD enterprise y volver a SQLite local?")) return;
    try {
      const res = await fetch("/api/db/disconnect", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Desconectado, ahora en SQLite local. Recargando...");
        setTimeout(() => window.location.reload(), 800);
      } else {
        showToast("error", data.error || "No se pudo desconectar");
      }
    } catch (e: any) {
      showToast("error", e.message || "Error al desconectar");
    }
  }, []);

  const puede = (permiso: string) => auth.user?.role === "admin" || !!auth.user?.permisos?.includes(permiso);
  const visibleTabs = useMemo(() => TABS.filter((t) => (!t.adminOnly || auth.user?.role === "admin") && (!t.permiso || auth.user?.role === "admin" || auth.user?.permisos?.includes(t.permiso))), [auth.user]);

  if (server.status === "offline") return <ServerOfflineScreen onRetry={server.recheck} />;
  if (server.status === "checking" || auth.checking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-[3px] border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-5" />
          <p className="text-gray-500 text-sm">Conectando con el servidor...</p>
        </div>
      </div>
    );
  }

  if (!auth.user)
    return (
      <div className="min-h-screen flex flex-col">
        <Toast toast={toast} />
        <LoginScreen
          serverInfo={server.info}
          loginError={auth.error}
          onLogin={handleLogin}
          onOpenDbConfig={() => setShowDbConfig(true)}
          onDbChange={() => server.recheck()}
        />
        {showDbConfig && (
          <DbConfigPanel
            onClose={() => {
              setShowDbConfig(false);
              server.recheck();
            }}
            showToast={showToast}
          />
        )}
      </div>
    );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Toast toast={toast} />

      <Header
        user={auth.user}
        theme={theme.theme}
        dbOk={server.info?.db?.ok ?? false}
        dbMode={server.info?.dbMode}
        onToggleTheme={theme.toggle}
        onLogout={handleLogout}
        onDisconnect={handleDbDisconnect}
      />

      <TabNav tabs={visibleTabs} active={tab} onChange={(id) => setTab(id)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AnimatePresence mode="wait">
          {tab === "procesar" && <ProcesarTab showToast={showToast} trig={triggerRefresh} />}
          {tab === "historial" && (
            <HistorialTab
              showToast={showToast}
              refresh={refresh}
              canEdit={puede("editar_facturas")}
              onEdit={setEditingInvoice}
            />
          )}
          {tab === "servicios" && <ServiciosTab showToast={showToast} onEdit={puede("editar_facturas") ? setEditingInvoice : undefined} />}
          {tab === "revision" && auth.user.role === "admin" && (
            <RevisionQueueTab showToast={showToast} refresh={refresh} onEdit={setEditingInvoice} />
          )}
          {tab === "estadisticas" && puede("ver_estadisticas") && <EstadisticasTab />}
          {tab === "usuarios" && auth.user.role === "admin" && (
            <UsuariosTab
              currentUser={auth.user}
              showToast={showToast}
              onEdited={triggerRefresh}
              onEdit={setEditingUser}
              refresh={refresh}
            />
          )}
          {tab === "logs" && auth.user.role === "admin" && <LogsTab />}
          {tab === "importar" && puede("importar_excel") && <ImportarExcelTab showToast={showToast} />}
        </AnimatePresence>
      </main>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            triggerRefresh();
          }}
          showToast={showToast}
        />
      )}

      {editingInvoice && (
        <EditInvoiceModal
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSaved={() => {
            setEditingInvoice(null);
            triggerRefresh();
          }}
          showToast={showToast}
        />
      )}

      <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px] text-gray-400">
          <span>SGF v4.0 · Sistema de Gestion de Facturas ETECSA</span>
          <span>{server.info?.dbMode?.toUpperCase() || "SQLITE"} · Cliente/Servidor Centralizado</span>
        </div>
      </footer>
    </div>
  );
}
