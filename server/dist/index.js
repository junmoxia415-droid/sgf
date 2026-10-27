import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { APP_CONFIG, SERVER_CONFIG } from "./config/index.js";
import { closeDb, getDbMode, initDatabase, pingDb } from "./models/database.js";
import { authenticate, authenticateOpcional, sendJson } from "./middleware/auth.js";
import { esConsolaLocal, esPeticionLocal } from "./middleware/local.js";
import { handlePanelBienvenida, handlePanelCopia, handlePanelEstado, handlePanelPing } from "./routes/panel.routes.js";
import { handleLogin, handleLogout, handleMe } from "./routes/auth.routes.js";
import { handleDbConfig, handleDbConnect, handleDbDisconnect, handleDbTest } from "./routes/dbconfig.routes.js";
import { handleCreateFactura, handleDeleteFactura, handleFacturaStats, handleGetFactura, handleGetFacturas, handleUpdateFactura, } from "./routes/facturas.routes.js";
import { handleClearLogs, handleGetLogs } from "./routes/logs.routes.js";
import { handleBuscarLineas, handleSearchServicios } from "./routes/services.routes.js";
import { handleUploadFactura } from "./routes/upload.routes.js";
import { handleCreateUser, handleDeleteUser, handleGetUsers, handleUpdateUser } from "./routes/users.routes.js";
import { handleMigrateFromSqlite, handleMigrateStatus } from "./routes/migrate.routes.js";
import { handleImportAnalyze, handleImportExcel, handleImportMappingSuggestions, handleImportStatus, handleImportTables } from "./routes/import.routes.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST_DIR = path.resolve(__dirname, "../../client/dist");
const SERVER_INSTANCE_ID = randomUUID();
const dbInfo = await initDatabase();
console.log(`[SGF] BD: ${dbInfo.mode.toUpperCase()} ${dbInfo.ok ? "OK" : "ERROR"}`);
const MIME = {
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
async function serveStatic(req, res, url) {
    let requestPath = decodeURIComponent(url.pathname || "/");
    if (requestPath === "/")
        requestPath = "/index.html";
    const filePath = path.normalize(path.join(CLIENT_DIST_DIR, requestPath));
    if (!filePath.startsWith(CLIENT_DIST_DIR)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }
    try {
        const content = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(content);
        return;
    }
    catch {
        // SPA fallback
    }
    try {
        const indexFile = path.join(CLIENT_DIST_DIR, "index.html");
        const content = await fs.readFile(indexFile);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(content);
    }
    catch {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Frontend no compilado. Falta client/dist/index.html");
    }
}
const server = http.createServer({ requestTimeout: SERVER_CONFIG.requestTimeoutMs }, async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Max-Age": "86400",
        });
        return res.end();
    }
    if (!req.url)
        return sendJson(res, 400, { success: false, error: "URL invalida." });
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
            if (requestPath === "/api/panel/bienvenida" && req.method === "GET")
                return handlePanelBienvenida(req, res);
            if (requestPath === "/api/panel/estado" && req.method === "GET")
                return handlePanelEstado(req, res);
            if (requestPath === "/api/panel/copia" && req.method === "POST")
                return handlePanelCopia(req, res);
            if (requestPath === "/api/panel/ping" && req.method === "GET")
                return handlePanelPing(req, res);
            return sendJson(res, 404, { success: false, error: "Ruta de panel desconocida." });
        }
        if (requestPath === "/api/auth/login" && req.method === "POST")
            return handleLogin(req, res);
        // La consola de escritorio (token en cabecera, solo loopback) puede
        // administrar la base de datos sin sesion: es quien arranco el servidor.
        // NO se le inventa un usuario, para que no pueda leer ni escribir las
        // facturas de nadie: solo configuracion.
        if (esConsolaLocal(req)) {
            req.consoleLocal = "1";
        }
        // Rutas de configuracion de BD: siguen fuera de authenticate() para permitir
        // la configuracion inicial, pero se identifica al usuario si trae token y
        // cada handler decide (admin / token de instalacion / solo instalacion nueva).
        if (requestPath.startsWith("/api/db/") && ["/api/db/test", "/api/db/config", "/api/db/connect", "/api/db/disconnect"].includes(requestPath)) {
            await authenticateOpcional(req, res);
        }
        if (requestPath === "/api/db/test" && req.method === "POST")
            return handleDbTest(req, res);
        if (requestPath === "/api/db/config" && req.method === "GET")
            return handleDbConfig(req, res);
        if (requestPath === "/api/db/connect" && req.method === "POST")
            return handleDbConnect(req, res);
        if (requestPath === "/api/db/disconnect" && req.method === "POST")
            return handleDbDisconnect(req, res);
        const user = await authenticate(req, res);
        if (!user)
            return;
        if (requestPath === "/api/auth/me" && req.method === "GET")
            return handleMe(req, res);
        if (requestPath === "/api/auth/logout" && req.method === "POST")
            return handleLogout(req, res);
        if (requestPath === "/api/users" && req.method === "GET")
            return handleGetUsers(req, res);
        if (requestPath === "/api/users" && req.method === "POST")
            return handleCreateUser(req, res);
        const userMatch = requestPath.match(/^\/api\/users\/([a-f0-9-]+)$/i);
        if (userMatch && req.method === "PUT")
            return handleUpdateUser(req, res, userMatch[1]);
        if (userMatch && req.method === "DELETE")
            return handleDeleteUser(req, res, userMatch[1]);
        if (requestPath === "/api/facturas" && req.method === "GET")
            return handleGetFacturas(req, res, url);
        if (requestPath === "/api/facturas/stats" && req.method === "GET")
            return handleFacturaStats(req, res);
        if (requestPath === "/api/facturas/upload" && req.method === "POST")
            return handleUploadFactura(req, res);
        if (requestPath === "/api/facturas" && req.method === "POST")
            return handleCreateFactura(req, res);
        const facturaMatch = requestPath.match(/^\/api\/facturas\/(.+)$/i);
        if (facturaMatch && req.method === "GET")
            return handleGetFactura(req, res, decodeURIComponent(facturaMatch[1]));
        if (facturaMatch && req.method === "PUT")
            return handleUpdateFactura(req, res, decodeURIComponent(facturaMatch[1]));
        if (facturaMatch && req.method === "DELETE")
            return handleDeleteFactura(req, res, decodeURIComponent(facturaMatch[1]));
        if (requestPath === "/api/services/search" && req.method === "GET")
            return handleSearchServicios(req, res, url);
        if (requestPath === "/api/lineas" && req.method === "GET")
            return handleBuscarLineas(req, res, url);
        if (requestPath === "/api/logs" && req.method === "GET")
            return handleGetLogs(req, res, url);
        if (requestPath === "/api/logs" && req.method === "DELETE")
            return handleClearLogs(req, res);
        if (requestPath === "/api/db/migrate/status" && req.method === "GET")
            return handleMigrateStatus(req, res);
        if (requestPath === "/api/db/migrate/from-sqlite" && req.method === "POST")
            return handleMigrateFromSqlite(req, res);
        if (requestPath === "/api/import/analyze" && req.method === "POST")
            return handleImportAnalyze(req, res);
        if (requestPath === "/api/import/excel" && req.method === "POST")
            return handleImportExcel(req, res, url);
        if (requestPath === "/api/import/tables" && req.method === "GET")
            return handleImportTables(req, res);
        if (requestPath === "/api/import/mapping-suggestions" && req.method === "POST")
            return handleImportMappingSuggestions(req, res);
        if (requestPath === "/api/import/status" && req.method === "GET")
            return handleImportStatus(req, res);
        return sendJson(res, 404, { success: false, error: "Ruta no encontrada." });
    }
    catch (error) {
        console.error("[SGF] Error:", error.message);
        if (!res.headersSent)
            sendJson(res, 500, { success: false, error: `Error interno: ${error.message}` });
    }
});
function shutdown(signal) {
    console.log(`\n[SGF] Senal ${signal}. Cerrando...`);
    server.close(async () => {
        await closeDb();
        console.log("[SGF] Cerrado.");
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => console.error("[SGF] Unhandled rejection:", reason));
process.on("uncaughtException", (error) => console.error("[SGF] Uncaught exception:", error));
server.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
    console.log(`[SGF] http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port} | BD: ${dbInfo.mode.toUpperCase()}`);
});
//# sourceMappingURL=index.js.map