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
export function esPeticionLocal(req) {
    // Si hay un proxy delante, X-Forwarded-For delata que no es una conexion directa.
    if (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])
        return false;
    const remoto = String(req.socket?.remoteAddress || "").toLowerCase();
    if (!LOOPBACK.has(remoto))
        return false;
    return true;
}
export function tokenConsolaConfigurado() {
    return String(process.env.SGF_CONSOLE_TOKEN || "").length >= 16;
}
function compararTiempoConstante(a, b) {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length === 0 || ba.length !== bb.length)
        return false;
    let diff = 0;
    for (let i = 0; i < ba.length; i += 1)
        diff |= ba[i] ^ bb[i];
    return diff === 0;
}
/** ¿La peticion viene de la consola local con el token correcto? */
export function esConsolaLocal(req) {
    if (!tokenConsolaConfigurado())
        return false;
    if (!esPeticionLocal(req))
        return false;
    const recibido = String(req.headers["x-sgf-console-token"] || "");
    return compararTiempoConstante(recibido, String(process.env.SGF_CONSOLE_TOKEN || ""));
}
/**
 * Middleware "solo este equipo": bloquea las rutas de administracion local
 * (arrancar/parar, diagnostico, copias de seguridad) a cualquier maquina de la
 * red, aunque conozca la direccion y el puerto.
 */
export function requiereEquipoLocal(req) {
    return esPeticionLocal(req);
}
//# sourceMappingURL=local.js.map