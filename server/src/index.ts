import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { APP_CONFIG, SERVER_CONFIG } from "./config/index.js";
import { closeDb, DATA_DIR, getDbMode, initDatabase, pingDb } from "./models/database.js";
import { BloqueoDatos } from "./utils/bloqueo-datos.js";
import { iniciarControlTls } from "./utils/control-tls.js";
import { prepararEscuchaRedSegura } from "./utils/escucha-red-segura.js";
import { ErrorSeleccionBase } from "./utils/seleccion-base.js";
import type { Server as ServidorTls } from 'node:https';
import { iniciarNombreRed, detenerNombreRed, nombrePersistido } from "./utils/nombre-red.js";
import { authenticate, authenticateOpcional, sendJson } from "./middleware/auth.js";
import { esConsolaLocal, esPeticionLocal, esRedPrivada, tokenConsolaConfigurado } from "./middleware/local.js";
import { handlePanelBienvenida, handlePanelCopia, handlePanelEstado, handlePanelPeriodos, handlePanelPing } from "./routes/panel.routes.js";
import type { AuthenticatedRequest } from "./middleware/auth.js";
import { handleLogin, handleLogout, handleMe } from "./routes/auth.routes.js";
import { handleDbConfig, handleDbConnect, handleDbDisconnect, handleDbTest } from "./routes/dbconfig.routes.js";
import {
  handleCreateFactura,
  handleDeleteFactura,
  handleFacturaStats,
  handleGetFactura,
  handleGetFacturas,
  handleUpdateFactura,
} from "./routes/facturas.routes.js";
import { handleInicioResumen } from "./routes/inicio.routes.js";
import { handleClearLogs, handleGetLogs } from "./routes/logs.routes.js";
import { handleEstadisticasMeses } from "./routes/estadisticas.routes.js";
import { handleSetupAdmin, handleSetupEstado } from "./routes/setup.routes.js";
import { handleBuscarLineas, handleCatalogoLineas, handleSearchServicios } from "./routes/services.routes.js";
import { handleUploadFactura } from "./routes/upload.routes.js";
import { handleCreateUser, handleDeleteUser, handleGetUsers, handleUpdateUser } from "./routes/users.routes.js";
import { handleMigrateFromSqlite, handleMigrateStatus } from "./routes/migrate.routes.js";
import { handleImportAnalyze, handleImportExcel, handleImportMappingSuggestions, handleImportStatus, handleImportTables } from "./routes/import.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST_DIR = path.resolve(__dirname, "../../client/dist");
const SERVER_INSTANCE_ID = randomUUID();
// Reservar la carpeta ANTES de leer o modificar SQLite; el puerto no basta
// para impedir dos servidores trabajando sobre los mismos archivos.
let bloqueoDatos: BloqueoDatos;
try { bloqueoDatos = BloqueoDatos.adquirir(DATA_DIR); }
catch (error:any) {
  console.error(`[SGF] No se inició el servidor: ${error?.message || 'no se pudo proteger la carpeta de datos.'}`);
  process.exit(1);
}
let dbInfo: Awaited<ReturnType<typeof initDatabase>>;
try { dbInfo = await initDatabase(); }
catch (error) {
  if (error instanceof ErrorSeleccionBase) {
    // Mensaje acotado, sin credenciales ni detalles devueltos por el driver.
    console.log(`[SGF_DB_ERROR] ${error.motivo}:${error.motor || 'ninguno'}`);
    console.error(`[SGF] ${error.message}`);
  } else {
    console.error('[SGF] No se pudo inicializar la base de datos. Revise el registro local y la configuración.');
  }
  bloqueoDatos.cerrar();
  process.exitCode = 1;
  // Vaciar el diagnóstico para la interfaz antes de terminar. Los drivers
  // pueden mantener temporizadores internos; nunca continuar sin la base.
  await new Promise<void>(resolve => process.stdout.write('', () => resolve()));
  process.exit(1);
}
  try {
    // Columnas para "facturas por mes" en bases ya existentes (Oracle/SQL Server).
    const { asegurarColumnasPeriodo } = await import("./utils/facturas-periodo.js");
    await asegurarColumnasPeriodo();
  } catch (error: any) {
    console.warn("[SGF] No se pudieron preparar las columnas de periodo:", error?.message);
  }
console.log(`[SGF] BD: ${dbInfo.mode.toUpperCase()} ${dbInfo.ok ? "OK" : "ERROR"}`);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function serveStatic(req: AuthenticatedRequest, res: http.ServerResponse, url: URL) {
  let requestPath = decodeURIComponent(url.pathname || "/");
  if (requestPath === "/") requestPath = "/index.html";

  const filePath = path.normalize(path.join(CLIENT_DIST_DIR, requestPath));
  if (!filePath.startsWith(CLIENT_DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache, no-store, must-revalidate" : "public, max-age=3600" });
    res.end(content);
    return;
  } catch {
    // SPA fallback
  }

  try {
    const indexFile = path.join(CLIENT_DIST_DIR, "index.html");
    const content = await fs.readFile(indexFile);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Frontend no compilado. Falta client/dist/index.html");
  }
}

const server = http.createServer(
  { requestTimeout: SERVER_CONFIG.requestTimeoutMs },
  async (req: AuthenticatedRequest, res: http.ServerResponse) => {
    if (cerrando) return sendJson(res, 503, {success:false,error:'El servidor se está cerrando.'});
    if (!esRedPrivada(req)) return sendJson(res, 403, { success: false, error: "Acceso permitido solo desde redes privadas." });
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "86400",
      });
      return res.end();
    }

    if (!req.url) return sendJson(res, 400, { success: false, error: "URL invalida." });
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const requestPath = url.pathname;

    try {
      if (!requestPath.startsWith("/api/")) {
        return await serveStatic(req, res, url);
      }

      if (requestPath === "/api/health" && req.method === "GET") {
        const ping = await pingDb();
        return sendJson(res, 200, {
          success: true,
          data: {
            service: APP_CONFIG.name,
            version: APP_CONFIG.version,
            status: "online",
            dbMode: getDbMode(),
            db: ping,
            instanceId: SERVER_INSTANCE_ID,
            uptime: process.uptime(),
            memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          },
        });
      }

      // ── Panel de la consola local (app de escritorio) ─────────────────────
      // Solo responde a peticiones de este mismo equipo.
      if (requestPath.startsWith("/api/panel/")) {
        if (!esPeticionLocal(req)) {
          return sendJson(res, 403, { success: false, error: "El panel solo responde en este equipo." });
        }
        if (requestPath !== "/api/panel/ping" && req.headers.authorization) {
          const sesionPanel = await authenticate(req, res);
          if (!sesionPanel) return;
          if (sesionPanel.role !== "admin") return sendJson(res, 403, { success: false, error: "Se requiere rol de administrador." });
        }
        if (requestPath === "/api/panel/bienvenida" && req.method === "GET") return handlePanelBienvenida(req, res);
        if (requestPath === "/api/panel/estado" && req.method === "GET") return handlePanelEstado(req, res);
        if (requestPath === "/api/panel/copia" && req.method === "POST") return handlePanelCopia(req, res);
        if (requestPath === "/api/panel/ping" && req.method === "GET") return handlePanelPing(req, res);
        if (requestPath === "/api/panel/apagar" && req.method === "POST") {
          if (!esConsolaLocal(req)) return sendJson(res, 403, { success: false, error: "Solo la consola local puede detener el servidor." });
          sendJson(res, 200, { success: true, message: "Guardando datos y cerrando el servidor." });
          setImmediate(() => shutdown("consola local"));
          return;
        }
        if (requestPath === "/api/panel/periodos") return handlePanelPeriodos(req, res);
        return sendJson(res, 404, { success: false, error: "Ruta de panel desconocida." });
      }

      // ── Configuracion de la primera vez ───────────────────────────────────
      // Estas dos rutas NO piden sesión: son las que crean la primera cuenta en
      // una instalación nueva (la base arranca sin usuarios). En cuanto existe
      // una cuenta, POST /api/setup/admin responde 409.
      if (requestPath.startsWith("/api/setup/") && (!esPeticionLocal(req) || (tokenConsolaConfigurado() && !esConsolaLocal(req)))) {
        return sendJson(res, 403, { success: false, error: "La configuración inicial solo se permite en la consola de este equipo." });
      }
      if (requestPath === "/api/setup/estado" && req.method === "GET") return handleSetupEstado(req as AuthenticatedRequest, res);
      if (requestPath === "/api/setup/admin" && req.method === "POST") return handleSetupAdmin(req as AuthenticatedRequest, res);

      if (requestPath === "/api/auth/login" && req.method === "POST") return handleLogin(req, res);

      // La consola de escritorio (token en cabecera, solo loopback) puede
      // administrar la base de datos sin sesion: es quien arranco el servidor.
      // NO se le inventa un usuario, para que no pueda leer ni escribir las
      // facturas de nadie: solo configuracion.
      if (esConsolaLocal(req)) {
        (req as any).consoleLocal = "1";
      }

      // Rutas de configuracion de BD: siguen fuera de authenticate() para permitir
      // la configuracion inicial, pero se identifica al usuario si trae token y
      // cada handler decide (admin / token de instalacion / solo instalacion nueva).
      if (requestPath.startsWith("/api/db/") && ["/api/db/test", "/api/db/config", "/api/db/connect", "/api/db/disconnect"].includes(requestPath)) {
        await authenticateOpcional(req, res);
      }
      if (requestPath === "/api/db/test" && req.method === "POST") return handleDbTest(req, res);
      if (requestPath === "/api/db/config" && req.method === "GET") return handleDbConfig(req, res);
      if (requestPath === "/api/db/connect" && req.method === "POST") return handleDbConnect(req, res);
      if (requestPath === "/api/db/disconnect" && req.method === "POST") return handleDbDisconnect(req, res);

      const user = await authenticate(req, res);
      if (!user) return;

      if (requestPath === "/api/inicio/resumen" && req.method === "GET") return handleInicioResumen(req, res);
      if (requestPath === "/api/auth/me" && req.method === "GET") return handleMe(req, res);
      if (requestPath === "/api/auth/logout" && req.method === "POST") return handleLogout(req, res);

      if (requestPath === "/api/users" && req.method === "GET") return handleGetUsers(req, res);
      if (requestPath === "/api/users" && req.method === "POST") return handleCreateUser(req, res);
      const userMatch = requestPath.match(/^\/api\/users\/([a-f0-9-]+)$/i);
      if (userMatch && req.method === "PUT") return handleUpdateUser(req, res, userMatch[1]);
      if (userMatch && req.method === "DELETE") return handleDeleteUser(req, res, userMatch[1]);

      if (requestPath === "/api/facturas" && req.method === "GET") return handleGetFacturas(req, res, url);
      if (requestPath === "/api/facturas/stats" && req.method === "GET") return handleFacturaStats(req, res);
      // Estadisticas por meses con seleccion de meses (consumo y ceros).
      if (requestPath === "/api/estadisticas/meses" && req.method === "GET") return handleEstadisticasMeses(req, res, url);
      if (requestPath === "/api/facturas/upload" && req.method === "POST") return handleUploadFactura(req, res);
      if (requestPath === "/api/facturas" && req.method === "POST") return handleCreateFactura(req, res);
      const facturaMatch = requestPath.match(/^\/api\/facturas\/(.+)$/i);
      if (facturaMatch && req.method === "GET") return handleGetFactura(req, res, decodeURIComponent(facturaMatch[1]));
      if (facturaMatch && req.method === "PUT") return handleUpdateFactura(req, res, decodeURIComponent(facturaMatch[1]));
      if (facturaMatch && req.method === "DELETE") return handleDeleteFactura(req, res, decodeURIComponent(facturaMatch[1]));

      if (requestPath === "/api/services/search" && req.method === "GET") return handleSearchServicios(req, res, url);
      if (requestPath === "/api/lineas/catalogo" && req.method === "GET") return handleCatalogoLineas(req, res, url);
      if (requestPath === "/api/lineas" && req.method === "GET") return handleBuscarLineas(req, res, url);

      if (requestPath === "/api/logs" && req.method === "GET") return handleGetLogs(req, res, url);
      if (requestPath === "/api/logs" && req.method === "DELETE") return handleClearLogs(req, res);

      if (requestPath === "/api/db/migrate/status" && req.method === "GET") return handleMigrateStatus(req, res);
      if (requestPath === "/api/db/migrate/from-sqlite" && req.method === "POST") return handleMigrateFromSqlite(req, res);

      if (requestPath === "/api/import/analyze" && req.method === "POST") return handleImportAnalyze(req, res);
      if (requestPath === "/api/import/excel" && req.method === "POST") return handleImportExcel(req, res, url);
      if (requestPath === "/api/import/tables" && req.method === "GET") return handleImportTables(req, res);
      if (requestPath === "/api/import/mapping-suggestions" && req.method === "POST") return handleImportMappingSuggestions(req, res);
      if (requestPath === "/api/import/status" && req.method === "GET") return handleImportStatus(req, res);

      return sendJson(res, 404, { success: false, error: "Ruta no encontrada." });
    } catch (error: any) {
      console.error("[SGF] Error:", error.message);
      if (!res.headersSent) sendJson(res, 500, { success: false, error: `Error interno: ${error.message}` });
    }
  },
);

// Modo de red HTTPS experimental, activado solo expresamente por el
// laboratorio. Si faltan archivos o no corresponden, nunca se abre HTTP.
const usarHttpsRed = process.env.SGF_LAN_TLS === '1';
let receptorRed:ServidorTls|typeof server=server;
if(usarHttpsRed) {
  try {
    const nombre=String(process.env.SGF_LAN_TLS_NOMBRE||'');
    if(`${nombrePersistido(DATA_DIR)}.local`!==nombre) throw new Error('Nombre de certificado distinto de la identidad persistida.');
    receptorRed=prepararEscuchaRedSegura(server,String(process.env.SGF_LAN_TLS_CERT||''),String(process.env.SGF_LAN_TLS_KEY||''),nombre);
  } catch {
    console.error('[SGF] No se inició: la identidad HTTPS de la red falta o no es válida. No se abrió HTTP.');
    try { await closeDb(); } catch { console.error('[SGF] No se pudo confirmar el guardado de la base.'); }
    bloqueoDatos.cerrar();
    process.exit(1);
  }
}
let cerrando = false;
let controlTls:ServidorTls|null=null;
function shutdown(signal: string, estadoInicial=0) {
  if (cerrando) return;
  cerrando = true;
  console.log(`\n[SGF] Senal ${signal}. Cerrando...`);
  // Dejar de aceptar peticiones en ambos canales antes de guardar y liberar
  // la carpeta: la consola TLS no debe seguir escribiendo al cerrar HTTP.
  const cerrar=(s:ServidorTls|typeof server)=>new Promise<void>((resolve)=>s.close(()=>resolve()));
  void (async()=>{
    let estado=estadoInicial;
    try {
      await Promise.all([cerrar(receptorRed),...(controlTls?[cerrar(controlTls)]:[])]);
      await closeDb();
      try { await detenerNombreRed(); } catch (error) { console.warn('[SGF] No se pudo cerrar el anuncio de red:', error); }
    } catch(error) { console.error('[SGF] Error durante el cierre:',error); estado=1; }
    try { bloqueoDatos.cerrar(); } catch(error) { console.error('[SGF] No se pudo liberar el bloqueo:',error); estado=1; }
    console.log("[SGF] Cerrado.");
    process.exit(estado);
  })();
  setTimeout(() => process.exit(1), 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => console.error("[SGF] Unhandled rejection:", reason));
process.on("uncaughtException", (error) => console.error("[SGF] Uncaught exception:", error));

receptorRed.on('error', async error => {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') console.log('[SGF_PUERTO_OCUPADO]');
  console.error('[SGF] No se pudo abrir el puerto:',error.message);
  try { await closeDb(); } catch (e) { console.error('[SGF] Error al cerrar la base:',e); }
  try { bloqueoDatos.cerrar(); } catch (e) { console.error('[SGF] Error al liberar el bloqueo:',e); }
  await new Promise<void>(resolve => process.stdout.write('', () => resolve()));
  process.exit(1);
});

receptorRed.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, async () => {
  if(process.env.SGF_CONTROL_TLS==='1') {
    try {
      const nuevo=await iniciarControlTls(server,String(process.env.SGF_CONSOLE_TOKEN || ''));
      if(cerrando) {nuevo.close();return;}
      controlTls=nuevo;
      nuevo.on('error',(error)=>{console.error('[SGF] Falló el canal local seguro:',error.message);shutdown('fallo del canal local',1);});
    } catch(error:any) {
      console.error('[SGF] No se pudo iniciar el canal local seguro:',error?.message || 'error desconocido');
      shutdown('fallo del canal local',1);return;
    }
  }
  const protocolo=usarHttpsRed?'https':'http';
  console.log(`[SGF] ${protocolo}://${SERVER_CONFIG.host}:${SERVER_CONFIG.port} | BD: ${dbInfo.mode.toUpperCase()}`);
  iniciarNombreRed(process.env.SGF_DATA_DIR || '', SERVER_CONFIG.port, SERVER_CONFIG.host, protocolo);
});
