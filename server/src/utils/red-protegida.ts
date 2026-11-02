import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createPrivateKey, X509Certificate} from 'node:crypto';
import {crearIdentidadRed} from './identidad-red.js';
import {nombrePersistido} from './nombre-red.js';

// Solo crea datos para el usuario actual; no modifica el almacén de certificados,
// el cortafuegos ni las políticas. En cuanto existe la carpeta, un inicio con
// identidad incompleta debe fallar cerrado: nunca volver silenciosamente a HTTP.
export type EstadoRedProtegida = {
  activo: true; nombre: string; huella: string; caduca: string;
  certificadoPublico: string; certificadoServidor: string; claveServidor: string;
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
  if(guardado.nombre!==nombre) throw new Error('La identidad no coincide con el nombre persistente.');
  const raiz=new X509Certificate(fs.readFileSync(pub));
  const hoja=new X509Certificate(fs.readFileSync(cert));
  const huella=raiz.fingerprint256.replaceAll(':','').toLowerCase();
  const ahora=Date.now();
  if(!raiz.ca || !raiz.verify(raiz.publicKey) || hoja.ca || !hoja.verify(raiz.publicKey) ||
     !hoja.checkPrivateKey(createPrivateKey(fs.readFileSync(key))) || hoja.checkHost(nombre)!==nombre ||
     guardado.huella!==huella || Date.parse(raiz.validFrom)>ahora || Date.parse(raiz.validTo)<=ahora ||
     Date.parse(hoja.validFrom)>ahora || Date.parse(hoja.validTo)<=ahora) {
    throw new Error('El certificado de red, su clave o su vigencia no son válidos.');
  }
  return {activo:true,nombre,huella,caduca:hoja.validTo,certificadoPublico:pub,certificadoServidor:cert,claveServidor:key};
}
export async function prepararRedProtegida(datos:string):Promise<EstadoRedProtegida> {
  if(!path.isAbsolute(datos)) throw new Error('La carpeta de datos debe ser absoluta.');
  fs.mkdirSync(datos,{recursive:true});
  const padre=fs.lstatSync(datos);
  if(!padre.isDirectory() || padre.isSymbolicLink()) throw new Error('La carpeta de datos no es válida.');
  const anterior=estadoRedProtegida(datos);
  if(anterior) return anterior; // nunca reemplazar certificados ya distribuidos
  const nombre=`${nombrePersistido(datos)}.local`;
  const dir=carpetaRed(datos);
  // La carpeta final es también el marcador de modo seguro: si la generación
  // se interrumpe, el siguiente arranque fallará en vez de habilitar HTTP.
  fs.mkdirSync(dir,{mode:0o700});
  try {
    protegerDirectorio(dir);
    const identidad=await crearIdentidadRed(nombre);
    fs.writeFileSync(path.join(dir,'servidor-clave.pem'),identidad.claveServidor,{mode:0o600,flag:'wx'});
    fs.writeFileSync(path.join(dir,'servidor.crt'),identidad.certificadoServidor,{mode:0o600,flag:'wx'});
    fs.writeFileSync(path.join(dir,'autoridad-publica.crt'),identidad.autoridadPublica,{mode:0o600,flag:'wx'});
    fs.writeFileSync(path.join(dir,'identidad.json'),JSON.stringify({nombre,huella:identidad.huellaAutoridad}),{mode:0o600,flag:'wx'});
    const estado=estadoRedProtegida(datos);
    if(!estado) throw new Error('No se pudo comprobar la identidad generada.');
    return estado;
  } catch(error) {
    // No borrar nada que pueda haber sido escrito. Una identidad incompleta se
    // señala explícitamente para revisión; nunca se regenera silenciosamente.
    throw error;
  }
}
