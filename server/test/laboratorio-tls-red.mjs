// Experimento aislado: certificados aleatorios y datos ficticios en memoria.
// No modifica el almacén de confianza del sistema ni inicia SGF en la red.
import selfsigned from 'selfsigned';
import {createHash} from 'node:crypto';
import https from 'node:https';
import {once} from 'node:events';
import assert from 'node:assert/strict';

const nombre='sgf-123456789abc.local';
const ahora=Date.now();
const opciones={keyType:'ec',curve:'P-256',algorithm:'sha256',notBeforeDate:new Date(ahora-300000),notAfterDate:new Date(ahora+365*86400000)};
const autoridad=await selfsigned.generate([{name:'commonName',value:'SGF laboratorio privado'}],{...opciones,extensions:[{name:'basicConstraints',cA:true,critical:true,pathLenConstraint:0},{name:'keyUsage',keyCertSign:true,cRLSign:true,critical:true}]});
const identidad=await selfsigned.generate([{name:'commonName',value:nombre}],{...opciones,ca:{key:autoridad.private,cert:autoridad.cert},extensions:[{name:'basicConstraints',cA:false,critical:true},{name:'keyUsage',digitalSignature:true,critical:true},{name:'extKeyUsage',serverAuth:true},{name:'subjectAltName',altNames:[{type:2,value:nombre}]}]});
const huella=createHash('sha256').update(Buffer.from(autoridad.cert.replace(/-----[^-]+-----/g,'').replace(/\s/g,''),'base64')).digest('hex');
assert.match(huella,/^[a-f0-9]{64}$/);
let peticiones=0;
const servidor=https.createServer({key:identidad.private,cert:identidad.cert,minVersion:'TLSv1.2'},(req,res)=>{peticiones++;req.resume();res.end('OK');});
servidor.listen(0,'127.0.0.1');await once(servidor,'listening');const port=servidor.address().port;
function solicitar(opciones={}) {return new Promise((resolve,reject)=>{
 const req=https.request({host:'127.0.0.1',port,method:'POST',path:'/',servername:nombre,...opciones},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
 req.on('error',reject);req.end('datos ficticios');
});}
try {
 await assert.rejects(solicitar());assert.equal(peticiones,0,'Sin confianza no debe llegar ningún cuerpo.');
 await assert.rejects(solicitar({ca:autoridad.cert,servername:'otra.local'}));assert.equal(peticiones,0,'Nombre incorrecto debe rechazar el servidor.');
 assert.equal(await solicitar({ca:autoridad.cert}),200);assert.equal(peticiones,1);
 console.log('OK: HTTPS aislado con CA ficticia; rechaza confianza o nombre incorrectos antes del envío. No se instaló certificado alguno.');
} finally {servidor.close();await once(servidor,'close');}
