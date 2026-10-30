import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import {createPrivateKey,X509Certificate} from 'node:crypto';
import type {Server as ServidorHttp} from 'node:http';

/** Receptor experimental: no genera ni instala certificados, y falla cerrado.
 * Las rutas deben apuntar a archivos previamente protegidos por el instalador.
 * Esta función sola no habilita el modo de servicio ni lo distribuye. */
export function prepararEscuchaRedSegura(http:ServidorHttp,certPath:string,keyPath:string,nombre:string):https.Server {
  if(!path.isAbsolute(certPath) || !path.isAbsolute(keyPath) || !/^sgf-[a-f0-9]{12}\.local$/.test(nombre)) throw new Error('Falta la identidad HTTPS de la red.');
  const cert=fs.readFileSync(certPath,'utf8'), key=fs.readFileSync(keyPath,'utf8');
  const x=new X509Certificate(cert), ahora=Date.now();
  if(x.ca || !x.checkPrivateKey(createPrivateKey(key)) || x.checkHost(nombre)!==nombre ||
     Date.parse(x.validFrom)>ahora || Date.parse(x.validTo)<=ahora) throw new Error('La identidad HTTPS de red no es válida.');
  return https.createServer({cert,key,minVersion:'TLSv1.2'},(req,res)=>http.emit('request',req,res));
}
