import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { TLSSocket } from 'node:tls';

/** Redes IPv4 adicionales elegidas explícitamente por el administrador.
 * No se confía en cabeceras de proxy y solo se aplican a conexiones TLS. */
export type RedAutorizada = { texto:string; base:number; mascara:number };
function numeroIPv4(ip:string):number|null {
  const partes=ip.split('.');
  if(partes.length!==4 || partes.some(p=>! /^(0|[1-9]\d{0,2})$/.test(p) || Number(p)>255)) return null;
  return partes.reduce((n,p)=>((n<<8)|Number(p))>>>0,0);
}
export function analizarRed(texto:string):RedAutorizada {
  const m=/^((?:\d{1,3}\.){3}\d{1,3})\/(2[4-9]|3[0-2])$/.exec(texto);
  const ip=m ? numeroIPv4(m[1]) : null;
  if(ip===null || !m) throw new Error('Use una dirección IPv4 o red entre /24 y /32.');
  const primer=ip>>>24;
  if(primer===0 || primer===127 || primer>=224 || primer===169 && ((ip>>>16)&255)===254) throw new Error('Esta dirección no es válida como red adicional.');
  const bits=Number(m[2]);const mascara=(0xffffffff << (32-bits))>>>0;
  if(((ip & mascara)>>>0) !== ip) throw new Error('La dirección de red debe empezar en el límite del prefijo.');
  return {texto,base:ip,mascara};
}
export function validarRedes(valor:unknown):RedAutorizada[] {
  if(!Array.isArray(valor) || valor.length>16 || valor.some(x=>typeof x!=='string')) throw new Error('Lista de redes no válida.');
  const redes=valor.map(analizarRed);
  if(new Set(redes.map(x=>x.texto)).size!==redes.length) throw new Error('No repita redes.');
  return redes;
}
export function leerRedes(datos:string):RedAutorizada[] {
  const p=path.join(datos,'redes-autorizadas.json');
  try {
    const st=fs.lstatSync(p);
    if(!st.isFile() || st.isSymbolicLink() || st.size>8192) throw new Error('Archivo de redes no válido.');
    const doc=JSON.parse(fs.readFileSync(p,'utf8'));
    if(doc.version!==1) throw new Error('Versión de redes no válida.');
    return validarRedes(doc.redes);
  } catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT') return [];throw e;}
}
export function coincideRed(ip:string,redes:RedAutorizada[]):boolean {
  if(ip.startsWith('::ffff:')) ip=ip.slice(7);
  const n=numeroIPv4(ip);
  return n!==null && redes.some(r=>((n & r.mascara)>>>0)===r.base);
}
export function permitidaRedAdicional(req:IncomingMessage,redes:RedAutorizada[]):boolean {
  if(!(req.socket as TLSSocket).encrypted || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers.forwarded) return false;
  return coincideRed(String(req.socket.remoteAddress || '').toLowerCase(),redes);
}
