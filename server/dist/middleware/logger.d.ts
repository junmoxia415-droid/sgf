import type { AuthenticatedRequest } from "./auth.js";
export declare function auditLog(req: AuthenticatedRequest, accion: string, entidad: string, entidadId: string, nivel?: "info" | "warn" | "error", detalles?: string): Promise<void>;
