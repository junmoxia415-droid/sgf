import type { IncomingMessage } from "node:http";

/**
 * Consola local (aplicacion de escritorio).
 *
 * La app Flutter administra el servidor que ella misma arranca en el mismo
 * equipo. Para no obligar al usuario a iniciar sesion *antes* de poder
 * arrancar/reparar nada (p. ej. cuando la BD enterprise esta caida), el
 * servidor acepta un token de consola que:
 *
 *   - llega en la cabecera x-sgf-console-token;
 *   - coincide con SGF_CONSOLE_TOKEN, que la app genera en cada arranque con
 *     32 bytes aleatorios y pasa al proceso por variable de entorno;
 *   - y la peticion viene de este mismo equipo (loopback).
 *
 * No hay valor por defecto: sin la variable de entorno el modo consola queda
 * desactivado y todo vuelve a exigir sesion normal.
 */

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);

export function esPeticionLocal(req: IncomingMessage): boolean {
  // Si hay un proxy delante, X-Forwarded-For delata que no es una conexion directa.
  if (req.headers["x-forwarded-for"] || req.headers["x-real-ip"]) return false;
  const remoto = String(req.socket?.remoteAddress || "").toLowerCase();
  if (!LOOPBACK.has(remoto)) return false;
  return true;
}

export function tokenConsolaConfigurado(): boolean {
  return String(process.env.SGF_CONSOLE_TOKEN || "").length >= 16;
}

function compararTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length === 0 || ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i += 1) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

/** ¿La peticion viene de la consola local con el token correcto? */
export function esConsolaLocal(req: IncomingMessage): boolean {
  if (!tokenConsolaConfigurado()) return false;
  if (!esPeticionLocal(req)) return false;
  const recibido = String(req.headers["x-sgf-console-token"] || "");
  return compararTiempoConstante(recibido, String(process.env.SGF_CONSOLE_TOKEN || ""));
}

/**
 * Middleware "solo este equipo": bloquea las rutas de administracion local
 * (arrancar/parar, diagnostico, copias de seguridad) a cualquier maquina de la
 * red, aunque conozca la direccion y el puerto.
 */
export function requiereEquipoLocal(req: IncomingMessage): boolean {
  return esPeticionLocal(req);
}

/** Solo IPv4 de redes privadas o loopback; no confiar en cabeceras de proxy. */
export function esRedPrivada(req: IncomingMessage): boolean {
  let ip = String(req.socket?.remoteAddress || '').toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') return true;
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return p[0] === 127 || p[0] === 10 || (p[0] === 192 && p[1] === 168) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 169 && p[1] === 254);
}
