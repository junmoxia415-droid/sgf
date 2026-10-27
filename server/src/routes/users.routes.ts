import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import bcrypt from "bcryptjs";
import { execute, getDbMode, query } from "../models/database.js";
import { sendJson, readJsonBody, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/logger.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

function normalizeUser(row: any) {
  return {
    id: String(row?.ID ?? row?.id ?? ""),
    username: String(row?.USERNAME ?? row?.username ?? ""),
    name: String(row?.NOMBRE ?? row?.NAME ?? row?.name ?? ""),
    role: (row?.ROL ?? row?.ROLE ?? row?.role ?? "usuario") === "admin" ? "admin" : "usuario",
    active: Number(row?.ACTIVO ?? row?.ACTIVE ?? row?.active ?? 0),
    created_at: String(row?.CREADO ?? row?.CREATED_AT ?? row?.created_at ?? ""),
  };
}

export async function handleGetUsers(req: AuthenticatedRequest, res: ServerResponse) {
  if (!requireAdmin(req, res)) return;

  try {
    const sql = getDbMode() === "sqlite"
      ? `SELECT ID, USERNAME, NOMBRE, ROL, ACTIVO, CREADO FROM SGF_USUARIOS ORDER BY CREADO DESC`
      : `SELECT ID, USERNAME, NAME, ROLE, ACTIVE, CREATED_AT FROM SGF_USUARIOS ORDER BY CREATED_AT DESC`;

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
  const password = String(body.password || "").trim();
  const role = body.role === "admin" ? "admin" : "usuario";

  if (!username || !name || !password) {
    return sendJson(res, 400, { success: false, error: "username, name, password requeridos." });
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
        `INSERT INTO SGF_USUARIOS (ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE, CREATED_AT, UPDATED_AT)
         VALUES (:id, :u, :n, :r, :h, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
        { id, u: username, n: name, r: role, h: passwordHash },
      );
    } else if (getDbMode() === "mssql") {
      await execute(
        `INSERT INTO SGF_USUARIOS (ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE, CREATED_AT, UPDATED_AT)
         VALUES (:id, :u, :n, :r, :h, 1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        { id, u: username, n: name, r: role, h: passwordHash },
      );
    } else {
      await execute(
        `INSERT INTO SGF_USUARIOS (ID, USERNAME, NOMBRE, ROL, PASSWORD_HASH, ACTIVO, CREADO)
         VALUES (:id, :u, :n, :r, :h, 1, datetime('now'))`,
        { id, u: username, n: name, r: role, h: passwordHash },
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
    await auditLog(req, "eliminar_usuario", "usuario", userId, "warn", "Usuario eliminado.");
    return sendJson(res, 200, { success: true, message: "Eliminado." });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
  }
}
