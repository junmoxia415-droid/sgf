import { safeVerifyToken } from "../utils/jwt.js";
import { execute, getDbMode, query } from "../models/database.js";
export async function authenticate(req, res) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
        sendJson(res, 401, { success: false, error: "Token no proporcionado." });
        return null;
    }
    const user = safeVerifyToken(token);
    if (!user) {
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
        sendJson(res, 503, { success: false, error: `Error de autenticacion: ${error.message}` });
        return null;
    }
    req.currentUser = user;
    return user;
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
//# sourceMappingURL=auth.js.map