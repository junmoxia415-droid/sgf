// Experimento aislado: certificados aleatorios y datos ficticios en memoria.
// No modifica el almacén de confianza del sistema ni inicia SGF en la red.
import {crearIdentidadRed} from '../dist/utils/identidad-red.js';
import {createHash} from 'node:crypto';
import https from 'node:https';
import {once} from 'node:events';
import assert from 'node:assert/strict';

const nombre='sgf-123456789abc.local';
await assert.rejects(crearIdentidadRed('otro-dominio.local'));
const identidad=await crearIdentidadRed(nombre);
const huella=createHash('sha256').update(Buffer.from(identidad.autoridadPublica.replace(/-----[^-]+-----/g,'').replace(/\s/g,''),'base64')).digest('hex');
assert.equal(identidad.huellaAutoridad,huella);
assert.deepEqual(Object.keys(identidad).sort(),['autoridadPublica','caduca','certificadoServidor','claveServidor','huellaAutoridad','nombre'].sort());
assert.ok(!identidad.autoridadPublica.includes('PRIVATE KEY'));
let peticiones=0;
const servidor=https.createServer({key:identidad.claveServidor,cert:identidad.certificadoServidor,minVersion:'TLSv1.2'},(req,res)=>{peticiones++;req.resume();res.end('OK');});
servidor.listen(0,'127.0.0.1');await once(servidor,'listening');const port=servidor.address().port;
function solicitar(opciones={}) {return new Promise((resolve,reject)=>{
 const req=https.request({host:'127.0.0.1',port,method:'POST',path:'/',servername:nombre,...opciones},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
 req.on('error',reject);req.end('datos ficticios');
});}
try {
 await assert.rejects(solicitar());assert.equal(peticiones,0,'Sin confianza no debe llegar ningún cuerpo.');
 await assert.rejects(solicitar({ca:identidad.autoridadPublica,servername:'otra.local'}));assert.equal(peticiones,0,'Nombre incorrecto debe rechazar el servidor.');
 assert.equal(await solicitar({ca:identidad.autoridadPublica}),200);assert.equal(peticiones,1);
 console.log('OK: HTTPS aislado con CA ficticia; rechaza confianza o nombre incorrectos antes del envío. No se instaló certificado alguno.');
} finally {servidor.close();await once(servidor,'close');}
