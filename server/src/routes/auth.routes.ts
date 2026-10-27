import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import bcrypt from "bcryptjs";
import { execute, expireExpr, getDbMode, nowExpr, query } from "../models/database.js";
import { signToken } from "../utils/jwt.js";
import {
  checkRateLimit,
  getRequestIp,
  readJsonBody,
  sendJson,
} from "../middleware/auth.js";
import { auditLog } from "../middleware/logger.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

/**
 * Normalizacion INTERNA: incluye el hash de la contrasena.
 * Se usa unicamente dentro del servidor para validar credenciales.
 * NUNCA debe serializarse a una respuesta HTTP.
 */
function normalizeUserInternal(row: any) {
  const role: "admin" | "usuario" =
    (row?.ROL ?? row?.ROLE ?? row?.role ?? "usuario") === "admin" ? "admin" : "usuario";
  return {
    id: String(row?.ID ?? row?.id ?? ""),
    username: String(row?.USERNAME ?? row?.username ?? ""),
    name: String(row?.NOMBRE ?? row?.NAME ?? row?.name ?? ""),
    role,
    active: Number(row?.ACTIVO ?? row?.ACTIVE ?? row?.active ?? 0) === 1,
    createdAt: String(row?.CREADO ?? row?.CREATED_AT ?? row?.created_at ?? ""),
    passwordHash: String(row?.PASSWORD_HASH ?? ""),
  };
}

/**
 * Normalizacion PUBLICA: lo que se envia al cliente.
 * Misma forma que antes pero sin passwordHash.
 */
function normalizeUserPublic(internal: ReturnType<typeof normalizeUserInternal>): import("../models/types.js").SessionUser {
  return {
    id: internal.id,
    username: internal.username,
    name: internal.name,
    role: internal.role,
    active: internal.active,
    createdAt: internal.createdAt,
  };
}

// Rate limit de login. Por defecto es permisivo (30/min y 200/15min)
// para no molestar en pruebas. Si tu red tiene riesgo de fuerza bruta,
// configura LOGIN_RATE_PER_MIN=5 y LOGIN_RATE_PER_15MIN=30 en el .env.
const LOGIN_LIMIT_PER_MIN = Number(process.env.LOGIN_RATE_PER_MIN || 30);
const LOGIN_LIMIT_PER_15MIN = Number(process.env.LOGIN_RATE_PER_15MIN || 200);

export async function handleLogin(req: AuthenticatedRequest, res: ServerResponse) {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { success: false, error: "JSON invalido." });
  }

  const ip = getRequestIp(req);
  const usernameAttempt = String(body.username || "").trim();
  const key = `login:${ip}:${usernameAttempt.toLowerCase() || "_"}`;

  // Ventana corta (1 minuto)
  const shortLimit = checkRateLimit(key, { windowMs: 60 * 1000, max: LOGIN_LIMIT_PER_MIN });
  if (!shortLimit.allowed) {
    res.setHeader("Retry-After", String(shortLimit.retryAfterSeconds));
    res.setHeader("X-RateLimit-Remaining", "0");
    return sendJson(res, 429, {
      success: false,
      error: `Demasiados intentos. Espere ${shortLimit.retryAfterSeconds}s antes de reintentar.`,
    });
  }

  // Ventana larga (15 minutos)
  const longLimit = checkRateLimit(key, { windowMs: 15 * 60 * 1000, max: LOGIN_LIMIT_PER_15MIN });
  if (!longLimit.allowed) {
    res.setHeader("Retry-After", String(longLimit.retryAfterSeconds));
    res.setHeader("X-RateLimit-Remaining", "0");
    return sendJson(res, 429, {
      success: false,
      error: `Demasiados intentos. Espere ${longLimit.retryAfterSeconds}s antes de reintentar.`,
    });
  }

  const username = usernameAttempt;
  const password = String(body.password || "").trim();
  const machineId = String(body.machineId || "pc").trim();

  if (!username || !password) {
    return sendJson(res, 400, { success: false, error: "Usuario y contrasena requeridos." });
  }

  try {
    const dbMode = getDbMode();
    const sql = dbMode === "sqlite"
      ? `SELECT ID, USERNAME, NOMBRE, ROL, PASSWORD_HASH, ACTIVO, CREADO FROM SGF_USUARIOS WHERE USERNAME = :u`
      : `SELECT ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE, CREATED_AT FROM SGF_USUARIOS WHERE USERNAME = :u`;

    const rows = await query<any>(sql, { u: username });
    if (rows.length === 0) {
      return sendJson(res, 401, { success: false, error: "Usuario o contrasena incorrectos." });
    }

    const internal = normalizeUserInternal(rows[0]);
    if (!internal.active) {
      return sendJson(res, 403, { success: false, error: "Usuario inactivo. Contacte al administrador." });
    }

    const ok = await bcrypt.compare(password, internal.passwordHash);
    if (!ok) {
      return sendJson(res, 401, { success: false, error: "Usuario o contrasena incorrectos." });
    }

    const publicUser = normalizeUserPublic(internal);

    const token = signToken(publicUser);

    const sessionId = randomUUID();

    if (dbMode === "oracle") {
      await execute(`UPDATE SGF_SESIONES SET ACTIVE = 0, ENDED_AT = SYSTIMESTAMP WHERE USER_ID = :uid AND ACTIVE = 1`, { uid: internal.id });
      await execute(
        `INSERT INTO SGF_SESIONES (ID, USER_ID, SESSION_TOKEN, MACHINE_ID, IP_ADDRESS, ACTIVE, CREATED_AT, EXPIRES_AT)
         VALUES (:id, :uid, :tok, :m, :ip, 1, ${nowExpr()}, ${expireExpr(8)})`,
        { id: sessionId, uid: internal.id, tok: token, m: machineId, ip },
      );
    } else if (dbMode === "mssql") {
      await execute(`UPDATE SGF_SESIONES SET ACTIVE = 0, ENDED_AT = SYSUTCDATETIME() WHERE USER_ID = :uid AND ACTIVE = 1`, { uid: internal.id });
      await execute(
        `INSERT INTO SGF_SESIONES (ID, USER_ID, SESSION_TOKEN, MACHINE_ID, IP_ADDRESS, ACTIVE, CREATED_AT, EXPIRES_AT)
         VALUES (:id, :uid, :tok, :m, :ip, 1, ${nowExpr()}, ${expireExpr(8)})`,
        { id: sessionId, uid: internal.id, tok: token, m: machineId, ip },
      );
    } else {
      await execute(`UPDATE SGF_SESIONES SET ACTIVO = 0 WHERE USER_ID = :uid AND ACTIVO = 1`, { uid: internal.id });
      await execute(
        `INSERT INTO SGF_SESIONES (ID, USER_ID, TOKEN, MAQUINA, IP, ACTIVO, CREADO, EXPIRA)
         VALUES (:id, :uid, :tok, :m, :ip, 1, datetime('now'), datetime('now','+8 hours'))`,
        { id: sessionId, uid: internal.id, tok: token, m: machineId, ip },
      );
    }

    req.currentUser = publicUser;

    await auditLog(req, "login", "usuario", internal.id, "info", `${username} - ${machineId}`);

    return sendJson(res, 200, {
      success: true,
      message: "Sesion iniciada.",
      data: {
        user: publicUser,
        token,
        sessionId,
        machineId,
      },
    });
  } catch (error: any) {
    console.error("[LOGIN ERROR]", error.message);
    return sendJson(res, 503, { success: false, error: `Error del servidor: ${error.message}` });
  }
}

export async function handleLogout(req: AuthenticatedRequest, res: ServerResponse) {
  const token = (req.headers.authorization || "").startsWith("Bearer ")
    ? (req.headers.authorization || "").slice(7)
    : "";

  try {
    const dbMode = getDbMode();
    if (dbMode === "oracle") {
      await execute(`UPDATE SGF_SESIONES SET ACTIVE = 0, ENDED_AT = SYSTIMESTAMP WHERE SESSION_TOKEN = :t`, { t: token });
    } else if (dbMode === "mssql") {
      await execute(`UPDATE SGF_SESIONES SET ACTIVE = 0, ENDED_AT = SYSUTCDATETIME() WHERE SESSION_TOKEN = :t`, { t: token });
    } else {
      await execute(`UPDATE SGF_SESIONES SET ACTIVO = 0 WHERE TOKEN = :t`, { t: token });
    }
    return sendJson(res, 200, { success: true, message: "Sesion cerrada." });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
  }
}

export async function handleMe(req: AuthenticatedRequest, res: ServerResponse) {
  try {
    const sql = getDbMode() === "sqlite"
      ? `SELECT ID, USERNAME, NOMBRE, ROL, ACTIVO, CREADO FROM SGF_USUARIOS WHERE ID = :id`
      : `SELECT ID, USERNAME, NAME, ROLE, ACTIVE, CREATED_AT FROM SGF_USUARIOS WHERE ID = :id`;

    const rows = await query<any>(sql, { id: req.currentUser!.id });
    if (rows.length === 0) {
      return sendJson(res, 404, { success: false, error: "Usuario no encontrado." });
    }

    const internal = normalizeUserInternal(rows[0]);
    return sendJson(res, 200, {
      success: true,
      data: normalizeUserPublic(internal),
    });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
  }
}
