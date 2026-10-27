import type { ServerResponse } from "node:http";
import { execute, getDbMode, paginationExpr, query } from "../models/database.js";
import { sendJson, requireAdmin } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

function normalizeLog(row: any) {
  return {
    id: String(row?.ID ?? row?.id ?? ""),
    user_id: String(row?.USER_ID ?? row?.user_id ?? ""),
    accion: String(row?.ACCION ?? row?.accion ?? ""),
    entidad: String(row?.ENTIDAD ?? row?.entidad ?? ""),
    entidad_id: String(row?.ENTIDAD_ID ?? row?.entidad_id ?? ""),
    level: String(row?.LEVEL ?? row?.NIVEL ?? row?.level ?? "info"),
    detalles: String(row?.DETALLES ?? row?.detalles ?? ""),
    ip_address: String(row?.IP_ADDRESS ?? row?.IP ?? row?.ip_address ?? ""),
    created_at: String(row?.CREATED_AT ?? row?.CREADO ?? row?.created_at ?? ""),
  };
}

export async function handleGetLogs(req: AuthenticatedRequest, res: ServerResponse, url: URL) {
  if (!requireAdmin(req, res)) return;

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 50));
  const level = url.searchParams.get("level") || "";

  try {
    const dbMode = getDbMode();
    const levelColumn = dbMode === "sqlite" ? "NIVEL" : "LEVEL";
    const dateColumn = dbMode === "sqlite" ? "CREADO" : "CREATED_AT";

    let where = "";
    const params: Record<string, any> = {};
    if (level && ["info", "warn", "error"].includes(level)) {
      where = `WHERE ${levelColumn} = :lv`;
      params.lv = level;
    }

    const countRows = await query<any>(`SELECT COUNT(*) AS CNT FROM SGF_LOGS ${where}`, params);
    const total = Number(countRows[0]?.CNT || 0);
    const offset = (page - 1) * pageSize;

    const sql = `SELECT * FROM SGF_LOGS ${where} ORDER BY ${dateColumn} DESC ${paginationExpr("off", "lim")}`;

    const rows = await query<any>(sql, { ...params, lim: pageSize, off: offset });
    return sendJson(res, 200, {
      success: true,
      data: rows.map(normalizeLog),
      meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
  }
}

export async function handleClearLogs(req: AuthenticatedRequest, res: ServerResponse) {
  if (!requireAdmin(req, res)) return;

  try {
    const count = await execute(`DELETE FROM SGF_LOGS`);
    return sendJson(res, 200, { success: true, message: `${count} eliminados.` });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
  }
}
