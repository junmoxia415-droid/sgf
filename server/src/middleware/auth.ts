import type { IncomingMessage, ServerResponse } from "node:http";
import { safeVerifyToken } from "../utils/jwt.js";
import { execute, getDbMode, query } from "../models/database.js";
import type { SessionUser } from "../models/types.js";

/** Duración de cada renovación deslizante (una llamada mantiene la sesión viva). */
const SESION_HORAS_RENOVACION = Number(process.env.SESSION_REFRESH_HOURS) || 8;
/** Tope absoluto: por muchas peticiones que se hagan, la sesión caduca. */
const SESION_MAXIMA_HORAS = Number(process.env.SESSION_MAX_HOURS) || 24;

export interface AuthenticatedRequest extends IncomingMessage {
  currentUser?: SessionUser;
  body?: any;
}

/**
 * Nucleo de autenticacion.
 * - respondiendo=true : comportamiento clasico de las rutas protegidas (401/503).
 * - respondiendo=false: autenticacion OPCIONAL; si no hay token o no es valido
 *   devuelve null sin escribir la respuesta. Se usa en las rutas de
 *   configuracion de BD, que se registran antes de authenticate() para permitir
 *   el flujo de instalacion, pero que deben reconocer al administrador logueado.
 */
async function autenticarNucleo(
  req: AuthenticatedRequest,
  res: ServerResponse,
  respondiendo: boolean,
): Promise<SessionUser | null> {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) {
    if (respondiendo) sendJson(res, 401, { success: false, error: "Token no proporcionado." });
    return null;
  }

  const user = safeVerifyToken(token);
  if (!user) {
    if (respondiendo) sendJson(res, 401, { success: false, error: "Token invalido o expirado." });
    return null;
  }

  try {
    const dbMode = getDbMode();
    const filaSesion = dbMode === "oracle"
      ? await query<any>(
          `SELECT ID, CREATED_AT FROM SGF_SESIONES
           WHERE SESSION_TOKEN = :t AND ACTIVE = 1 AND EXPIRES_AT > SYSTIMESTAMP`,
          { t: token },
        )
      : dbMode === "mssql"
        ? await query<any>(
            `SELECT ID, CREATED_AT FROM SGF_SESIONES
             WHERE SESSION_TOKEN = :t AND ACTIVE = 1 AND EXPIRES_AT > SYSUTCDATETIME()`,
            { t: token },
          )
        : await query<any>(
            `SELECT ID, CREADO FROM SGF_SESIONES
             WHERE TOKEN = :t AND ACTIVO = 1 AND EXPIRA > datetime('now')`,
            { t: token },
          );

    if (filaSesion.length === 0) {
      // No hay sesion valida. Se mira al usuario para poder dar un mensaje util
      // ("te desactivaron" no es lo mismo que "caduco"): el usuario que acaba de
      // ser dado de baja necesita saber por que le echan, no un "sesion expirada".
      let aviso = "Sesion expirada o cerrada. Inicie sesion de nuevo.";
      try {
        const filas = dbMode === "sqlite"
          ? await query<any>(`SELECT ACTIVO FROM SGF_USUARIOS WHERE ID = :id`, { id: user.id })
          : await query<any>(`SELECT ACTIVE FROM SGF_USUARIOS WHERE ID = :id`, { id: user.id });
        if (filas.length === 0) {
          aviso = "La cuenta ya no existe. Inicie sesion de nuevo.";
        } else if (Number(filas[0].ACTIVO ?? filas[0].ACTIVE ?? 0) !== 1) {
          aviso = "Usuario desactivado. Contacte con el administrador.";
        }
      } catch {
        // si la consulta falla se deja el mensaje generico
      }
      if (respondiendo) sendJson(res, 401, { success: false, error: aviso });
      return null;
    }

    // ── El usuario se lee de la base de datos en CADA peticion ──────────────
    // Antes solo se creia el contenido del token: una cuenta desactivada o
    // eliminada seguia trabajando hasta 8 horas, y un administrador degradado
    // conservaba los privilegios del token.
    const filasUsuario = dbMode === "oracle"
      ? await query<any>(`SELECT ID, USERNAME, NAME, ROLE, ACTIVE FROM SGF_USUARIOS WHERE ID = :id`, { id: user.id })
      : dbMode === "mssql"
        ? await query<any>(`SELECT ID, USERNAME, NAME, ROLE, ACTIVE FROM SGF_USUARIOS WHERE ID = :id`, { id: user.id })
        : await query<any>(`SELECT ID, USERNAME, NOMBRE, ROL, ACTIVO FROM SGF_USUARIOS WHERE ID = :id`, { id: user.id });

    if (filasUsuario.length === 0) {
      // Cuenta eliminada: se cierran todas sus sesiones.
      await cerrarSesionesDeUsuario(user.id);
      if (respondiendo) sendJson(res, 401, { success: false, error: "La cuenta ya no existe. Inicie sesion de nuevo." });
      return null;
    }

    const fila = filasUsuario[0];
    const activo = Number(fila?.ACTIVO ?? fila?.ACTIVE ?? 0) === 1;
    const rolActual = String(fila?.ROL ?? fila?.ROLE ?? "usuario") === "admin" ? "admin" : "usuario";

    if (!activo) {
      await cerrarSesionesDeUsuario(user.id);
      if (respondiendo) sendJson(res, 401, { success: false, error: "Usuario desactivado. Contacte al administrador." });
      return null;
    }

    // Se usa SIEMPRE el rol de la base de datos, no el del token.
    const usuarioActualizado: SessionUser = {
      ...user,
      username: String(fila?.USERNAME ?? user.username),
      name: String(fila?.NOMBRE ?? fila?.NAME ?? user.name),
      role: rolActual,
      active: true,
    };

    // ── Renovacion deslizante CON tope absoluto ────────────────────────────
    // Antes cada peticion sumaba 8 h a la caducidad, asi que una sesion activa
    // no caducaba nunca y un token robado podia durar indefinidamente.
    const creada = String(fila?.CREATED_AT ?? fila?.CREADO ?? "");
    const inicioMs = Date.parse(creada.includes("T") ? creada : creada.replace(" ", "T") + "Z");
    const dentroDeVidaMaxima = !Number.isFinite(inicioMs) ||
      Date.now() - inicioMs < SESION_MAXIMA_HORAS * 3600 * 1000;
    const restanteMs = Number.isFinite(inicioMs)
      ? SESION_MAXIMA_HORAS * 3600 * 1000 - (Date.now() - inicioMs)
      : null;

    if (dentroDeVidaMaxima) {
      // La caducidad nunca pasa del limite absoluto de la sesion.
      const horas = restanteMs === null
        ? SESION_HORAS_RENOVACION
        : Math.max(1 / 60, Math.min(SESION_HORAS_RENOVACION, restanteMs / 3600000));

      if (dbMode === "oracle") {
        await execute(
          `UPDATE SGF_SESIONES SET EXPIRES_AT = LEAST(SYSTIMESTAMP + INTERVAL '${horas.toFixed(4)}' HOUR, CREATED_AT + INTERVAL '${SESION_MAXIMA_HORAS}' HOUR) WHERE SESSION_TOKEN = :t`,
          { t: token },
        );
      } else if (dbMode === "mssql") {
        await execute(
          `UPDATE SGF_SESIONES SET EXPIRES_AT = CASE WHEN DATEADD(HOUR, ${horas.toFixed(4)}, SYSUTCDATETIME()) < DATEADD(HOUR, ${SESION_MAXIMA_HORAS}, CREATED_AT) THEN DATEADD(HOUR, ${horas.toFixed(4)}, SYSUTCDATETIME()) ELSE DATEADD(HOUR, ${SESION_MAXIMA_HORAS}, CREATED_AT) END WHERE SESSION_TOKEN = :t`,
          { t: token },
        );
      } else {
        await execute(
          `UPDATE SGF_SESIONES SET EXPIRA = MIN(datetime('now','+${horas.toFixed(4)} hours'), datetime(CREADO, '+${SESION_MAXIMA_HORAS} hours')) WHERE TOKEN = :t`,
          { t: token },
        );
      }
    }

    req.currentUser = usuarioActualizado;
    return usuarioActualizado;
  } catch (error: any) {
    console.error("[AUTH ERROR]", error.message);
    if (respondiendo) sendJson(res, 503, { success: false, error: `Error de autenticacion: ${error.message}` });
    return null;
  }
}

/** Marca como cerradas todas las sesiones de un usuario (en cualquier motor). */
export async function cerrarSesionesDeUsuario(userId: string): Promise<void> {
  try {
    if (getDbMode() === "sqlite") {
      await execute(`UPDATE SGF_SESIONES SET ACTIVO = 0 WHERE USER_ID = :id`, { id: userId });
    } else {
      await execute(`UPDATE SGF_SESIONES SET ACTIVE = 0 WHERE USER_ID = :id`, { id: userId });
    }
  } catch {
    // si la tabla no admite la operacion, no se bloquea la peticion
  }
}

/** Autenticacion obligatoria: responde 401/503 y devuelve null si falla. */
export async function authenticate(req: AuthenticatedRequest, res: ServerResponse): Promise<SessionUser | null> {
  return autenticarNucleo(req, res, true);
}

/** Autenticacion opcional: identifica si hay sesion valida, sin responder errores. */
export async function authenticateOpcional(req: AuthenticatedRequest, res: ServerResponse): Promise<SessionUser | null> {
  return autenticarNucleo(req, res, false);
}

export function requireAdmin(req: AuthenticatedRequest, res: ServerResponse): boolean {
  if (!req.currentUser || req.currentUser.role !== "admin") {
    sendJson(res, 403, { success: false, error: "Se requiere rol de administrador." });
    return false;
  }
  return true;
}

export function requireAuth(req: AuthenticatedRequest, res: ServerResponse): boolean {
  if (!req.currentUser) {
    sendJson(res, 401, { success: false, error: "Autenticacion requerida." });
    return false;
  }
  return true;
}

export function sendJson(res: ServerResponse, status: number, payload: unknown) {
  if (res.headersSent) return;
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
export function getRequestIp(req: IncomingMessage): string {
  const trustRaw = String(process.env.TRUST_PROXY || "").trim().toLowerCase();
  if (trustRaw === "1" || trustRaw === "true") {
    const forwarded = (req.headers["x-forwarded-for"] || "").toString().trim();
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
  } else if (/^\d+$/.test(trustRaw)) {
    const hops = Number(trustRaw);
    const forwarded = (req.headers["x-forwarded-for"] || "").toString().trim();
    if (forwarded) {
      const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
      const idx = Math.max(0, parts.length - hops);
      if (parts[idx]) return parts[idx];
    }
  }
  return (req.socket?.remoteAddress || "desconocida").replace("::ffff:", "");
}

export async function readJsonBody(req: IncomingMessage, maxBytes = 5 * 1024 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
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
      } catch {
        reject(new Error("JSON invalido."));
      }
    });

    req.on("error", reject);
  });
}

/**
 * Rate limiter sencillo en memoria para endpoints sensibles (p.ej. login).
 * Mantiene contadores por clave (IP por defecto). Suficiente para una
 * aplicacion LAN; en despliegues con multiples instancias habria que
 * moverlo a Redis o similar.
 */
type RateLimitEntry = { hits: number; resetAt: number };
const rateLimitBuckets = new Map<string, RateLimitEntry>();

export interface RateLimitOptions {
  /** Tamanio de la ventana en ms */
  windowMs: number;
  /** Maximo de requests dentro de la ventana */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
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
    if (v.resetAt <= now) rateLimitBuckets.delete(k);
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

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i += 1) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

/** ¿Hay ya algun usuario en la base de datos actual? */
export async function hayUsuariosRegistrados(): Promise<boolean> {
  try {
    const rows = await query<any>("SELECT COUNT(*) AS CNT FROM SGF_USUARIOS");
    return Number(rows?.[0]?.CNT ?? rows?.[0]?.cnt ?? 0) > 0;
  } catch {
    // Si no se puede comprobar, se asume que SI hay usuarios (opcion segura).
    return true;
  }
}

/**
 * ¿Es una instalacion recien hecha, sin ninguna cuenta?
 *
 * Ya no se crea un administrador de fabrica al arrancar: la base empieza vacia y
 * la primera cuenta la crea el usuario en el asistente (POST /api/setup/admin).
 * Por eso basta con mirar si la tabla de usuarios esta vacia; en cuanto hay una
 * cuenta, la ventana de configuracion se cierra para siempre.
 * Las sesiones no cuentan: un instalador las abre para probar.
 */
export async function esInstalacionNueva(): Promise<boolean> {
  try {
    const rows = await query<any>(`SELECT USERNAME FROM SGF_USUARIOS`);
    return !rows || rows.length === 0;
  } catch {
    // Si no se puede comprobar, se asume instalacion YA configurada.
    return false;
  }
}

export function tokenInstalacionConfigurado(): boolean {
  return String(process.env.SGF_INSTALL_TOKEN || "").trim().length >= 8;
}

export function tokenInstalacionDisponible(): boolean {
  if (!tokenInstalacionConfigurado()) return false;
  return Date.now() >= installTokenUsadoHasta;
}

function tokenInstalacionValido(valor: string): boolean {
  const esperado = String(process.env.SGF_INSTALL_TOKEN || "").trim();
  if (!esperado || !tokenInstalacionDisponible()) return false;
  return timingSafeEqualStr(String(valor || "").trim(), esperado);
}

function passwordAdminValida(valor: string): boolean {
  const esperado = String(process.env.DEFAULT_ADMIN_PASSWORD || "").trim();
  if (!esperado) return false;
  return timingSafeEqualStr(String(valor || "").trim(), esperado);
}

/** Marca el token de instalacion como usado (un solo uso, caduca). */
export function consumirTokenInstalacion() {
  if (tokenInstalacionConfigurado()) installTokenUsadoHasta = Date.now() + INSTALL_TOKEN_TTL_MS;
}

/** Motivo por el que el servidor permite (o no) tocar la configuracion de BD. */
export type NivelConfigBd = "admin" | "instalacion" | "token-instalacion" | "denegado";

export interface AccesoConfigBd {
  nivel: NivelConfigBd;
  permitido: boolean;
  motivo?: string;
}

/**
 * Decide si la peticion puede administrar la base de datos.
 * - body es el JSON de la peticion (puede traer { installToken }).
 * - Sin usuario autenticado solo se permite en instalacion nueva o con el token
 *   de instalacion.
 */
export async function evaluarAccesoConfigBd(
  req: AuthenticatedRequest,
  body?: any,
): Promise<AccesoConfigBd> {
  // La consola local (app de escritorio) es el propio instalador.
  if (String(req.headers["x-sgf-console-token"] || "") && String((req as any).consoleLocal) === "1") {
    return { nivel: "admin", permitido: true };
  }

  const usuario = (req as AuthenticatedRequest).currentUser;
  if (usuario) {
    if (usuario.role === "admin") return { nivel: "admin", permitido: true };
    return { nivel: "denegado", permitido: false, motivo: "Se requiere rol de administrador." };
  }

  const tokenRecibido = String(
    body?.installToken || req.headers["x-install-token"] || "",
  ).trim();

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
  const passwordRecibido = String(
    body?.adminPassword || req.headers["x-admin-password"] || "",
  ).trim();
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
export function denegarConfigBd(res: ServerResponse, acceso: AccesoConfigBd) {
  sendJson(res, 403, {
    success: false,
    error: acceso.motivo || "No autorizado para configurar la base de datos.",
    data: { nivel: acceso.nivel, requiereAdmin: true },
  });
}
