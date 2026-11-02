import selfsigned from 'selfsigned';
import {createPrivateKey,randomBytes,X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';

/** Identidad de laboratorio. La clave de CA no se devuelve ni se escribe.
 * No habilita HTTPS por sí sola: falta un almacén de clave protegido, instalación
 * consentida de confianza y coordinación segura con el servicio de Windows. */
export function nombreDnsValido(nombre:string):boolean {
  if(nombre.length>253 || !nombre.includes('.') || nombre!==nombre.toLowerCase()) return false;
  const partes=nombre.split('.');
  return partes.every(p=>p.length>0 && p.length<=63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(p)) &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(nombre) && nombre!=='localhost.localdomain';
}
export async function crearIdentidadRed(nombre:string,dns?:string,ip?:string) {
  if(!/^sgf-[a-f0-9]{12}\.local$/.test(nombre) || (dns && !nombreDnsValido(dns)) || (ip && isIP(ip)!==4)) throw new Error('Nombre o IP de SGF inválido.');
  const ahora=Date.now();
  const comun={keyType:'ec' as const,curve:'P-256' as const,algorithm:'sha256',notBeforeDate:new Date(ahora-300000)};
  const autoridad=await selfsigned.generate([{name:'commonName',value:`SGF red ${randomBytes(8).toString('hex')}`}],{
    ...comun,notAfterDate:new Date(ahora+730*86400000),
    extensions:[{name:'basicConstraints',cA:true,critical:true,pathLenConstraint:0},{name:'keyUsage',keyCertSign:true,cRLSign:true,critical:true}],
  });
  const servidor=await selfsigned.generate([{name:'commonName',value:nombre}],{
    ...comun,notAfterDate:new Date(ahora+365*86400000),ca:{key:autoridad.private,cert:autoridad.cert},
    extensions:[{name:'basicConstraints',cA:false,critical:true},{name:'keyUsage',digitalSignature:true,critical:true},{name:'extKeyUsage',serverAuth:true},{name:'subjectAltName',altNames:[{type:2,value:nombre},...(dns ? [{type:2 as const,value:dns}] : []),...(ip ? [{type:7 as const,ip}] : [])]}],
  });
  const raiz=new X509Certificate(autoridad.cert), hoja=new X509Certificate(servidor.cert);
  if(!raiz.ca || hoja.ca || !hoja.verify(raiz.publicKey) || !hoja.checkPrivateKey(createPrivateKey(servidor.private)) || hoja.checkHost(nombre)!==nombre || (dns && hoja.checkHost(dns)!==dns) || (ip && hoja.checkIP(ip)!==ip)) {
    throw new Error('No se pudo validar la identidad de red generada.');
  }
  return {
    autoridadPublica:autoridad.cert,
    certificadoServidor:servidor.cert,
    claveServidor:servidor.private,
    huellaAutoridad:raiz.fingerprint256.replaceAll(':','').toLowerCase(),
    nombre,
    caduca:hoja.validTo,
  };
}
