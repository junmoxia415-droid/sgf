// Gestión explícita de la identidad de la red por la aplicación local.
// No publica la clave privada ni toca certificados globales.
import path from 'node:path';
import {estadoRedProtegida,prepararRedProtegida} from '../utils/red-protegida.js';

const [operacion,carpeta,dns,ip]=process.argv.slice(2);
try {
  if(!carpeta || !path.isAbsolute(carpeta) || !['estado','preparar'].includes(operacion)) throw new Error('Solicitud de identidad de red inválida.');
  const r=operacion==='preparar' ? await prepararRedProtegida(carpeta,dns || undefined,ip || undefined) : estadoRedProtegida(carpeta);
  console.log(JSON.stringify(r ? {activo:true,nombre:r.nombre,dns:r.dns,ip:r.ip,ips:r.ips,huella:r.huella,caduca:r.caduca,certificadoPublico:r.certificadoPublico} : {activo:false}));
} catch(error:any) {
  console.error(`No se pudo preparar o comprobar la identidad de red: ${error?.message || 'error desconocido'}`);
  process.exitCode=1;
}
