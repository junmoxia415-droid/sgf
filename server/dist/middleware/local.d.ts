import type { IncomingMessage } from "node:http";
export declare function esPeticionLocal(req: IncomingMessage): boolean;
export declare function tokenConsolaConfigurado(): boolean;
/** ¿La peticion viene de la consola local con el token correcto? */
export declare function esConsolaLocal(req: IncomingMessage): boolean;
/**
 * Middleware "solo este equipo": bloquea las rutas de administracion local
 * (arrancar/parar, diagnostico, copias de seguridad) a cualquier maquina de la
 * red, aunque conozca la direccion y el puerto.
 */
export declare function requiereEquipoLocal(req: IncomingMessage): boolean;
