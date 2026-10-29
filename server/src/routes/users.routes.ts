import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import bcrypt from "bcryptjs";
import { execute, getDbMode, query } from "../models/database.js";
import { cerrarSesionesDeUsuario, sendJson, readJsonBody, requireAdmin, leerPermisos, PERMISOS_DISPONIBLES } from "../middleware/auth.js";
import { auditLog } from "../middleware/logger.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

function normalizeUser(row: any) {
  return {
    id: String(row?.ID ?? row?.id ?? ""),
    username: String(row?.USERNAME ?? row?.username ?? ""),
    name: String(row?.NOMBRE ?? row?.NAME ?? row?.name ?? ""),
    role: (row?.ROL ?? row?.ROLE ?? row?.role ?? "usuario") === "admin" ? "admin" : "usuario",
    active: Number(row?.ACTIVO ?? row?.ACTIVE ?? row?.active ?? 0),
    permisos: leerPermisos(row?.PERMISOS),
    created_at: String(row?.CREADO ?? row?.CREATED_AT ?? row?.created_at ?? ""),
  };
}

export async function handleGetUsers(req: AuthenticatedRequest, res: ServerResponse) {
  if (!requireAdmin(req, res)) return;

  try {
    const sql = getDbMode() === "sqlite"
      ? `SELECT ID, USERNAME, NOMBRE, ROL, ACTIVO, CREADO, PERMISOS FROM SGF_USUARIOS ORDER BY CREADO DESC`
      : `SELECT ID, USERNAME, NAME, ROLE, ACTIVE, CREATED_AT, PERMISOS FROM SGF_USUARIOS ORDER BY CREATED_AT DESC`;

    const users = await query<any>(sql);
    return sendJson(res, 200, { success: true, data: users.map(normalizeUser), meta: { total: users.length } });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
  }
}

export async function handleCreateUser(req: AuthenticatedRequest, res: ServerResponse) {
  if (!requireAdmin(req, res)) return;

  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { success: false, error: "JSON invalido." });
  }

  const username = String(body.username || "").trim();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  const role = body.role === "admin" ? "admin" : "usuario";
  if (body.permisos !== undefined && (!Array.isArray(body.permisos) || body.permisos.some((p: unknown) => typeof p !== "string" || !(PERMISOS_DISPONIBLES as readonly string[]).includes(p)))) {
    return sendJson(res, 400, { success: false, error: "Lista de permisos inválida." });
  }
  const permisos = JSON.stringify([...new Set<string>(body.permisos || [])]);

  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username) || name.length < 2 || password.length < 8) {
    return sendJson(res, 400, { success: false, error: "Usuario de 3 a 32 caracteres, nombre y contraseña de al menos 8 caracteres requeridos." });
  }

  try {
    const exists = await query<any>(`SELECT ID FROM SGF_USUARIOS WHERE USERNAME = :u`, { u: username });
    if (exists.length > 0) {
      return sendJson(res, 409, { success: false, error: "El usuario ya existe." });
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    if (getDbMode() === "oracle") {
      await execute(
        `INSERT INTO SGF_USUARIOS (ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE, CREATED_AT, UPDATED_AT, PERMISOS)
         VALUES (:id, :u, :n, :r, :h, 1, SYSTIMESTAMP, SYSTIMESTAMP, :permisos)`,
        { id, u: username, n: name, r: role, h: passwordHash, permisos },
      );
    } else if (getDbMode() === "mssql") {
      await execute(
        `INSERT INTO SGF_USUARIOS (ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE, CREATED_AT, UPDATED_AT, PERMISOS)
         VALUES (:id, :u, :n, :r, :h, 1, SYSUTCDATETIME(), SYSUTCDATETIME(), :permisos)`,
        { id, u: username, n: name, r: role, h: passwordHash, permisos },
      );
    } else {
      await execute(
        `INSERT INTO SGF_USUARIOS (ID, USERNAME, NOMBRE, ROL, PASSWORD_HASH, ACTIVO, CREADO, PERMISOS)
         VALUES (:id, :u, :n, :r, :h, 1, datetime('now'), :permisos)`,
        { id, u: username, n: name, r: role, h: passwordHash, permisos },
      );
    }

    await auditLog(req, "crear_usuario", "usuario", id, "info", `${username} (${role})`);
    return sendJson(res, 201, {
      success: true,
      message: "Usuario creado.",
      data: { id, username, name, role, active: 1, created_at: new Date().toISOString() },
    });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
  }
}

export async function handleUpdateUser(req: AuthenticatedRequest, res: ServerResponse, userId: string) {
  if (!requireAdmin(req, res)) return;

  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { success: false, error: "JSON invalido." });
  }

  try {
    const dbMode = getDbMode();
    if (body.password !== undefined && String(body.password).length < 8) {
      return sendJson(res, 400, { success: false, error: "La contraseña debe tener al menos 8 caracteres." });
    }
    // No permitir quedarse sin administradores activos.
    if (body.role === "usuario" || body.active === false) {
      const roleColumn = dbMode === "sqlite" ? "ROL" : "ROLE";
      const activeColumn = dbMode === "sqlite" ? "ACTIVO" : "ACTIVE";
      const target = await query<any>(`SELECT ${roleColumn} AS R, ${activeColumn} AS A FROM SGF_USUARIOS WHERE ID = :id`, { id: userId });
      if (String(target[0]?.R ?? target[0]?.r) === "admin" && Number(target[0]?.A ?? target[0]?.a) === 1) {
        const count = await query<any>(`SELECT COUNT(*) AS CNT FROM SGF_USUARIOS WHERE ${roleColumn} = 'admin' AND ${activeColumn} = 1`);
        if (Number(count[0]?.CNT ?? count[0]?.cnt ?? 0) <= 1) return sendJson(res, 409, { success: false, error: "Debe quedar al menos un administrador activo." });
      }
    }
    const sets: string[] = [];
    const params: Record<string, any> = { id: userId };

    if (body.name !== undefined) {
      sets.push(`${dbMode === "sqlite" ? "NOMBRE" : "NAME"} = :n`);
      params.n = String(body.name).trim();
    }
    if (body.role === "admin" || body.role === "usuario") {
      sets.push(`${dbMode === "sqlite" ? "ROL" : "ROLE"} = :r`);
      params.r = body.role;
    }
    if (body.permisos !== undefined) {
      if (!Array.isArray(body.permisos) || body.permisos.some((p: unknown) => typeof p !== "string" || !(PERMISOS_DISPONIBLES as readonly string[]).includes(p))) {
        return sendJson(res, 400, { success: false, error: "Lista de permisos inválida." });
      }
      sets.push(`PERMISOS = :permisos`);
      params.permisos = JSON.stringify([...new Set<string>(body.permisos)]);
    }
    if (body.active !== undefined) {
      sets.push(`${dbMode === "sqlite" ? "ACTIVO" : "ACTIVE"} = :a`);
      params.a = body.active ? 1 : 0;
    }
    if (body.password) {
      sets.push(`PASSWORD_HASH = :h`);
      params.h = await bcrypt.hash(String(body.password), 12);
    }
    if (dbMode === "oracle") {
      sets.push(`UPDATED_AT = SYSTIMESTAMP`);
    } else if (dbMode === "mssql") {
      sets.push(`UPDATED_AT = SYSUTCDATETIME()`);
    }

    if (sets.length === 0) {
      return sendJson(res, 400, { success: false, error: "Sin campos para actualizar." });
    }

    await execute(`UPDATE SGF_USUARIOS SET ${sets.join(", ")} WHERE ID = :id`, params);

    // Cerrar las sesiones abiertas cuando la cuenta se desactiva, se degrada o
    // se le cambia la contrasena: antes el token seguia valiendo hasta 8 h.
    const cierraSesiones = body.active === false || body.role === "usuario" || Boolean(body.password);
    if (cierraSesiones) {
      await cerrarSesionesDeUsuario(userId);
    }

    await auditLog(req, "editar_usuario", "usuario", userId, "info", sets.join("; "));
    return sendJson(res, 200, { success: true, message: "Actualizado." });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
  }
}

export async function handleDeleteUser(req: AuthenticatedRequest, res: ServerResponse, userId: string) {
  if (!requireAdmin(req, res)) return;
  if (req.currentUser!.id === userId) {
    return sendJson(res, 400, { success: false, error: "No puede eliminarse a si mismo." });
  }

  try {
    await execute(`DELETE FROM SGF_USUARIOS WHERE ID = :id`, { id: userId });
    await cerrarSesionesDeUsuario(userId);
    await auditLog(req, "eliminar_usuario", "usuario", userId, "warn", "Usuario eliminado.");
    return sendJson(res, 200, { success: true, message: "Eliminado." });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
  }
}
