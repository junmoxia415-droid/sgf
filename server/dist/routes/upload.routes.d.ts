import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
/**
 * Normaliza el periodo de consumo para poder compararlo entre facturas:
 * "SEPTIEMBRE 2025", "Septiembre/2025" y "09/2025" deben considerarse iguales.
 * Si no se reconoce el formato se devuelve el texto en mayusculas y sin espacios
 * sobrantes, que sigue sirviendo para comparar "igual con igual".
 */
export declare function normalizarPeriodo(periodo: string | null | undefined): string;
export declare function handleUploadFactura(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
