import type { IncomingMessage, ServerResponse } from "node:http";
export declare function handlePanelEstado(req: IncomingMessage, res: ServerResponse): Promise<void>;
/** Copia de seguridad de la base SQLite (solo en modo sqlite y solo en este equipo). */
export declare function handlePanelCopia(req: IncomingMessage, res: ServerResponse): Promise<void>;
/** Datos para el asistente de primera vez: ¿ya hay algo configurado? */
export declare function handlePanelBienvenida(req: IncomingMessage, res: ServerResponse): Promise<void>;
/** Marca de vida para que la app sepa que el servidor responde y con que identidad. */
export declare function handlePanelPing(req: IncomingMessage, res: ServerResponse): Promise<void>;
