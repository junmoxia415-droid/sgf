/**
 * excel-importer.ts - Motor de importación masiva desde Excel a SGF
 * Soporta prueba.xlsx (25 columnas) y facturas.
 * - Detección automática de tabla
 * - Mapeo inteligente de columnas
 * - Adición automática de columnas faltantes (ALTER TABLE)
 * - Transacciones por lotes
 */
import { type SGFTable } from "./excel-mapper.js";
type AnalyzeResult = {
    sheets: Array<{
        name: string;
        headers: string[];
        rowCount: number;
        columnCount: number;
        preview: any[];
    }>;
    suggestedTable: SGFTable;
    mappingSuggestions: Record<string, {
        suggestedTable: SGFTable;
        mapping: Record<string, string>;
    }>;
};
export declare function analyzeExcelFile(buffer: Buffer): Promise<AnalyzeResult>;
type ImportOptions = {
    table?: SGFTable;
    sheetIndex?: number;
    headerRow?: number;
    dataStartRow?: number;
    batchSize?: number;
    userId?: string;
    truncateBeforeImport?: boolean;
};
type ImportResult = {
    totalRows: number;
    importedRows: number;
    failedRows: number;
    newColumnsAdded: string[];
    table: string;
    mapping: Record<string, string>;
    errors: Array<{
        row: number;
        error: string;
        data: any;
    }>;
    warnings: string[];
    importId: string;
    durationMs: number;
};
/**
 * Tablas que el importador puede tocar. Sin esta lista, `table=` llegaba de la
 * URL y se interpolaba directamente en DELETE/INSERT/ALTER (inyeccion SQL y
 * borrado de tablas que no tienen nada que ver con la importacion).
 */
export declare const IMPORT_TABLES: readonly ["SGF_LINEAS_IMPORTADAS", "SGF_FACTURAS", "SGF_SERVICIOS", "PCELULAR_LINEA_TELEFONICA", "PCELULAR_PERSONA", "PCELULAR_TELEFONO_ASIGNADO", "PCELULAR_PROVINCIA", "PCELULAR_MUNICIPIO", "PCELULAR_ORGANO", "PCELULAR_UNIDAD", "PCELULAR_CARGO", "PCELULAR_GRADO"];
/** Tablas que nunca se pueden vaciar con truncate=true. */
export declare const TRUNCATE_PROHIBIDAS: string[];
export declare function validarTablaImportacion(table: string): string;
export declare function validarBatchSize(batchSize: number): number;
export declare function importExcelToSGF(buffer: Buffer, options?: ImportOptions): Promise<{
    success: boolean;
    message: string;
    data: ImportResult;
}>;
export declare function getAvailableTables(): Promise<string[]>;
export {};
