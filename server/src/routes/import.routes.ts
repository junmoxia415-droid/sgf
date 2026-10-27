/**
 * import.routes.ts - Endpoints para importador Excel masivo
 * Permite importar prueba.xlsx (25 columnas) y facturas desde Excel.
 */

import type { ServerResponse } from "node:http";
import { sendJson, readJsonBody } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { analyzeExcelFile, importExcelToSGF, getAvailableTables } from "../utils/excel-importer.js";
import { suggestColumnMapping } from "../utils/excel-mapper.js";
import { auditLog } from "../middleware/logger.js";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

async function readRawBody(req: AuthenticatedRequest, maxBytes = MAX_FILE_SIZE): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Archivo demasiado grande (>20MB)"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function getBufferFromRequest(req: AuthenticatedRequest): Promise<Buffer> {
  const contentType = (req.headers["content-type"] || "").toString().toLowerCase();
  // Si es application/json con base64
  if (contentType.includes("application/json")) {
    try {
      const body = await readJsonBody(req, MAX_FILE_SIZE);
      const b64 = body.file || body.data || body.buffer || "";
      if (!b64) throw new Error("No se recibió file en base64");
      return Buffer.from(b64, "base64");
    } catch (e) {
      // Fallback a raw
    }
  }
  // Raw binary (octet-stream) o xlsx
  const raw = await readRawBody(req);
  // Si el raw es JSON (por error), intentar parsear como base64
  try {
    const txt = raw.toString("utf8").trim();
    if (txt.startsWith("{")) {
      const obj = JSON.parse(txt);
      const b64 = obj.file || obj.data || obj.buffer || "";
      if (b64) return Buffer.from(b64, "base64");
    }
  } catch {}
  return raw;
}

export async function handleImportAnalyze(req: AuthenticatedRequest, res: ServerResponse) {
  try {
    const buffer = await getBufferFromRequest(req);
    if (buffer.length < 100) {
      return sendJson(res, 400, { success: false, error: "Archivo vacío o demasiado pequeño" });
    }
    const analysis = await analyzeExcelFile(buffer);
    return sendJson(res, 200, {
      success: true,
      message: `Análisis completado. Se encontraron ${analysis.sheets.length} hojas.`,
      data: analysis,
    });
  } catch (error: any) {
    console.error("[IMPORT ANALYZE ERROR]", error.message);
    return sendJson(res, 500, { success: false, error: `Error analizando Excel: ${error.message}` });
  }
}

export async function handleImportExcel(req: AuthenticatedRequest, res: ServerResponse, url: URL) {
  try {
    const buffer = await getBufferFromRequest(req);
    if (buffer.length < 100) {
      return sendJson(res, 400, { success: false, error: "Archivo vacío" });
    }

    const table = (url.searchParams.get("table") || "").trim().toUpperCase() || undefined;
    const sheetIndex = Number(url.searchParams.get("sheetIndex") || 0);
    const headerRow = Number(url.searchParams.get("headerRow") || 0);
    const dataStartRow = Number(url.searchParams.get("dataStartRow") || headerRow + 1);
    const batchSize = Number(url.searchParams.get("batchSize") || 100);
    const truncate = String(url.searchParams.get("truncate") || "false").toLowerCase() === "true";

    const result = await importExcelToSGF(buffer, {
      table: table as any,
      sheetIndex,
      headerRow,
      dataStartRow,
      batchSize,
      userId: req.currentUser?.id,
      truncateBeforeImport: truncate,
    });

    await auditLog(req, "importar_excel", result.data.table, result.data.importId, "info", `${result.data.importedRows} filas importadas a ${result.data.table} desde Excel`);

    return sendJson(res, result.success ? 200 : 207, result);
  } catch (error: any) {
    console.error("[IMPORT EXCEL ERROR]", error.message);
    return sendJson(res, 500, { success: false, error: `Error importando Excel: ${error.message}` });
  }
}

export async function handleImportTables(req: AuthenticatedRequest, res: ServerResponse) {
  try {
    const tables = await getAvailableTables();
    return sendJson(res, 200, { success: true, data: { tables } });
  } catch (error: any) {
    return sendJson(res, 500, { success: false, error: error.message });
  }
}

export async function handleImportMappingSuggestions(req: AuthenticatedRequest, res: ServerResponse) {
  try {
    const body = await readJsonBody(req);
    const columns = Array.isArray(body.columns) ? body.columns.map((c: any) => String(c)) : [];
    if (columns.length === 0) {
      return sendJson(res, 400, { success: false, error: "Se requiere array columns" });
    }
    const mapping = suggestColumnMapping(columns);
    return sendJson(res, 200, { success: true, data: { mapping, table: body.table || null } });
  } catch (error: any) {
    return sendJson(res, 500, { success: false, error: error.message });
  }
}

export async function handleImportStatus(req: AuthenticatedRequest, res: ServerResponse) {
  // Placeholder: en memoria no guardamos historial persistente, pero retornamos info básica
  return sendJson(res, 200, {
    success: true,
    data: {
      message: "El importador no mantiene historial persistente, revisa SGF_LOGS con accion=importar_excel",
      lastImport: null,
    },
  });
}
