/**
 * import.routes.ts - Endpoints para importador Excel masivo
 * Permite importar prueba.xlsx (25 columnas) y facturas desde Excel.
 */
import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare function handleImportAnalyze(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleImportExcel(req: AuthenticatedRequest, res: ServerResponse, url: URL): Promise<void>;
export declare function handleImportTables(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleImportMappingSuggestions(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleImportStatus(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
