import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sendJson } from "../middleware/auth.js";
import { esConsolaLocal, esPeticionLocal, tokenConsolaConfigurado } from "../middleware/local.js";
import { esInstalacionNueva } from "../middleware/auth.js";
import { getDbMode, pingDb, query } from "../models/database.js";
/**
 * Panel de control de la consola de escritorio (app Flutter).
 *
 * Solo responde a peticiones de ESTE equipo (loopback) y, salvo el diagnostico
 * basico, exige el token de consola. Devuelve todo lo que la aplicacion necesita
 * para pintar el panel sin hablar con la base de datos directamente.
 */
const INICIO = Date.now();
/**
 * Las rutas del panel exigen el token de consola cuando el servidor se ha
 * arrancado desde la aplicacion. Si el servidor se arranco a mano (sin token
 * configurado), basta con ser una peticion de este equipo.
 */
function guardiaPanel(req, res) {
    if (!esPeticionLocal(req)) {
        sendJson(res, 403, { success: false, error: "El panel solo responde en este equipo." });
        return false;
    }
    if (tokenConsolaConfigurado() && !esConsolaLocal(req)) {
        sendJson(res, 403, { success: false, error: "Falta el token de la consola local." });
        return false;
    }
    return true;
}
function carpetas() {
    const datos = process.env.SGF_DATA_DIR ? path.resolve(process.env.SGF_DATA_DIR) : "";
    const env = process.env.SGF_ENV_FILE ? path.resolve(process.env.SGF_ENV_FILE) : "";
    return { datos, env };
}
function tamanoCarpeta(dir) {
    let bytes = 0;
    let archivos = 0;
    try {
        for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
            const completo = path.join(dir, entrada.name);
            if (entrada.isDirectory()) {
                const sub = tamanoCarpeta(completo);
                bytes += sub.bytes;
                archivos += sub.archivos;
            }
            else if (entrada.isFile()) {
                bytes += fs.statSync(completo).size;
                archivos += 1;
            }
        }
    }
    catch {
        // carpeta inexistente o sin permisos
    }
    return { bytes, archivos };
}
export async function handlePanelEstado(req, res) {
    if (!guardiaPanel(req, res))
        return;
    const ping = await pingDb();
    const { datos, env } = carpetas();
    const disco = tamanoCarpeta(datos);
    let usuarios = 0;
    let facturas = 0;
    let servicios = 0;
    let lineasExcel = 0;
    try {
        const [u] = await query("SELECT COUNT(*) AS CNT FROM SGF_USUARIOS");
        const [f] = await query("SELECT COUNT(*) AS CNT FROM SGF_FACTURAS");
        const [s] = await query("SELECT COUNT(*) AS CNT FROM SGF_SERVICIOS");
        usuarios = Number(u?.CNT ?? u?.cnt ?? 0);
        facturas = Number(f?.CNT ?? f?.cnt ?? 0);
        servicios = Number(s?.CNT ?? s?.cnt ?? 0);
    }
    catch {
        // tablas aun sin crear
    }
    try {
        const [l] = await query("SELECT COUNT(*) AS CNT FROM SGF_LINEAS_IMPORTADAS");
        lineasExcel = Number(l?.CNT ?? l?.cnt ?? 0);
    }
    catch {
        lineasExcel = 0;
    }
    let ultimaCopia = null;
    try {
        const copias = fs
            .readdirSync(datos)
            .filter((f) => f.startsWith("copia-") && f.endsWith(".db"))
            .map((f) => ({ f, t: fs.statSync(path.join(datos, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t);
        ultimaCopia = copias[0]?.f ?? null;
    }
    catch {
        ultimaCopia = null;
    }
    return sendJson(res, 200, {
        success: true,
        data: {
            version: "4.0.0",
            pid: process.pid,
            uptimeSegundos: Math.round((Date.now() - INICIO) / 1000),
            puerto: Number(process.env.PORT) || 3000,
            modoBd: getDbMode(),
            bd: ping,
            consolaHabilitada: tokenConsolaConfigurado(),
            contadores: { usuarios, facturas, servicios, lineasExcel },
            disco: { carpetaDatos: datos, archivoEnv: env, bytes: disco.bytes, archivos: disco.archivos },
            ultimaCopia,
            equipo: { nombre: os.hostname(), plataforma: `${os.platform()} ${os.release()}` },
            memoriaMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
    });
}
/** Copia de seguridad de la base SQLite (solo en modo sqlite y solo en este equipo). */
export async function handlePanelCopia(req, res) {
    if (!guardiaPanel(req, res))
        return;
    if (getDbMode() !== "sqlite") {
        return sendJson(res, 400, {
            success: false,
            error: "La copia automatica solo esta disponible en modo SQLite. En Oracle/SQL Server use las herramientas del servidor.",
        });
    }
    const { datos } = carpetas();
    if (!datos)
        return sendJson(res, 400, { success: false, error: "No se ha definido la carpeta de datos." });
    const origen = path.join(datos, "sgf-data.db");
    if (!fs.existsSync(origen)) {
        return sendJson(res, 404, { success: false, error: "Todavia no existe la base de datos." });
    }
    const marca = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const destino = path.join(datos, `copia-${marca}.db`);
    try {
        // flushDisk() fuerza el volcado en memoria -> disco antes de copiar.
        fs.copyFileSync(origen, destino);
        // Se conservan las 10 copias mas recientes.
        const copias = fs
            .readdirSync(datos)
            .filter((f) => f.startsWith("copia-") && f.endsWith(".db"))
            .map((f) => ({ f, t: fs.statSync(path.join(datos, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t);
        for (const vieja of copias.slice(10)) {
            try {
                fs.unlinkSync(path.join(datos, vieja.f));
            }
            catch {
                // ignora
            }
        }
        return sendJson(res, 200, {
            success: true,
            message: `Copia creada: ${path.basename(destino)}`,
            data: { archivo: path.basename(destino), bytes: fs.statSync(destino).size },
        });
    }
    catch (error) {
        return sendJson(res, 500, { success: false, error: `No se pudo crear la copia: ${error.message}` });
    }
}
/** Datos para el asistente de primera vez: ¿ya hay algo configurado? */
export async function handlePanelBienvenida(req, res) {
    if (!guardiaPanel(req, res))
        return;
    const { datos, env } = carpetas();
    const dbFile = datos ? path.join(datos, "sgf-data.db") : "";
    const existeBd = dbFile ? fs.existsSync(dbFile) : false;
    let usuarios = 0;
    try {
        const [u] = await query("SELECT COUNT(*) AS CNT FROM SGF_USUARIOS");
        usuarios = Number(u?.CNT ?? u?.cnt ?? 0);
    }
    catch {
        usuarios = 0;
    }
    return sendJson(res, 200, {
        success: true,
        data: {
            modoBd: getDbMode(),
            existeBd,
            archivoBd: dbFile,
            archivoEnv: env,
            hayEnv: Boolean(env && fs.existsSync(env)),
            usuarios,
            // Pista para el asistente de primera vez: no hay base de datos o solo
            // existe el administrador por defecto (nadie ha configurado nada aun).
            primeraVez: !existeBd || usuarios === 0 || (await esInstalacionNueva()),
        },
    });
}
/** Marca de vida para que la app sepa que el servidor responde y con que identidad. */
export async function handlePanelPing(req, res) {
    if (!esPeticionLocal(req)) {
        return sendJson(res, 403, { success: false, error: "Solo en este equipo." });
    }
    return sendJson(res, 200, {
        success: true,
        data: { servicio: "sgf-consola", consolaHabilitada: tokenConsolaConfigurado(), pid: process.pid },
    });
}
//# sourceMappingURL=panel.routes.js.map