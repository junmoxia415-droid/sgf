import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare function handleSearchServicios(req: AuthenticatedRequest, res: ServerResponse, url: URL): Promise<void>;
/**
 * GET /api/lineas?q=...
 * Busca lineas telefonicas por numero, persona, unidad u organo.
 * Primero en PCELULAR.* (Oracle) y luego en SGF_LINEAS_IMPORTADAS (Excel),
 * que hasta ahora no se consultaba en ningun sitio.
 */
export declare function handleBuscarLineas(req: AuthenticatedRequest, res: ServerResponse, url: URL): Promise<void>;
