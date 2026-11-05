// Una identidad previa ficticia nunca se reemplaza ni altera al actualizar SGF.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {X509Certificate} from 'node:crypto';import selfsigned from 'selfsigned';
import {estadoRedProtegida,prepararRedProtegida} from '../dist/utils/red-protegida.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sgf-cert-anterior-'));const nombre='sgf-012345abcdef.local';const red=path.join(dir,'red-protegida');
try {
 fs.mkdirSync(red);fs.writeFileSync(path.join(dir,'nombre-red.json'),JSON.stringify({nombre:'sgf-012345abcdef'}));
 const opt={keyType:'ec',curve:'P-256',algorithm:'sha256',notBeforeDate:new Date(Date.now()-300000),notAfterDate:new Date(Date.now()+86400000)};
 const ca=await selfsigned.generate([{name:'commonName',value:'CA ficticia'}],{...opt,extensions:[{name:'basicConstraints',cA:true,critical:true},{name:'keyUsage',keyCertSign:true,cRLSign:true,critical:true}]});
 const server=await selfsigned.generate([{name:'commonName',value:nombre}],{...opt,ca:{key:ca.private,cert:ca.cert},extensions:[{name:'basicConstraints',cA:false,critical:true},{name:'keyUsage',digitalSignature:true,critical:true},{name:'extKeyUsage',serverAuth:true},{name:'subjectAltName',altNames:[{type:2,value:nombre}]}]});
 const huella=new X509Certificate(ca.cert).fingerprint256.replaceAll(':','').toLowerCase();
 for(const [file,value] of Object.entries({'autoridad-publica.crt':ca.cert,'servidor.crt':server.cert,'servidor-clave.pem':server.private,'identidad.json':JSON.stringify({nombre,huella})}))fs.writeFileSync(path.join(red,file),value);
 const antes=fs.readFileSync(path.join(red,'servidor.crt'),'utf8');
 assert.equal(estadoRedProtegida(dir).cubreNombreAmigable,false);
 assert.equal((await prepararRedProtegida(dir)).cubreNombreAmigable,false);
 assert.equal(fs.readFileSync(path.join(red,'servidor.crt'),'utf8'),antes);
 console.log('OK: certificado anterior se conserva exactamente y señala que no cubre el nombre corto.');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
