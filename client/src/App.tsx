import { useCallback, useEffect, useState } from "react";
import { BarChart3, BookOpen, ChevronRight, Database, FileSearch, FileSpreadsheet, FileText, History, Home, LogOut, Moon, ReceiptText, RefreshCw, Server, ShieldCheck, Sun, Upload, Users, ClipboardList } from "lucide-react";
import { useServerStatus } from "./hooks/useServerStatus.ts";
import { useTheme } from "./hooks/useTheme.ts";
import { useAuth } from "./hooks/useAuth.ts";
import { ServerOfflineScreen } from "./components/ServerOfflineScreen.tsx";
import { LoginScreen } from "./components/LoginScreen.tsx";
import { Toast } from "./components/Toast.tsx";
import { ProcesarTab } from "./components/ProcesarTab.tsx";
import { HistorialTab } from "./components/HistorialTab.tsx";
import { ServiciosTab } from "./components/ServiciosTab.tsx";
import { RevisionQueueTab } from "./components/RevisionQueueTab.tsx";
import { EstadisticasTab } from "./components/EstadisticasTab.tsx";
import { UsuariosTab } from "./components/UsuariosTab.tsx";
import { LogsTab } from "./components/LogsTab.tsx";
import { CatalogoLineas } from "./components/CatalogoLineas.tsx";
import { ImportarExcelTab } from "./components/ImportarExcelTab.tsx";
import { EditUserModal } from "./components/EditUserModal.tsx";
import { EditInvoiceModal } from "./components/EditInvoiceModal.tsx";
import * as api from "./api/client.ts";
import type { HealthData, InvoiceRecord, SessionUser, User } from "./types/api.ts";

type Area = "inicio" | "facturas" | "estadisticas" | "importar" | "lineas" | "usuarios" | "servidor" | "ajustes";
type SubArea = "procesar" | "historial" | "servicios" | "revision" | "logs";

// En HTTP de una red privada randomUUID no está disponible en algunos navegadores.
// No interviene en la autorización: solo identifica la sesión en los registros.
const machineId = (() => { let id = ""; return () => {
  if (!id) id = `navegador-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return id;
}; })();

function Inicio({ user, info, irA, puede }: { user: SessionUser; info: HealthData | null; irA: (a: Area) => void; puede: (p: string) => boolean }) {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (user.role === "admin") void api.getInicioResumen().then(r => { if (r.success && r.data) setStats(r.data); else setError(r.error || "No se pudo cargar el resumen."); }); }, [user.role]);
  return <div className="sgf-home">
    <div className="sgf-heading"><div><p className="sgf-eyebrow">SU ESPACIO DE TRABAJO</p><h1>Bienvenido, <span>{user.name || user.username}</span></h1><p>Gestione sus facturas y líneas de forma sencilla, segura y sin conexión a internet.</p></div>
      <div className="sgf-connected"><ShieldCheck size={24}/><div><strong>Servidor conectado</strong><small>Trabajando en su red local</small></div></div>
    </div>
    {user.role === "admin" && stats && <div className="sgf-stat-grid sgf-home-stats">
      {[["Facturas registradas", stats.facturas], ["Servicios", stats.servicios], ["Líneas del Excel", stats.lineasExcel], ["Usuarios", stats.usuarios]].map(([k,v]) => <div className="sgf-panel" key={String(k)}><small>{String(k)}</small><strong>{String(v ?? "—")}</strong></div>)}
    </div>}
    {error && <p className="sgf-error" role="alert">{error}</p>}
    <div className="sgf-home-grid">
      <section className="sgf-panel sgf-main-panel"><h2>¿Qué desea hacer?</h2><p className="sgf-subtitle">Elija una tarea para comenzar. Solo aparecen las opciones autorizadas para su cuenta.</p>
        <div className="sgf-actions">
          <button onClick={() => irA("facturas")}><span className="sgf-action-icon"><ReceiptText/></span><span><strong>Procesar y consultar facturas</strong><small>Cargue sus PDF y consulte el historial</small></span><ChevronRight/></button>
          {puede("ver_estadisticas") && <button onClick={() => irA("estadisticas")}><span className="sgf-action-icon purple"><BarChart3/></span><span><strong>Estadísticas</strong><small>Compare el consumo de los meses</small></span><ChevronRight/></button>}
          {puede("importar_excel") && <button onClick={() => irA("importar")}><span className="sgf-action-icon green"><FileSpreadsheet/></span><span><strong>Importar Excel de líneas</strong><small>Cargue los datos para cruzarlos con las facturas</small></span><ChevronRight/></button>}
          {user.role === "admin" && <button onClick={() => irA("usuarios")}><span className="sgf-action-icon orange"><Users/></span><span><strong>Administrar usuarios</strong><small>Cree cuentas y asigne permisos</small></span><ChevronRight/></button>}
        </div>
      </section>
      <aside className="sgf-panel sgf-status"><h2><Server size={19}/> Estado del servidor</h2><div className="sgf-status-ok"><span>●</span><div><strong>Servidor en marcha</strong><small>Conectado a SGF en la red local</small></div></div><dl><div><dt>Base de datos</dt><dd>{info?.dbMode?.toUpperCase() || "No disponible"}</dd></div><div><dt>Conexión</dt><dd>{info?.db?.ok ? "Correcta" : "Revisar"}</dd></div></dl><p>El servidor y las copias se administran desde el equipo principal.</p></aside>
    </div>
    <div className="sgf-bottom-note"><ShieldCheck size={26}/><div><strong>Sus datos, en el equipo principal</strong><p>SGF funciona sin conexión a internet. El servidor principal debe permanecer encendido.</p></div></div>
  </div>;
}

function Ayuda({ theme, toggle, admin }: { theme: "light" | "dark"; toggle: () => void; admin: boolean }) {
  return <div className="sgf-home"><div className="sgf-heading"><div><h1>Ajustes y guía</h1><p>Personalice su vista y consulte cómo utilizar SGF.</p></div></div>
    <div className="sgf-home-grid"><section className="sgf-panel"><h2>Apariencia</h2><p className="sgf-subtitle">El tema se guarda en este navegador.</p><button className="sgf-theme-setting" onClick={toggle}>{theme === "dark" ? <Sun size={19}/> : <Moon size={19}/>} Usar tema {theme === "dark" ? "claro" : "oscuro"}</button></section>
    <section className="sgf-panel"><h2>Guía rápida</h2><ol className="sgf-guide"><li>Inicie sesión con su cuenta.</li>{admin && <li>Cree las cuentas y permisos desde Usuarios.</li>}<li>Importe el Excel si tiene autorización.</li><li>Analice los PDF, revise la vista previa y decida si desea guardar; consulte el historial.</li><li>Consulte los datos importados en Datos de líneas si tiene permiso.</li><li>Consulte Estadísticas si tiene permiso.</li></ol><p className="sgf-subtitle">Las opciones de servidor y las copias se gestionan en la aplicación del equipo principal.</p></section></div></div>;
}

export default function App() {
  const server = useServerStatus(); const theme = useTheme(); const auth = useAuth();
  const [area, setArea] = useState<Area>("inicio"); const [sub, setSub] = useState<SubArea>("procesar");
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null); const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [refresh, setRefresh] = useState(0);
  const showToast = useCallback((type: "success" | "error" | "info", message: string) => { setToast({ type, message }); window.setTimeout(() => setToast(null), 4000); }, []);
  const triggerRefresh = useCallback(() => setRefresh(n => n + 1), []);
  const handleLogin = useCallback((u: string, p: string) => auth.login(u, p, machineId()), [auth]);
  const handleLogout = useCallback(async () => { await auth.logout(); setArea("inicio"); setSub("procesar"); }, [auth]);
  const puede = (p: string) => auth.user?.role === "admin" || !!auth.user?.permisos?.includes(p);

  if (server.status === "offline") return <ServerOfflineScreen onRetry={server.recheck} />;
  if (server.status === "checking" || auth.checking) return <div className="sgf-loading"><div className="sgf-loading-icon"><ReceiptText size={34}/></div><h1>SGF</h1><p>Preparando el sistema…</p><div className="sgf-spinner"/></div>;
  if (!auth.user) return <><Toast toast={toast}/><LoginScreen serverInfo={server.info} loginError={auth.error} onLogin={handleLogin} theme={theme.theme} onToggleTheme={theme.toggle}/></>;
  const user = auth.user;
  const areas = [
    {id:"inicio" as Area, label:"Inicio", icon:Home},
    ...(user.role === "admin" ? [{id:"servidor" as Area,label:"Servidor",icon:Server}] : []),
    {id:"facturas" as Area,label:"Facturas",icon:ReceiptText},
    ...(puede("ver_estadisticas") ? [{id:"estadisticas" as Area,label:"Estadísticas",icon:BarChart3}] : []),
    ...(puede("importar_excel") ? [{id:"importar" as Area,label:"Importar Excel",icon:FileSpreadsheet}] : []),
    ...(puede("importar_excel") ? [{id:"lineas" as Area,label:"Datos de líneas",icon:FileText}] : []),
    ...(user.role === "admin" ? [{id:"usuarios" as Area,label:"Usuarios",icon:Users}] : []),
    {id:"ajustes" as Area,label:"Ajustes y guía",icon:BookOpen},
  ];
  const irA = (next: Area) => { setArea(next); if (next === "facturas") setSub("procesar"); };
  const subTabs = [{id:"procesar" as SubArea,label:"Procesar PDF",icon:Upload},{id:"historial" as SubArea,label:"Historial",icon:History},{id:"servicios" as SubArea,label:"Buscar servicios",icon:FileSearch},...(user.role === "admin" ? [{id:"revision" as SubArea,label:"Revisión",icon:ClipboardList}] : [])];
  return <div className="sgf-layout"><Toast toast={toast}/>
    <aside className="sgf-sidebar"><div className="sgf-brand"><img src="/icono-sgf.png" alt=""/><div><strong>SGF</strong><span>Gestión de facturas</span></div></div>
      <nav aria-label="Navegación principal">{areas.map(({id,label,icon: Icon}) => <button type="button" key={id} className={area === id ? "active" : ""} aria-current={area === id ? "page" : undefined} title={label} aria-label={label} onClick={() => irA(id)}><Icon size={20}/><span>{label}</span></button>)}</nav>
      <div className="sgf-sidebar-footer"><ShieldCheck size={22}/><div><strong>Servidor en red</strong><span>Trabajando en su red</span></div></div>
    </aside>
    <div className="sgf-body"><header className="sgf-topbar"><div className="sgf-top-status"><span>●</span> Servidor en marcha <small>· {server.info?.dbMode?.toUpperCase() || "SGF"}</small></div><div className="sgf-top-actions"><button className="sgf-icon-button" onClick={theme.toggle} title={theme.theme === "light" ? "Activar tema oscuro" : "Activar tema claro"} aria-label={theme.theme === "light" ? "Activar tema oscuro" : "Activar tema claro"}>{theme.theme === "light" ? <Moon size={19}/> : <Sun size={19}/>}</button><div className="sgf-user"><span className="sgf-avatar">{(user.name || user.username).charAt(0).toUpperCase()}</span><div><strong>{user.name || user.username}</strong><small>{user.role === "admin" ? "Administrador" : "Usuario"}</small></div></div><button className="sgf-icon-button" onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={19}/></button></div></header>
      <main className="sgf-content">
        {area === "inicio" && <Inicio user={user} info={server.info} irA={irA} puede={puede}/>}
        {area === "facturas" && <><div className="sgf-page-head"><div><h1>Facturas</h1><p>Procese PDF, consulte el historial y busque sus servicios.</p></div></div><div className="sgf-subnav" aria-label="Opciones de facturas">{subTabs.map(({id,label,icon:Icon}) => <button key={id} onClick={() => setSub(id)} className={sub === id ? "active" : ""}><Icon size={17}/>{label}</button>)}</div>
          {sub === "procesar" && <ProcesarTab showToast={showToast} trig={triggerRefresh}/>}
          {sub === "historial" && <HistorialTab showToast={showToast} refresh={refresh} canEdit={puede("editar_facturas")} onEdit={setEditingInvoice}/>}
          {sub === "servicios" && <ServiciosTab showToast={showToast} onEdit={puede("editar_facturas") ? setEditingInvoice : undefined}/>}
          {sub === "revision" && user.role === "admin" && <RevisionQueueTab showToast={showToast} refresh={refresh} onEdit={setEditingInvoice}/>}
        </>}
        {area === "estadisticas" && puede("ver_estadisticas") && <><div className="sgf-page-head"><h1>Estadísticas</h1><p>Consumo por meses, líneas sin consumo y gasto por oficial.</p></div><EstadisticasTab/></>}
        {area === "importar" && puede("importar_excel") && <><div className="sgf-page-head"><h1>Importar Excel</h1><p>Cargue las líneas para cruzarlas con las facturas.</p></div><ImportarExcelTab showToast={showToast} canEdit={puede("editar_facturas")}/></>}
        {area === "lineas" && puede("importar_excel") && <><div className="sgf-page-head"><h1>Datos de líneas</h1><p>Consulte el contenido del catálogo importado.</p></div><CatalogoLineas/></>}
        {area === "usuarios" && user.role === "admin" && <><div className="sgf-page-head"><h1>Usuarios</h1><p>Administre las cuentas y sus permisos.</p></div><UsuariosTab currentUser={user} showToast={showToast} onEdited={triggerRefresh} onEdit={setEditingUser} refresh={refresh}/></>}
        {area === "servidor" && user.role === "admin" && <><div className="sgf-page-head"><h1>Servidor</h1><p>Estado de la conexión y auditoría.</p></div><div className="sgf-panel sgf-server-card"><Database size={22}/><div><strong>Servidor conectado · {server.info?.dbMode?.toUpperCase()}</strong><p>Para iniciar o detener el servidor, configurar el puerto o crear copias de seguridad, use la aplicación instalada en el equipo principal.</p></div><button className="sgf-outline" onClick={server.recheck}><RefreshCw size={16}/> Actualizar</button></div><div className="sgf-section-title">Auditoría</div><LogsTab/></>}
        {area === "ajustes" && <Ayuda theme={theme.theme} toggle={theme.toggle} admin={user.role === "admin"}/>}
      </main><footer className="sgf-footer">SGF · Sistema de Gestión de Facturas <span>Los datos permanecen en el equipo principal</span></footer>
    </div>
    {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={() => {setEditingUser(null);triggerRefresh();}} showToast={showToast}/>}
    {editingInvoice && <EditInvoiceModal invoice={editingInvoice} onClose={() => setEditingInvoice(null)} onSaved={() => {setEditingInvoice(null);triggerRefresh();}} showToast={showToast}/>}
  </div>;
}
