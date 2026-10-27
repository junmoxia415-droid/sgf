import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare function handleGetFacturas(req: AuthenticatedRequest, res: ServerResponse, url: URL): Promise<void>;
export declare function handleGetFactura(req: AuthenticatedRequest, res: ServerResponse, facturaId: string): Promise<void>;
export declare function handleCreateFactura(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleUpdateFactura(req: AuthenticatedRequest, res: ServerResponse, facturaId: string): Promise<void>;
export declare function handleDeleteFactura(req: AuthenticatedRequest, res: ServerResponse, facturaId: string): Promise<void>;
export declare function handleFacturaStats(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
