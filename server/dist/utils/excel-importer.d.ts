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
export declare function importExcelToSGF(buffer: Buffer, options?: ImportOptions): Promise<{
    success: boolean;
    message: string;
    data: ImportResult;
}>;
export declare function getAvailableTables(): Promise<string[]>;
export {};
