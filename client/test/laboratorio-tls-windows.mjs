// Solo en una VM de CI efímera: importa y elimina una CA ficticia en el
// almacén de la máquina de prueba. No instala certificados en ninguna PC real.
import {chromium} from 'playwright';
import selfsigned from '../../server/node_modules/selfsigned/index.js';
import {X509Certificate} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import https from 'node:https';
import assert from 'node:assert/strict';
if(process.platform!=='win32' || process.env.SGF_TEST_WINDOWS_CA!=='1') throw Error('Solo debe ejecutarse en la VM de pruebas Windows autorizada.');
const dir=mkdtempSync(join(tmpdir(),'sgf-ca-lab-')),nombre='sgf-123456789abc.local';
const opciones={keyType:'ec',curve:'P-256',algorithm:'sha256',notBeforeDate:new Date(Date.now()-300000),notAfterDate:new Date(Date.now()+365*86400000)};
const ca=await selfsigned.generate([{name:'commonName',value:'SGF CA temporal de laboratorio'}],{...opciones,extensions:[{name:'basicConstraints',cA:true,critical:true,pathLenConstraint:0},{name:'keyUsage',keyCertSign:true,cRLSign:true,critical:true}]});
const cert=await selfsigned.generate([{name:'commonName',value:nombre}],{...opciones,ca:{key:ca.private,cert:ca.cert},extensions:[{name:'basicConstraints',cA:false,critical:true},{name:'keyUsage',digitalSignature:true,critical:true},{name:'extKeyUsage',serverAuth:true},{name:'subjectAltName',altNames:[{type:2,value:nombre}]}]});
const huella=new X509Certificate(ca.cert).fingerprint.replaceAll(':','');
const archivo=join(dir,'publico.cer');writeFileSync(archivo,ca.cert);
const servidor=https.createServer({key:cert.private,cert:cert.cert},(req,res)=>{res.end('laboratorio seguro');});
servidor.listen(0,'127.0.0.1');await once(servidor,'listening');const puerto=servidor.address().port;
async function probar(host,confiar,errorEsperado) {
 const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP *.local 127.0.0.1']});
 try {
  const page=await browser.newPage({ignoreHTTPSErrors:false});
  if(confiar) {const r=await page.goto(`https://${host}:${puerto}/`);assert.equal(r.status(),200);assert.equal(await page.textContent('body'),'laboratorio seguro');}
  else await assert.rejects(page.goto(`https://${host}:${puerto}/`),e=>String(e).includes(errorEsperado));
 } finally {await browser.close();}
}
let intentoImportacion=false;
try {
 await probar(nombre,false,'ERR_CERT_AUTHORITY_INVALID');
 intentoImportacion=true;
 execFileSync('certutil.exe',['-addstore','-f','Root',archivo],{stdio:'pipe',timeout:30000});
 await probar(nombre,true);
 await probar('nombre-incorrecto.local',false,'ERR_CERT_COMMON_NAME_INVALID');
 console.log('OK: Chromium Windows exige CA y nombre correcto en VM efímera.');
} finally {
 if(intentoImportacion) {
  try {execFileSync('certutil.exe',['-delstore','Root',huella],{stdio:'pipe',timeout:30000});}
  catch {console.warn('La CA temporal no estaba instalada o no se pudo retirar de la VM efímera.');}
 }
 servidor.close();await once(servidor,'close');rmSync(dir,{recursive:true,force:true});
}
