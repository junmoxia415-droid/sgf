import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionUser } from "../models/types.js";
export interface AuthenticatedRequest extends IncomingMessage {
    currentUser?: SessionUser;
    body?: any;
}
/** Marca como cerradas todas las sesiones de un usuario (en cualquier motor). */
export declare function cerrarSesionesDeUsuario(userId: string): Promise<void>;
/** Autenticacion obligatoria: responde 401/503 y devuelve null si falla. */
export declare function authenticate(req: AuthenticatedRequest, res: ServerResponse): Promise<SessionUser | null>;
/** Autenticacion opcional: identifica si hay sesion valida, sin responder errores. */
export declare function authenticateOpcional(req: AuthenticatedRequest, res: ServerResponse): Promise<SessionUser | null>;
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
/** ¿Hay ya algun usuario en la base de datos actual? */
export declare function hayUsuariosRegistrados(): Promise<boolean>;
/**
 * ¿Es una instalacion recien hecha, sin ninguna cuenta?
 *
 * Ya no se crea un administrador de fabrica al arrancar: la base empieza vacia y
 * la primera cuenta la crea el usuario en el asistente (POST /api/setup/admin).
 * Por eso basta con mirar si la tabla de usuarios esta vacia; en cuanto hay una
 * cuenta, la ventana de configuracion se cierra para siempre.
 * Las sesiones no cuentan: un instalador las abre para probar.
 */
export declare function esInstalacionNueva(): Promise<boolean>;
export declare function tokenInstalacionConfigurado(): boolean;
export declare function tokenInstalacionDisponible(): boolean;
/** Marca el token de instalacion como usado (un solo uso, caduca). */
export declare function consumirTokenInstalacion(): void;
/** Motivo por el que el servidor permite (o no) tocar la configuracion de BD. */
export type NivelConfigBd = "admin" | "instalacion" | "token-instalacion" | "denegado";
export interface AccesoConfigBd {
    nivel: NivelConfigBd;
    permitido: boolean;
    motivo?: string;
}
/**
 * Decide si la peticion puede administrar la base de datos.
 * - body es el JSON de la peticion (puede traer { installToken }).
 * - Sin usuario autenticado solo se permite en instalacion nueva o con el token
 *   de instalacion.
 */
export declare function evaluarAccesoConfigBd(req: AuthenticatedRequest, body?: any): Promise<AccesoConfigBd>;
/** Respuesta uniforme para accesos denegados (no revela si hay usuarios o no). */
export declare function denegarConfigBd(res: ServerResponse, acceso: AccesoConfigBd): void;
