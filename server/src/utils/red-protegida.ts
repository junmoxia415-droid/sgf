import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createPrivateKey, X509Certificate} from 'node:crypto';
import {crearIdentidadRed, nombreDnsValido} from './identidad-red.js';
import {lookup} from 'node:dns/promises';
import os from 'node:os';
import {isIP} from 'node:net';
import {nombrePersistido} from './nombre-red.js';

// Solo crea datos para el usuario actual; no modifica el almacén de certificados,
// el cortafuegos ni las políticas. En cuanto existe la carpeta, un inicio con
// identidad incompleta debe fallar cerrado: nunca volver silenciosamente a HTTP.
export type EstadoRedProtegida = {
  activo: true; nombre: string; huella: string; caduca: string;
  certificadoPublico: string; certificadoServidor: string; claveServidor: string; dns?:string; ip?:string; ips?:string[];
};
const carpetaRed=(datos:string)=>path.join(datos,'red-protegida');
function archivoRegular(p:string) {
  const st=fs.lstatSync(p);
  if(!st.isFile() || st.isSymbolicLink()) throw new Error('La identidad de red contiene un archivo no válido.');
}
function protegerDirectorio(carpeta:string) {
  if(process.platform!=='win32') { fs.chmodSync(carpeta,0o700); return; }
  // ACL propia: usuario actual, SYSTEM y administradores locales. No hay
  // herencia ni acceso a otros usuarios; no se alteran ACL de carpetas ajenas.
  const salida=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true});
  const sid=salida.match(/S-1-5-(?:\d+-)*\d+/i)?.[0];
  if(!sid || /^S-1-5-(18|19|20)$/i.test(sid)) throw new Error('La identidad de usuario no es adecuada para proteger la clave.');
  execFileSync('icacls.exe',[carpeta,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
}
export function estadoRedProtegida(datos:string):EstadoRedProtegida|null {
  if(!path.isAbsolute(datos)) throw new Error('La carpeta de datos debe ser absoluta.');
  const dir=carpetaRed(datos);
  let st:fs.Stats;
  try {st=fs.lstatSync(dir);} catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT') return null;throw error;}
  if(!st.isDirectory() || st.isSymbolicLink()) throw new Error('La carpeta de identidad de red no es válida.');
  const pub=path.join(dir,'autoridad-publica.crt'),cert=path.join(dir,'servidor.crt'),key=path.join(dir,'servidor-clave.pem'),info=path.join(dir,'identidad.json');
  for(const p of [pub,cert,key,info]) archivoRegular(p);
  const guardado=JSON.parse(fs.readFileSync(info,'utf8'));
  const nombre=`${nombrePersistido(datos)}.local`;
  if(guardado.nombre!==nombre || (guardado.dns!==undefined && (typeof guardado.dns!=='string' || !nombreDnsValido(guardado.dns))) || (guardado.ip!==undefined && (typeof guardado.ip!=='string' || isIP(guardado.ip)!==4))) throw new Error('La identidad no coincide con el nombre persistente.');
  if(guardado.ips!==undefined && (!Array.isArray(guardado.ips) || guardado.ips.length>32 || guardado.ips.some((ip:unknown)=>typeof ip!=='string' || isIP(ip)!==4) || new Set(guardado.ips).size!==guardado.ips.length || (guardado.ip && !guardado.ips.includes(guardado.ip)))) throw new Error('La lista de IP de la identidad no es válida.');
  const raiz=new X509Certificate(fs.readFileSync(pub));
  const hoja=new X509Certificate(fs.readFileSync(cert));
  const huella=raiz.fingerprint256.replaceAll(':','').toLowerCase();
  const ahora=Date.now();
  if(!raiz.ca || !raiz.verify(raiz.publicKey) || hoja.ca || !hoja.verify(raiz.publicKey) ||
     !hoja.checkPrivateKey(createPrivateKey(fs.readFileSync(key))) || hoja.checkHost(nombre)!==nombre ||
     (guardado.dns && hoja.checkHost(guardado.dns)!==guardado.dns) || (guardado.ip && hoja.checkIP(guardado.ip)!==guardado.ip) || (guardado.ips && guardado.ips.some((ip:string)=>hoja.checkIP(ip)!==ip)) || guardado.huella!==huella || Date.parse(raiz.validFrom)>ahora || Date.parse(raiz.validTo)<=ahora ||
     Date.parse(hoja.validFrom)>ahora || Date.parse(hoja.validTo)<=ahora) {
    throw new Error('El certificado de red, su clave o su vigencia no son válidos.');
  }
  return {activo:true,nombre,huella,caduca:hoja.validTo,certificadoPublico:pub,certificadoServidor:cert,claveServidor:key,dns:guardado.dns,ip:guardado.ip,ips:guardado.ips};
}
export async function prepararRedProtegida(datos:string,dns?:string,ipSolicitada?:string, opciones?: {locales:()=>string[]; resolver:(nombre:string)=>Promise<string[]>}):Promise<EstadoRedProtegida> {
  if(!path.isAbsolute(datos)) throw new Error('La carpeta de datos debe ser absoluta.');
  fs.mkdirSync(datos,{recursive:true});
  const padre=fs.lstatSync(datos);
  if(!padre.isDirectory() || padre.isSymbolicLink()) throw new Error('La carpeta de datos no es válida.');
  const anterior=estadoRedProtegida(datos);
  if(anterior) {
    if((dns && anterior.dns!==dns) || (ipSolicitada && anterior.ip!==ipSolicitada)) throw new Error('La identidad existente no incluye ese nombre o IP. No se reemplazará automáticamente.');
    return anterior; // nunca reemplazar certificados ya distribuidos
  }
  const locales=new Set(opciones ? opciones.locales() : Object.values(os.networkInterfaces()).flatMap(x=>x || []).filter(x=>!x.internal && x.family==='IPv4').map(x=>x.address));
  if(ipSolicitada && (isIP(ipSolicitada)!==4 || !locales.has(ipSolicitada))) throw new Error('La IP elegida no pertenece a una interfaz IPv4 de este equipo.');
  let ip:string|undefined = ipSolicitada;
  if(dns) {
    if(!nombreDnsValido(dns)) throw new Error('El nombre DNS no es válido.');
    const resueltos=opciones ? await opciones.resolver(dns) : (await lookup(dns,{all:true,family:4})).map(x=>x.address);
    const coincidentes=[...new Set(resueltos.filter(x=>locales.has(x)))];
    if(coincidentes.length!==1 || resueltos.some(x=>!locales.has(x)) || (ip && ip!==coincidentes[0])) throw new Error('El nombre DNS debe apuntar solamente a la dirección IPv4 elegida de este equipo.');
    ip=coincidentes[0];
  } else if(!ip && locales.size===1) {
    ip=[...locales][0];
  }
  // Incluir las interfaces de esta PC en identidades nuevas. Nunca renovar ni
  // alterar silenciosamente una identidad que ya fue distribuida.
  const ips=[...locales].filter(x=>isIP(x)===4).sort();
  if(ips.length>32) throw new Error('Hay demasiadas interfaces de red.');
  if(ip && !ips.includes(ip)) throw new Error('La IP no pertenece a este equipo.');
  const nombre=`${nombrePersistido(datos)}.local`;
  const dir=carpetaRed(datos);
  // La carpeta final es también el marcador de modo seguro: si la generación
  // se interrumpe, el siguiente arranque fallará en vez de habilitar HTTP.
  fs.mkdirSync(dir,{mode:0o700});
  try {
    protegerDirectorio(dir);
    const identidad=await crearIdentidadRed(nombre,dns,ip,ips);
    fs.writeFileSync(path.join(dir,'servidor-clave.pem'),identidad.claveServidor,{mode:0o600,flag:'wx'});
    fs.writeFileSync(path.join(dir,'servidor.crt'),identidad.certificadoServidor,{mode:0o600,flag:'wx'});
    fs.writeFileSync(path.join(dir,'autoridad-publica.crt'),identidad.autoridadPublica,{mode:0o600,flag:'wx'});
    fs.writeFileSync(path.join(dir,'identidad.json'),JSON.stringify({nombre,huella:identidad.huellaAutoridad,...(dns ? {dns} : {}),...(ip ? {ip} : {}),ips}),{mode:0o600,flag:'wx'});
    const estado=estadoRedProtegida(datos);
    if(!estado) throw new Error('No se pudo comprobar la identidad generada.');
    return estado;
  } catch(error) {
    // No borrar nada que pueda haber sido escrito. Una identidad incompleta se
    // señala explícitamente para revisión; nunca se regenera silenciosamente.
    throw error;
  }
}
