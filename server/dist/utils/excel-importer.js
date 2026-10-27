/**
 * excel-importer.ts - Motor de importación masiva desde Excel a SGF
 * Soporta prueba.xlsx (25 columnas) y facturas.
 * - Detección automática de tabla
 * - Mapeo inteligente de columnas
 * - Adición automática de columnas faltantes (ALTER TABLE)
 * - Transacciones por lotes
 */
import { randomUUID } from "node:crypto";
import { query, execute, getDbMode, ensureColumnExists } from "../models/database.js";
import { suggestColumnMapping, suggestTable, inferColumnType } from "./excel-mapper.js";
let XLSX = null;
async function getXlsx() {
    if (!XLSX) {
        const mod = await import("xlsx");
        XLSX = mod.default || mod;
    }
    return XLSX;
}
export async function analyzeExcelFile(buffer) {
    const xlsx = await getXlsx();
    const wb = xlsx.read(buffer, { type: "buffer" });
    const sheets = [];
    const mappingSuggestions = {};
    let globalSuggested = "SGF_LINEAS_IMPORTADAS";
    for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const json = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (json.length === 0)
            continue;
        const headers = json[0].map(h => String(h || "").trim()).filter(Boolean);
        const rows = json.slice(1);
        const preview = rows.slice(0, 3).map(r => {
            const obj = {};
            headers.forEach((h, i) => obj[h] = r[i]);
            return obj;
        });
        const suggested = suggestTable(headers);
        const mapping = suggestColumnMapping(headers);
        sheets.push({ name: sheetName, headers, rowCount: rows.length, columnCount: headers.length, preview });
        mappingSuggestions[sheetName] = { suggestedTable: suggested, mapping };
        if (sheets.length === 1)
            globalSuggested = suggested;
    }
    return { sheets, suggestedTable: globalSuggested, mappingSuggestions };
}
// Definición de columnas por tabla para inferencia de tipos
const TABLE_SCHEMAS = {
    SGF_LINEAS_IMPORTADAS: {
        NUMERO: { type: "VARCHAR", maxLength: 50 },
        ASIGNACION_VOZ: { type: "VARCHAR", maxLength: 50 },
        ASIGNACION_SMS: { type: "VARCHAR", maxLength: 50 },
        TIPO_TELEFONO: { type: "VARCHAR", maxLength: 100 },
        ESTRUCTURA: { type: "VARCHAR", maxLength: 200 },
        PROVINCIA: { type: "VARCHAR", maxLength: 100 },
        MUNICIPIO: { type: "VARCHAR", maxLength: 100 },
        ORGANO: { type: "VARCHAR", maxLength: 100 },
        UNIDAD: { type: "VARCHAR", maxLength: 100 },
        UBICACION: { type: "VARCHAR", maxLength: 200 },
        CARGO: { type: "VARCHAR", maxLength: 100 },
        USUARIO_PUESTO: { type: "VARCHAR", maxLength: 200 },
        GRADO: { type: "VARCHAR", maxLength: 100 },
        ESTADO: { type: "VARCHAR", maxLength: 50 },
        MARCA: { type: "VARCHAR", maxLength: 100 },
        MODELO: { type: "VARCHAR", maxLength: 100 },
        TARJETA_SD: { type: "VARCHAR", maxLength: 20 },
        PUBLICO: { type: "VARCHAR", maxLength: 20 },
        ESTUCHE: { type: "VARCHAR", maxLength: 20 },
        PIN: { type: "VARCHAR", maxLength: 20 },
        PUK: { type: "VARCHAR", maxLength: 50 },
        IMEI: { type: "VARCHAR", maxLength: 100 },
        MMS: { type: "VARCHAR", maxLength: 20 },
        INTERNET: { type: "VARCHAR", maxLength: 20 },
        FECHA_ACTUALIZACION: { type: "VARCHAR", maxLength: 50 },
    },
    SGF_FACTURAS: {
        NO_FACTURA: { type: "VARCHAR", maxLength: 50 },
        CLIENTE: { type: "VARCHAR", maxLength: 500 },
        TOTAL: { type: "DECIMAL" },
    },
};
function mapTypeToDb(type, maxLength) {
    const mode = getDbMode();
    if (mode === "mssql") {
        if (type === "INTEGER")
            return "INT";
        if (type === "DECIMAL")
            return "DECIMAL(18,4)";
        if (type === "TEXT")
            return "NVARCHAR(MAX)";
        return `NVARCHAR(${maxLength || 255})`;
    }
    if (mode === "oracle") {
        if (type === "INTEGER")
            return "NUMBER";
        if (type === "DECIMAL")
            return "NUMBER(18,4)";
        if (type === "TEXT")
            return "CLOB";
        return `VARCHAR2(${maxLength || 255})`;
    }
    // sqlite
    if (type === "INTEGER")
        return "INTEGER";
    if (type === "DECIMAL")
        return "REAL";
    return "TEXT";
}
export async function importExcelToSGF(buffer, options = {}) {
    const started = Date.now();
    const importId = randomUUID();
    const xlsx = await getXlsx();
    const wb = xlsx.read(buffer, { type: "buffer" });
    const sheetIndex = options.sheetIndex ?? 0;
    const sheetName = wb.SheetNames[sheetIndex];
    if (!sheetName)
        throw new Error(`Hoja ${sheetIndex} no existe. Solo hay ${wb.SheetNames.length} hojas.`);
    const ws = wb.Sheets[sheetName];
    const json = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (json.length === 0)
        throw new Error("Excel vacío");
    const headerRow = options.headerRow ?? 0;
    const dataStartRow = options.dataStartRow ?? headerRow + 1;
    const headers = json[headerRow].map(h => String(h || "").trim()).filter(Boolean);
    if (headers.length === 0)
        throw new Error("No se encontraron encabezados en la fila " + headerRow);
    const suggestedTable = options.table || suggestTable(headers);
    const mapping = suggestColumnMapping(headers);
    const table = suggestedTable;
    const rows = json.slice(dataStartRow);
    const totalRows = rows.length;
    let importedRows = 0;
    let failedRows = 0;
    const newColumnsAdded = [];
    const errors = [];
    const warnings = [];
    // Truncar si se pide
    if (options.truncateBeforeImport) {
        try {
            await execute(`DELETE FROM ${table}`);
        }
        catch (e) {
            warnings.push(`No se pudo truncar ${table}: ${e.message}`);
        }
    }
    // Asegurar columnas existentes o añadir nuevas
    // Recolectar valores por columna para inferir tipo
    const valuesByCol = {};
    headers.forEach(h => valuesByCol[h] = []);
    for (const r of rows) {
        headers.forEach((h, i) => {
            valuesByCol[h].push(r[i]);
        });
    }
    for (const excelHeader of headers) {
        const dbCol = mapping[excelHeader];
        if (!dbCol)
            continue;
        // Si la columna no existe, añadirla
        const inferred = inferColumnType(valuesByCol[excelHeader]);
        const schemaType = TABLE_SCHEMAS[table]?.[dbCol]?.type || inferred.type;
        const maxLen = TABLE_SCHEMAS[table]?.[dbCol]?.maxLength || inferred.maxLength;
        const dbType = mapTypeToDb(schemaType, maxLen);
        try {
            // Intentar asegurar columna (para tablas SGF_*, si no existe la añade)
            // Para tablas que no son SGF_LINEAS_IMPORTADAS, también intenta
            await ensureColumnExists(table, dbCol, dbType);
            // Si ensureColumnExists añadió, lo consideramos nuevo (heurística: si no estaba en schema conocido)
            if (!TABLE_SCHEMAS[table]?.[dbCol]) {
                newColumnsAdded.push(`${dbCol} (${dbType})`);
            }
        }
        catch (e) {
            warnings.push(`No se pudo asegurar columna ${dbCol}: ${e.message}`);
        }
    }
    // Insertar por lotes
    const batchSize = options.batchSize ?? 100;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        for (let rowIdx = 0; rowIdx < batch.length; rowIdx++) {
            const globalRowIdx = i + rowIdx + dataStartRow + 1; // 1-based para reporte
            const row = batch[rowIdx];
            if (row.every((v) => v === "" || v === null || v === undefined))
                continue; // saltar filas vacías
            const data = {};
            headers.forEach((h, colIdx) => {
                const dbCol = mapping[h];
                if (!dbCol)
                    return;
                let val = row[colIdx];
                if (val === undefined || val === null)
                    val = "";
                data[dbCol] = String(val).trim();
            });
            // Campos obligatorios según tabla
            data.ID = randomUUID();
            if (options.userId)
                data.USER_ID = options.userId;
            // Para facturas, generar cliente si falta
            if (table === "SGF_FACTURAS" && !data.CLIENTE)
                data.CLIENTE = data.NO_FACTURA || "Cliente importado Excel";
            if (table === "SGF_FACTURAS" && !data.USER_ID)
                data.USER_ID = options.userId || "import-excel";
            try {
                const cols = Object.keys(data);
                const placeholders = cols.map(c => `:${c.toLowerCase()}`).join(", ");
                const colList = cols.join(", ");
                const params = {};
                cols.forEach(c => params[c.toLowerCase()] = data[c]);
                const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`;
                await execute(sql, params);
                importedRows++;
            }
            catch (e) {
                failedRows++;
                errors.push({ row: globalRowIdx, error: e.message, data });
                if (errors.length <= 5) {
                    console.warn(`[IMPORT] Fila ${globalRowIdx} falló: ${e.message}`);
                }
            }
        }
    }
    const durationMs = Date.now() - started;
    return {
        success: failedRows === 0 || importedRows > 0,
        message: `Importación completada: ${importedRows} filas importadas a ${table}, ${failedRows} fallidas. ${newColumnsAdded.length} columnas nuevas añadidas.`,
        data: {
            totalRows,
            importedRows,
            failedRows,
            newColumnsAdded,
            table,
            mapping,
            errors: errors.slice(0, 20), // limitar para respuesta
            warnings,
            importId,
            durationMs,
        },
    };
}
export async function getAvailableTables() {
    const mode = getDbMode();
    try {
        if (mode === "mssql") {
            const rows = await query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE 'SGF%' OR TABLE_NAME LIKE 'PCELULAR%' ORDER BY TABLE_NAME");
            return rows.map((r) => r.TABLE_NAME);
        }
        if (mode === "oracle") {
            const rows = await query("SELECT TABLE_NAME FROM ALL_TABLES WHERE TABLE_NAME LIKE 'SGF_%' OR TABLE_NAME LIKE 'PCELULAR_%' ORDER BY TABLE_NAME");
            return rows.map((r) => r.TABLE_NAME);
        }
        // sqlite
        const rows = await query("SELECT name AS TABLE_NAME FROM sqlite_master WHERE type='table' AND (name LIKE 'SGF_%' OR name LIKE 'PCELULAR_%') ORDER BY name");
        return rows.map((r) => r.TABLE_NAME);
    }
    catch {
        return ["SGF_FACTURAS", "SGF_SERVICIOS", "SGF_USUARIOS", "SGF_LINEAS_IMPORTADAS", "PCELULAR_LINEA_TELEFONICA"];
    }
}
//# sourceMappingURL=excel-importer.js.map