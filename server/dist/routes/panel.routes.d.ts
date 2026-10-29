import type { IncomingMessage, ServerResponse } from "node:http";
export declare function handlePanelEstado(req: IncomingMessage, res: ServerResponse): Promise<void>;
/** Copia de seguridad de la base SQLite (solo en modo sqlite y solo en este equipo). */
export declare function handlePanelCopia(req: IncomingMessage, res: ServerResponse): Promise<void>;
/** Datos para el asistente de primera vez: ¿ya hay algo configurado? */
export declare function handlePanelBienvenida(req: IncomingMessage, res: ServerResponse): Promise<void>;
/**
 * Ajustes de facturación: cuántas facturas por mes se esperan y cómo va cada mes.
 *
 * GET  /api/panel/periodos           → configuración + últimos meses con su avance
 * POST /api/panel/periodos {facturasPorMes} → guarda la preferencia en el .env
 *
 * Lo normal son 2 facturas por mes (primera y segunda quincena), pero se puede
 * poner 1, 3, 4, 6… sin tocar código.
 */
export declare function handlePanelPeriodos(req: IncomingMessage, res: ServerResponse): Promise<void>;
/** Marca de vida para que la app sepa que el servidor responde y con que identidad. */
export declare function handlePanelPing(req: IncomingMessage, res: ServerResponse): Promise<void>;
