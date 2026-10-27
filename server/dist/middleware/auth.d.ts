import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionUser } from "../models/types.js";
export interface AuthenticatedRequest extends IncomingMessage {
    currentUser?: SessionUser;
    body?: any;
}
export declare function authenticate(req: AuthenticatedRequest, res: ServerResponse): Promise<SessionUser | null>;
export declare function requireAdmin(req: AuthenticatedRequest, res: ServerResponse): boolean;
export declare function requireAuth(req: AuthenticatedRequest, res: ServerResponse): boolean;
export declare function sendJson(res: ServerResponse, status: number, payload: unknown): void;
/**
 * Resuelve la IP del cliente respetando encabezados de proxy SOLO si
 * la variable de entorno TRUST_PROXY está activa. Por defecto se usa la
 * IP del socket TCP, que es la IP real del cliente en una LAN.
 *
 * TRUST_PROXY acepta:
 *   - "1"           -> toma la primera IP de X-Forwarded-For
 *   - "true"        -> igual a "1"
 *   - "N" (numero)  -> toma la IP en la posicion N contando desde el final
 *                      (1 = la ultima, que suele ser la del proxy inmediato)
 *
 * Esto evita que un cliente cualquiera mande X-Forwarded-For en su
 * peticion y falsifique la IP que queda registrada en SGF_LOGS.
 */
export declare function getRequestIp(req: IncomingMessage): string;
export declare function readJsonBody(req: IncomingMessage, maxBytes?: number): Promise<any>;
export interface RateLimitOptions {
    /** Tamanio de la ventana en ms */
    windowMs: number;
    /** Maximo de requests dentro de la ventana */
    max: number;
}
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfterSeconds: number;
}
export declare function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult;
