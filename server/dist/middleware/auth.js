import { safeVerifyToken } from "../utils/jwt.js";
import { execute, getDbMode, query } from "../models/database.js";
/**
 * Nucleo de autenticacion.
 * - respondiendo=true : comportamiento clasico de las rutas protegidas (401/503).
 * - respondiendo=false: autenticacion OPCIONAL; si no hay token o no es valido
 *   devuelve null sin escribir la respuesta. Se usa en las rutas de
 *   configuracion de BD, que se registran antes de authenticate() para permitir
 *   el flujo de instalacion, pero que deben reconocer al administrador logueado.
 */
async function autenticarNucleo(req, res, respondiendo) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
        if (respondiendo)
            sendJson(res, 401, { success: false, error: "Token no proporcionado." });
        return null;
    }
    const user = safeVerifyToken(token);
    if (!user) {
        if (respondiendo)
            sendJson(res, 401, { success: false, error: "Token invalido o expirado." });
        return null;
    }
    try {
        const dbMode = getDbMode();
        const rows = dbMode === "oracle"
            ? await query(`SELECT ID FROM SGF_SESIONES
           WHERE SESSION_TOKEN = :t AND ACTIVE = 1 AND EXPIRES_AT > SYSTIMESTAMP`, { t: token })
            : dbMode === "mssql"
                ? await query(`SELECT ID FROM SGF_SESIONES
             WHERE SESSION_TOKEN = :t AND ACTIVE = 1 AND EXPIRES_AT > SYSUTCDATETIME()`, { t: token })
                : await query(`SELECT ID FROM SGF_SESIONES
             WHERE TOKEN = :t AND ACTIVO = 1 AND EXPIRA > datetime('now')`, { t: token });
        if (rows.length === 0) {
            if (respondiendo)
                sendJson(res, 401, { success: false, error: "Sesion expirada o cerrada." });
            return null;
        }
        if (dbMode === "oracle") {
            await execute(`UPDATE SGF_SESIONES SET EXPIRES_AT = SYSTIMESTAMP + INTERVAL '8' HOUR WHERE SESSION_TOKEN = :t`, { t: token });
        }
        else if (dbMode === "mssql") {
            await execute(`UPDATE SGF_SESIONES SET EXPIRES_AT = DATEADD(HOUR, 8, SYSUTCDATETIME()) WHERE SESSION_TOKEN = :t`, { t: token });
        }
        else {
            await execute(`UPDATE SGF_SESIONES SET EXPIRA = datetime('now','+8 hours') WHERE TOKEN = :t`, { t: token });
        }
    }
    catch (error) {
        console.error("[AUTH ERROR]", error.message);
        if (respondiendo)
            sendJson(res, 503, { success: false, error: `Error de autenticacion: ${error.message}` });
        return null;
    }
    req.currentUser = user;
    return user;
}
/** Autenticacion obligatoria: responde 401/503 y devuelve null si falla. */
export async function authenticate(req, res) {
    return autenticarNucleo(req, res, true);
}
/** Autenticacion opcional: identifica si hay sesion valida, sin responder errores. */
export async function authenticateOpcional(req, res) {
    return autenticarNucleo(req, res, false);
}
export function requireAdmin(req, res) {
    if (!req.currentUser || req.currentUser.role !== "admin") {
        sendJson(res, 403, { success: false, error: "Se requiere rol de administrador." });
        return false;
    }
    return true;
}
export function requireAuth(req, res) {
    if (!req.currentUser) {
        sendJson(res, 401, { success: false, error: "Autenticacion requerida." });
        return false;
    }
    return true;
}
export function sendJson(res, status, payload) {
    if (res.headersSent)
        return;
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    });
    res.end(JSON.stringify(payload));
}
/**
 * Resuelve la IP del cliente respetando encabezados de proxy SOLO si
 * la variable de entorno TRUST_PROXY está activa. Por defecto se usa la
 * IP del socket TCP, que es la IP real del cliente en una LAN.
 *
 * TRUST_PROXY acepta:
 *   - "1"           -> toma la primera IP de X-Forwarded-For
 *   - "true"        -> igual a "1"
 *   - "N" (numero)  -> toma la IP en la posicion N contando desde el final
 *                      (1 = la ultima, que suele ser la del proxy inmediato)
 *
 * Esto evita que un cliente cualquiera mande X-Forwarded-For en su
 * peticion y falsifique la IP que queda registrada en SGF_LOGS.
 */
export function getRequestIp(req) {
    const trustRaw = String(process.env.TRUST_PROXY || "").trim().toLowerCase();
    if (trustRaw === "1" || trustRaw === "true") {
        const forwarded = (req.headers["x-forwarded-for"] || "").toString().trim();
        if (forwarded) {
            const first = forwarded.split(",")[0]?.trim();
            if (first)
                return first;
        }
    }
    else if (/^\d+$/.test(trustRaw)) {
        const hops = Number(trustRaw);
        const forwarded = (req.headers["x-forwarded-for"] || "").toString().trim();
        if (forwarded) {
            const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
            const idx = Math.max(0, parts.length - hops);
            if (parts[idx])
                return parts[idx];
        }
    }
    return (req.socket?.remoteAddress || "desconocida").replace("::ffff:", "");
}
export async function readJsonBody(req, maxBytes = 5 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on("data", (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
                reject(new Error("Cuerpo muy grande."));
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            try {
                const raw = Buffer.concat(chunks).toString("utf8");
                resolve(raw ? JSON.parse(raw) : {});
            }
            catch {
                reject(new Error("JSON invalido."));
            }
        });
        req.on("error", reject);
    });
}
const rateLimitBuckets = new Map();
export function checkRateLimit(key, opts) {
    const now = Date.now();
    const entry = rateLimitBuckets.get(key);
    if (!entry || entry.resetAt <= now) {
        const next = { hits: 1, resetAt: now + opts.windowMs };
        rateLimitBuckets.set(key, next);
        return {
            allowed: true,
            remaining: Math.max(0, opts.max - 1),
            resetAt: next.resetAt,
            retryAfterSeconds: 0,
        };
    }
    entry.hits += 1;
    if (entry.hits > opts.max) {
        const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
        return {
            allowed: false,
            remaining: 0,
            resetAt: entry.resetAt,
            retryAfterSeconds: retryAfter,
        };
    }
    return {
        allowed: true,
        remaining: Math.max(0, opts.max - entry.hits),
        resetAt: entry.resetAt,
        retryAfterSeconds: 0,
    };
}
/** Limpiador periodico para que el Map no crezca indefinidamente. */
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimitBuckets) {
        if (v.resetAt <= now)
            rateLimitBuckets.delete(k);
    }
}, 5 * 60 * 1000).unref();
// ─────────────────────────────────────────────────────────────────────────────
// Configuracion inicial de la base de datos.
//
// Las rutas /api/db/* estaban ABIERTAS a cualquiera (se registraban antes de
// authenticate() y el control de rol solo actuaba "si habia usuario"), asi que
// un anonimo podia leer la configuracion, reescribir el .env, apuntar la
// instalacion a otra BD o dejarla en SQLite vacio.
//
// Ahora el acceso es en tres niveles:
//   1. Administrador autenticado: puede todo.
//   2. Configuracion inicial: mientras NO exista ningun usuario, se permite
//      conectar usando DEFAULT_ADMIN_PASSWORD (lo que el instalador ya tiene en
//      el .env). Se cierra sola en cuanto se crea el primer usuario.
//   3. Token de instalacion (opcional): si en el .env se define
//      SGF_INSTALL_TOKEN, el primer administrador puede configurar la BD desde
//      la pantalla de login introduciendo ese token en el campo Contrasena,
//      aunque ya existan usuarios. Un solo uso y caduca.
// ─────────────────────────────────────────────────────────────────────────────
const INSTALL_TOKEN_TTL_MS = 15 * 60 * 1000;
let installTokenUsadoHasta = 0;
function timingSafeEqualStr(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length)
        return false;
    let diff = 0;
    for (let i = 0; i < ba.length; i += 1)
        diff |= ba[i] ^ bb[i];
    return diff === 0;
}
/** ¿Hay ya algun usuario en la base de datos actual? */
export async function hayUsuariosRegistrados() {
    try {
        const rows = await query("SELECT COUNT(*) AS CNT FROM SGF_USUARIOS");
        return Number(rows?.[0]?.CNT ?? rows?.[0]?.cnt ?? 0) > 0;
    }
    catch {
        // Si no se puede comprobar, se asume que SI hay usuarios (opcion segura).
        return true;
    }
}
/**
 * ¿Es una instalacion recien hecha, sin usuarios propios?
 *
 * No basta con que SGF_USUARIOS este vacia: ensureAdmin() crea el usuario
 * DEFAULT_ADMIN_USER en cada arranque, asi que la tabla casi nunca esta vacia.
 * Se considera "instalacion nueva" cuando el unico usuario es ese
 * administrador por defecto, esta activo y conserva su rol; en cuanto se crea
 * cualquier otra cuenta o se cambia la del admin, la ventana se cierra.
 * Las sesiones no cuentan: un instalador las abre para probar.
 */
export async function esInstalacionNueva() {
    try {
        const adminUser = String(process.env.DEFAULT_ADMIN_USER || "yolexis").trim();
        const rows = await query(`SELECT USERNAME, ROL, ACTIVO FROM SGF_USUARIOS`);
        if (!rows || rows.length === 0)
            return true;
        if (rows.length > 1)
            return false;
        const fila = rows[0];
        const username = String(fila?.USERNAME ?? fila?.username ?? "");
        const rol = String(fila?.ROL ?? fila?.ROLE ?? fila?.rol ?? "").toLowerCase();
        const activo = Number(fila?.ACTIVO ?? fila?.ACTIVE ?? 0);
        return username === adminUser && rol === "admin" && activo === 1;
    }
    catch {
        // Si no se puede comprobar, se asume instalacion YA configurada.
        return false;
    }
}
export function tokenInstalacionConfigurado() {
    return String(process.env.SGF_INSTALL_TOKEN || "").trim().length >= 8;
}
export function tokenInstalacionDisponible() {
    if (!tokenInstalacionConfigurado())
        return false;
    return Date.now() >= installTokenUsadoHasta;
}
function tokenInstalacionValido(valor) {
    const esperado = String(process.env.SGF_INSTALL_TOKEN || "").trim();
    if (!esperado || !tokenInstalacionDisponible())
        return false;
    return timingSafeEqualStr(String(valor || "").trim(), esperado);
}
function passwordAdminValida(valor) {
    const esperado = String(process.env.DEFAULT_ADMIN_PASSWORD || "").trim();
    if (!esperado)
        return false;
    return timingSafeEqualStr(String(valor || "").trim(), esperado);
}
/** Marca el token de instalacion como usado (un solo uso, caduca). */
export function consumirTokenInstalacion() {
    if (tokenInstalacionConfigurado())
        installTokenUsadoHasta = Date.now() + INSTALL_TOKEN_TTL_MS;
}
/**
 * Decide si la peticion puede administrar la base de datos.
 * - body es el JSON de la peticion (puede traer { installToken }).
 * - Sin usuario autenticado solo se permite en instalacion nueva o con el token
 *   de instalacion.
 */
export async function evaluarAccesoConfigBd(req, body) {
    // La consola local (app de escritorio) es el propio instalador.
    if (String(req.headers["x-sgf-console-token"] || "") && String(req.consoleLocal) === "1") {
        return { nivel: "admin", permitido: true };
    }
    const usuario = req.currentUser;
    if (usuario) {
        if (usuario.role === "admin")
            return { nivel: "admin", permitido: true };
        return { nivel: "denegado", permitido: false, motivo: "Se requiere rol de administrador." };
    }
    const tokenRecibido = String(body?.installToken || req.headers["x-install-token"] || "").trim();
    // 1) Token de instalacion explicito (un solo uso)
    if (tokenRecibido && tokenInstalacionValido(tokenRecibido)) {
        return { nivel: "token-instalacion", permitido: true };
    }
    // 2) Instalacion nueva: solo existe el administrador por defecto
    if (await esInstalacionNueva()) {
        return { nivel: "instalacion", permitido: true };
    }
    // 3) Instalacion existente: se exige la contrasena del administrador por
    //    defecto (la que el instalador ya guarda en el .env) para poder
    //    reconectar desde la pantalla de login.
    const passwordRecibido = String(body?.adminPassword || req.headers["x-admin-password"] || "").trim();
    if (passwordRecibido && passwordAdminValida(passwordRecibido)) {
        return { nivel: "instalacion", permitido: true };
    }
    return {
        nivel: "denegado",
        permitido: false,
        motivo: tokenInstalacionConfigurado()
            ? "Inicie sesion como administrador o introduzca el token de instalacion en el campo Contrasena."
            : "Inicie sesion como administrador. Para configurar sin sesion, defina SGF_INSTALL_TOKEN en server/.env.",
    };
}
/** Respuesta uniforme para accesos denegados (no revela si hay usuarios o no). */
export function denegarConfigBd(res, acceso) {
    sendJson(res, 403, {
        success: false,
        error: acceso.motivo || "No autorizado para configurar la base de datos.",
        data: { nivel: acceso.nivel, requiereAdmin: true },
    });
}
//# sourceMappingURL=auth.js.map