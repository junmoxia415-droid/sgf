import type { ServerResponse } from 'node:http';
import { query } from '../models/database.js';
import { requireAdmin, sendJson, type AuthenticatedRequest } from '../middleware/auth.js';

/** Resumen global para el administrador, sin exponer el panel ni los secretos de consola. */
export async function handleInicioResumen(req: AuthenticatedRequest, res: ServerResponse) {
  if (!requireAdmin(req, res)) return;
  try {
    const contar = async (tabla: string) => {
      // Los nombres son constantes internas, nunca vienen de la petición.
      const [row] = await query<any>(`SELECT COUNT(*) AS CNT FROM ${tabla}`);
      const numero = row?.CNT ?? row?.cnt;
      if (numero == null || !Number.isFinite(Number(numero))) throw new Error('Recuento no disponible');
      return Number(numero);
    };
    const facturas = await contar('SGF_FACTURAS');
    const servicios = await contar('SGF_SERVICIOS');
    const lineasExcel = await contar('SGF_LINEAS_IMPORTADAS');
    const usuarios = await contar('SGF_USUARIOS');
    return sendJson(res, 200, { success: true, data: { facturas, servicios, lineasExcel, usuarios } });
  } catch {
    return sendJson(res, 503, { success: false, error: 'No se pudo cargar el resumen de datos.' });
  }
}
