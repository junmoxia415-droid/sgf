/**
 * excel-mapper.ts - Mapeo inteligente de columnas Excel -> tablas SGF
 * Soporta prueba.xlsx (25 columnas de líneas telefónicas) y facturas.
 */
export type SGFTable = "SGF_FACTURAS" | "SGF_SERVICIOS" | "SGF_USUARIOS" | "SGF_LINEAS_IMPORTADAS" | "PCELULAR_LINEA_TELEFONICA" | "PCELULAR_PERSONA" | "PCELULAR_TELEFONO_ASIGNADO" | "PCELULAR_PROVINCIA" | "PCELULAR_MUNICIPIO" | "PCELULAR_ORGANO" | "PCELULAR_UNIDAD" | "PCELULAR_CARGO" | "PCELULAR_GRADO";
export declare function suggestColumnMapping(excelHeaders: string[]): Record<string, string>;
export declare function suggestTable(excelHeaders: string[]): SGFTable;
export declare function inferColumnType(values: any[]): {
    type: string;
    maxLength?: number;
};
