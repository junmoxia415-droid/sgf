import type { ServerResponse } from "node:http";
import { getDbMode, paginationExpr, query } from "../models/database.js";
import { sendJson } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

function normalizeServiceSearchRow(row: any) {
  const estado = String(row?.ESTADO ?? row?.estado ?? "pendiente");
  const reviewStatus = estado === "error" ? "doubtful" : estado === "pendiente" ? "review" : "high";
  return {
    service_id: String(row?.SERVICE_ID ?? row?.service_id ?? row?.ID ?? ""),
    factura_id: String(row?.FACTURA_ID ?? row?.factura_id ?? ""),
    numero_servicio: String(row?.NUMERO_SERVICIO ?? row?.numero_servicio ?? ""),
    cuota: Number(row?.SERVICE_CUOTA ?? row?.service_cuota ?? row?.CUOTA ?? row?.cuota ?? 0),
    consumo: Number(row?.SERVICE_CONSUMO ?? row?.service_consumo ?? row?.CONSUMO ?? row?.consumo ?? 0),
    comision: Number(row?.SERVICE_COMISION ?? row?.service_comision ?? row?.COMISION ?? row?.comision ?? 0),
    impuesto: Number(row?.SERVICE_IMPUESTO ?? row?.service_impuesto ?? row?.IMPUESTO ?? row?.impuesto ?? 0),
    importe: Number(row?.SERVICE_IMPORTE ?? row?.service_importe ?? row?.IMPORTE ?? row?.importe ?? 0),
    no_factura: String(row?.NO_FACTURA ?? row?.no_factura ?? ""),
    cliente: String(row?.CLIENTE ?? row?.cliente ?? ""),
    periodo_consumo: String(row?.PERIODO_CONSUMO ?? row?.periodo_consumo ?? ""),
    total_pagar: Number(row?.TOTAL_PAGAR ?? row?.total_pagar ?? 0),
    estado,
    created_at: String(row?.CREATED_AT ?? row?.created_at ?? ""),
    confidence: Number(row?.OCR_CONFIDENCE ?? row?.ocr_confidence ?? 0),
    reviewStatus,
    reviewLabel: reviewStatus === "doubtful" ? "Extraccion dudosa" : reviewStatus === "review" ? "Revisar manualmente" : "Alta confianza",
  };
}

export async function handleSearchServicios(req: AuthenticatedRequest, res: ServerResponse, url: URL) {
  const numero = String(url.searchParams.get("numero") || url.searchParams.get("search") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  const offset = (page - 1) * pageSize;

  if (!numero) {
    return sendJson(res, 200, {
      success: true,
      data: [],
      meta: { total: 0, page, pageSize, totalPages: 1, dbMode: getDbMode() },
    });
  }

  try {
    const clauses = ["UPPER(s.NUMERO_SERVICIO) LIKE :q"];
    const params: Record<string, any> = { q: `%${numero.toUpperCase()}%` };

    if (req.currentUser?.role !== "admin") {
      clauses.push("f.USER_ID = :uid");
      params.uid = req.currentUser?.id;
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const countSql = `SELECT COUNT(*) AS CNT FROM SGF_SERVICIOS s JOIN SGF_FACTURAS f ON f.ID = s.FACTURA_ID ${where}`;
    const countRows = await query<any>(countSql, params);
    const total = Number(countRows[0]?.CNT || 0);

    const listSql = `SELECT
            s.ID AS SERVICE_ID,
            s.FACTURA_ID,
            s.NUMERO_SERVICIO,
            s.CUOTA AS SERVICE_CUOTA,
            s.CONSUMO AS SERVICE_CONSUMO,
            s.COMISION AS SERVICE_COMISION,
            s.IMPORTE AS SERVICE_IMPORTE,
            s.IMPUESTO AS SERVICE_IMPUESTO,
            f.NO_FACTURA,
            f.CLIENTE,
            f.PERIODO_CONSUMO,
            f.TOTAL_PAGAR,
            f.ESTADO,
            f.CREATED_AT,
            f.OCR_CONFIDENCE
          FROM SGF_SERVICIOS s
          JOIN SGF_FACTURAS f ON f.ID = s.FACTURA_ID
          ${where}
          ORDER BY f.CREATED_AT DESC, s.NUMERO_SERVICIO ASC
          ${paginationExpr("off", "lim")}`;

    const rows = await query<any>(listSql, { ...params, off: offset, lim: pageSize });
    return sendJson(res, 200, {
      success: true,
      data: rows.map(normalizeServiceSearchRow),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        dbMode: getDbMode(),
      },
    });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
  }
}
