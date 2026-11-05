import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TLSSocket } from 'node:tls';

// Se crea al arrancar. No se escribe en disco ni se devuelve a clientes LAN.
// El enlace es una invitación, NO sustituye el usuario y contraseña.
const invitacion = randomBytes(32).toString('base64url');
const cookie = '__Host-sgf_red';
const formato = /^[A-Za-z0-9_-]{43}$/;
const intentos = new Map<string, {n:number; hasta:number}>();
function permitidoIntentar(req: IncomingMessage): boolean {
  const ahora=Date.now(), ip=String(req.socket.remoteAddress || '');
  for (const [clave, dato] of intentos) if (dato.hasta <= ahora) intentos.delete(clave);
  let dato=intentos.get(ip);
  if (!dato) {
    if (intentos.size >= 4096) return false;
    dato={n:0,hasta:ahora+60_000}; intentos.set(ip,dato);
  }
  dato.n++;
  return dato.n<=30;
}

function coincide(valor: string): boolean {
  if (!formato.test(valor)) return false;
  const a = Buffer.from(valor, 'utf8'), b = Buffer.from(invitacion, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
export function tlsDirecto(req: IncomingMessage): boolean {
  return Boolean((req.socket as TLSSocket).encrypted) &&
    !req.headers['x-forwarded-for'] && !req.headers['x-real-ip'] && !req.headers.forwarded;
}
function tieneCookie(req: IncomingMessage): boolean {
  const pares = String(req.headers.cookie || '').split(';');
  const valores = pares.map(p => p.trim()).filter(p => p.startsWith(`${cookie}=`));
  return valores.length === 1 && coincide(valores[0].slice(cookie.length + 1));
}
export function codigoInvitacion(): string { return invitacion; }

const pagina = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar con SGF</title><style>body{font:16px system-ui,sans-serif;max-width:38rem;margin:10vh auto;padding:1.5rem;color:#17304c}p{line-height:1.5}</style></head><body><h1>Conectar con SGF</h1><p id="estado">Comprobando el enlace…</p><script>
(function(){var mensaje=document.getElementById('estado');var codigo=new URLSearchParams(location.hash.slice(1)).get('sgf');
if(!codigo){mensaje.textContent='Este enlace no está completo. Copie el enlace que muestra SGF en la computadora servidora.';return;}
fetch('/api/acceso/enlace',{method:'POST',credentials:'same-origin',headers:{'X-SGF-Enlace':codigo}}).then(function(r){if(!r.ok)throw new Error();history.replaceState(null,'',location.pathname+location.search);location.reload();}).catch(function(){mensaje.textContent='No se pudo validar el enlace. Copie de nuevo el enlace que muestra la computadora servidora.';});})();
</script></body></html>`;

/** Maneja el acceso inicial de clientes que no pertenecen a una red autorizada.
 * true significa que la solicitud debe continuar; false que ya se respondió.
 * Nunca habilita HTTP, proxies ni el canal de administración local. */
export function comprobarEnlace(req: IncomingMessage, res: ServerResponse): boolean {
  if (!tlsDirecto(req)) return false;
  const ruta = (req.url || '').split('?')[0];
  if (req.method === 'POST' && ruta === '/api/acceso/enlace') {
    if (!permitidoIntentar(req)) {
      res.writeHead(429, {'Cache-Control':'no-store', 'Retry-After':'60'});
      res.end('Demasiados intentos.');
      return false;
    }
    const origen = req.headers.origin;
    const esperado = `https://${req.headers.host || ''}`;
    const longitud = Number(req.headers['content-length'] || '0');
    if ((origen && origen !== esperado) || req.headers['transfer-encoding'] || longitud !== 0 || !coincide(String(req.headers['x-sgf-enlace'] || ''))) {
      res.writeHead(403, {'Cache-Control':'no-store', 'Content-Type':'text/plain; charset=utf-8'});
      res.end('Enlace no válido.');
      return false;
    }
    res.writeHead(204, {
      'Set-Cookie': `${cookie}=${invitacion}; Path=/; Secure; HttpOnly; SameSite=Strict`,
      'Cache-Control':'no-store',
      'Referrer-Policy':'no-referrer',
    });
    res.end();
    return false;
  }
  if (tieneCookie(req)) return true;
  if (req.method === 'GET' && (ruta === '/' || ruta === '/index.html')) {
    res.writeHead(200, {
      'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Frame-Options':'DENY', 'X-Content-Type-Options':'nosniff',
    });
    res.end(pagina);
    return false;
  }
  return false;
}
