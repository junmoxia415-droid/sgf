import https from 'node:https';
import {createHmac, X509Certificate} from 'node:crypto';
import selfsigned from 'selfsigned';
import type {Server as ServidorHttp} from 'node:http';

/** Canal cifrado y efímero para la app local. No cambia el HTTP de la LAN. */
export async function iniciarControlTls(http:ServidorHttp, token:string):Promise<https.Server> {
  if(token.length<16) throw new Error('No se ha configurado el token local.');
  const ahora=Date.now();
  const cert=await selfsigned.generate([{name:'commonName',value:'SGF local'}],{
    keyType:'ec', curve:'P-256', algorithm:'sha256',
    notBeforeDate:new Date(ahora-300000), notAfterDate:new Date(ahora+3650*24*60*60*1000),
    extensions:[{name:'basicConstraints',cA:false},{name:'subjectAltName',altNames:[{type:7,ip:'127.0.0.1'}]}],
  });
  const huella=new X509Certificate(cert.cert).fingerprint256.replaceAll(':','').toLowerCase();
  const servidor=https.createServer({key:cert.private,cert:cert.cert,minVersion:'TLSv1.2'},(req,res)=>http.emit('request',req,res));
  await new Promise<void>((resolve,reject)=>{
    const fallar=(e:Error)=>reject(e);servidor.once('error',fallar);
    servidor.listen(0,'127.0.0.1',()=>{servidor.off('error',fallar);resolve();});
  });
  const direccion=servidor.address();
  if(!direccion || typeof direccion==='string') {servidor.close();throw new Error('No se pudo abrir el canal local seguro.');}
  const puerto=direccion.port;
  const mac=createHmac('sha256',token).update(`SGF_TLS:${puerto}:${huella}`).digest('hex');
  // La app comprueba el MAC con el token pasado a este proceso. No se imprime
  // ninguna clave privada ni el token. La marca viaja únicamente por stdout.
  console.log(`[SGF_TLS] ${JSON.stringify({puerto,huella,mac})}`);
  return servidor;
}
