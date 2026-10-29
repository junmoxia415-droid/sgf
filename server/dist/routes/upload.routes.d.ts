import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { type FacturaExtraida } from "../utils/factura-parser.js";
/**
 * Normaliza el periodo de consumo para poder compararlo entre facturas:
 * "SEPTIEMBRE 2025", "Septiembre/2025" y "09/2025" deben considerarse iguales.
 * Si no se reconoce el formato se devuelve el texto en mayusculas y sin espacios
 * sobrantes, que sigue sirviendo para comparar "igual con igual".
 */
export declare function normalizarPeriodo(periodo: string | null | undefined): string;
export declare function limpiarFacturaExistente(noFactura: string, userId: string): Promise<void>;
/**
 * Guarda la factura y sus servicios. Exportada para poder reutilizarla desde la
 * prueba de extremo a extremo (misma logica que el endpoint, sin HTTP).
 */
export declare function guardarFacturaCompleta(req: {
    currentUser?: {
        id?: string;
    };
}, factura: FacturaExtraida, textoOcr: string, filename: string): Promise<`${string}-${string}-${string}-${string}-${string}`>;
export declare function handleUploadFactura(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
