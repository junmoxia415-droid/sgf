import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { execute, getDbMode, nowExpr, query } from "../models/database.js";
import { getRequestIp, readJsonBody, sendJson } from "../middleware/auth.js";
import { signToken } from "../utils/jwt.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

/**
 * Configuracion de la primera vez.
 *
 * La base arranca SIN usuarios (ya no hay "yolexis" ni contrasena de fabrica).
 * Estas dos rutas son las que permiten crear la cuenta la primera vez:
 *
 *   GET  /api/setup/estado  → { requiereConfiguracion: true/false }
 *   POST /api/setup/admin   → crea el administrador y devuelve la sesion
 *
 * POST solo funciona si la tabla de usuarios esta VACIA. En cuanto existe un
 * usuario, responde 409 y no se puede usar para colarse.
 */

async function contarUsuarios(): Promise<number> {
  try {
    const filas = await query<any>(`SELECT COUNT(*) AS CNT FROM SGF_USUARIOS`);
    return Number(filas?.[0]?.CNT ?? filas?.[0]?.cnt ?? 0);
  } catch {
    // Tabla todavia sin crear: no hay usuarios.
    return 0;
  }
}

/** ¿Hay que configurar la aplicación? (no existe ninguna cuenta) */
export async function handleSetupEstado(_req: AuthenticatedRequest, res: ServerResponse) {
  const usuarios = await contarUsuarios();
  return sendJson(res, 200, {
    success: true,
    data: {
      requiereConfiguracion: usuarios === 0,
      usuarios,
    },
  });
}

/**
 * Registra la sesión recién creada igual que hace /api/auth/login.
 *
 * Sin esto el token que devuelve la configuración inicial es válido pero no
 * existe en SGF_SESIONES, y la siguiente llamada (p. ej. /api/db/config)
 * respondía 403 como si no hubiera sesión.
 */
async function registrarSesion(id: string, userId: string, token: string, maquina: string, ip: string) {
  if (getDbMode() === "sqlite") {
    await execute(`UPDATE SGF_SESIONES SET ACTIVO = 0 WHERE USER_ID = :uid AND ACTIVO = 1`, { uid: userId });
    await execute(
      `INSERT INTO SGF_SESIONES (ID, USER_ID, TOKEN, MAQUINA, IP, ACTIVO, CREADO, EXPIRA)
       VALUES (:id, :uid, :tok, :m, :ip, 1, datetime('now'), datetime('now','+8 hours'))`,
      { id, uid: userId, tok: token, m: maquina, ip },
    );
    return;
  }
  if (getDbMode() === "oracle") {
    await execute(`UPDATE SGF_SESIONES SET ACTIVE = 0, ENDED_AT = SYSTIMESTAMP WHERE USER_ID = :uid AND ACTIVE = 1`, { uid: userId });
    await execute(
      `INSERT INTO SGF_SESIONES (ID, USER_ID, SESSION_TOKEN, MACHINE_ID, IP_ADDRESS, ACTIVE, CREATED_AT, EXPIRES_AT)
       VALUES (:id, :uid, :tok, :m, :ip, 1, SYSTIMESTAMP, SYSTIMESTAMP + INTERVAL '8' HOUR)`,
      { id, uid: userId, tok: token, m: maquina, ip },
    );
    return;
  }
  await execute(`UPDATE SGF_SESIONES SET ACTIVE = 0, ENDED_AT = SYSUTCDATETIME() WHERE USER_ID = :uid AND ACTIVE = 1`, { uid: userId });
  await execute(
    `INSERT INTO SGF_SESIONES (ID, USER_ID, SESSION_TOKEN, MACHINE_ID, IP_ADDRESS, ACTIVE, CREATED_AT, EXPIRES_AT)
     VALUES (:id, :uid, :tok, :m, :ip, 1, SYSUTCDATETIME(), DATEADD(HOUR, 8, SYSUTCDATETIME()))`,
    { id, uid: userId, tok: token, m: maquina, ip },
  );
}

/** Crea la cuenta de administrador en una instalación nueva. */
export async function handleSetupAdmin(req: AuthenticatedRequest, res: ServerResponse) {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { success: false, error: "JSON invalido." });
  }

  const username = String(body.username || "").trim();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");

  // Solo si no hay nadie: así esta ruta no sirve para crear cuentas después.
  if ((await contarUsuarios()) > 0) {
    return sendJson(res, 409, {
      success: false,
      error: "La aplicación ya tiene cuentas. Inicie sesión con su usuario.",
    });
  }

  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return sendJson(res, 400, {
      success: false,
      error: "El usuario debe tener entre 3 y 32 caracteres (letras, números, punto, guion o guion bajo).",
    });
  }
  if (!name || name.length < 2) {
    return sendJson(res, 400, { success: false, error: "Escriba el nombre de la persona." });
  }
  if (password.length < 8) {
    return sendJson(res, 400, { success: false, error: "La contraseña debe tener al menos 8 caracteres." });
  }

  try {
    const id = randomUUID();
    const hash = await bcrypt.hash(password, 12);
    const ahora = nowExpr();

    if (getDbMode() === "sqlite") {
      await execute(
        `INSERT INTO SGF_USUARIOS (ID, USERNAME, NOMBRE, ROL, PASSWORD_HASH, ACTIVO, CREADO)
         VALUES (:id, :u, :n, 'admin', :h, 1, ${ahora})`,
        { id, u: username, n: name, h: hash },
      );
    } else if (getDbMode() === "oracle") {
      await execute(
        `INSERT INTO SGF_USUARIOS (ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE, CREATED_AT, UPDATED_AT)
         VALUES (:id, :u, :n, 'admin', :h, 1, ${ahora}, ${ahora})`,
        { id, u: username, n: name, h: hash },
      );
    } else {
      await execute(
        `INSERT INTO SGF_USUARIOS (ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE, CREATED_AT, UPDATED_AT)
         VALUES (:id, :u, :n, 'admin', :h, 1, ${ahora}, ${ahora})`,
        { id, u: username, n: name, h: hash },
      );
    }

    console.log(`[SGF] Cuenta de administrador creada en la configuracion inicial: ${username}`);

    // Se devuelve la sesión ya iniciada para que la app entre directamente.
    const createdAt = new Date().toISOString();
    const token = signToken({ id, username, name, role: "admin", active: true, createdAt });
    // La sesión tiene que quedar registrada: sin ella el token no vale para nada.
    await registrarSesion(
      randomUUID(),
      id,
      token,
      String(body.machineId || "sgf-escritorio"),
      getRequestIp(req),
    );
    return sendJson(res, 201, {
      success: true,
      message: "Cuenta creada. Ya puede entrar.",
      data: {
        token,
        user: { id, username, name, role: "admin", active: 1 },
      },
    });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `No se pudo crear la cuenta: ${error.message}` });
  }
}
