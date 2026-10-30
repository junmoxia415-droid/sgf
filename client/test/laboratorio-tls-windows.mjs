// Solo en una VM de CI efímera: importa y elimina una CA ficticia en el
// almacén de la máquina de prueba. No instala certificados en ninguna PC real.
import {chromium} from 'playwright';
import {crearIdentidadRed} from '../../server/dist/utils/identidad-red.js';
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
const identidad=await crearIdentidadRed(nombre);
const huella=new X509Certificate(identidad.autoridadPublica).fingerprint.replaceAll(':','');
const archivo=join(dir,'publico.cer');writeFileSync(archivo,identidad.autoridadPublica);
const servidor=https.createServer({key:identidad.claveServidor,cert:identidad.certificadoServidor},(req,res)=>{res.end('laboratorio seguro');});
servidor.listen(0,'127.0.0.1');await once(servidor,'listening');const puerto=servidor.address().port;
async function probar(host,confiar,errorEsperado) {
 const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP *.local 127.0.0.1']});
 try {
  const page=await browser.newPage({ignoreHTTPSErrors:false});
  if(confiar) {const r=await page.goto(`https://${host}:${puerto}/`);assert.equal(r.status(),200);assert.equal(await page.textContent('body'),'laboratorio seguro');}
  else await assert.rejects(page.goto(`https://${host}:${puerto}/`),e=>String(e).includes(errorEsperado));
 } finally {await browser.close();}
}
let intentoImportacion=false, importada=false;
try {
 await probar(nombre,false,'ERR_CERT_AUTHORITY_INVALID');
 intentoImportacion=true;
 execFileSync('certutil.exe',['-addstore','-f','Root',archivo],{stdio:'pipe',timeout:30000});importada=true;
 await probar(nombre,true);
 await probar('nombre-incorrecto.local',false,'ERR_CERT_COMMON_NAME_INVALID');
 execFileSync('certutil.exe',['-delstore','Root',huella],{stdio:'pipe',timeout:30000});importada=false;intentoImportacion=false;
 await probar(nombre,false,'ERR_CERT_AUTHORITY_INVALID');
 console.log('OK: Chromium Windows exige CA y nombre correcto; la CA temporal se retiró de la VM.');
} finally {
 let errorLimpieza;
 if(intentoImportacion) {
  try {execFileSync('certutil.exe',['-delstore','Root',huella],{stdio:'pipe',timeout:30000});}
  catch (e) {if(importada) errorLimpieza=e; else console.warn('La CA temporal no estaba instalada o no se pudo retirar de la VM efímera.');}
 }
 servidor.close();await once(servidor,'close');rmSync(dir,{recursive:true,force:true});
 if(errorLimpieza) throw errorLimpieza;
}
