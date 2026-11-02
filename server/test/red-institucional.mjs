// HTTPS real con nombre DNS ficticio, puerto alternativo y SQLite temporal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {crearIdentidadRed} from '../dist/utils/identidad-red.js';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sgf-institucional-'));
const nombre='sgf-123456789abc.local', dns='equipo.empresa.example';
let proceso;
try {
 const identidad=await crearIdentidadRed(nombre,dns,'127.0.0.1'), carpeta=path.join(tmp,'red-protegida');fs.mkdirSync(carpeta);
 fs.writeFileSync(path.join(tmp,'nombre-red.json'),JSON.stringify({nombre:'sgf-123456789abc'}));
 fs.writeFileSync(path.join(tmp,'redes-autorizadas.json'),JSON.stringify({version:1,redes:['203.0.113.0/24']}));
 fs.writeFileSync(path.join(carpeta,'servidor-clave.pem'),identidad.claveServidor);
 fs.writeFileSync(path.join(carpeta,'servidor.crt'),identidad.certificadoServidor);
 fs.writeFileSync(path.join(carpeta,'autoridad-publica.crt'),identidad.autoridadPublica);
 fs.writeFileSync(path.join(carpeta,'identidad.json'),JSON.stringify({nombre,dns,ip:'127.0.0.1',huella:identidad.huellaAutoridad}));
 const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const puerto=socket.address().port;await new Promise(r=>socket.close(r));
 proceso=spawn(process.execPath,['dist/index.js'],{env:{...process.env,SGF_DATA_DIR:tmp,SGF_ENV_FILE:path.join(tmp,'ausente'),SGF_MDNS:'0',DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(puerto),JWT_SECRET:'secreto-solo-para-pruebas-123456',SGF_CONSOLE_TOKEN:'token-solo-para-pruebas-123456'},stdio:['ignore','pipe','pipe']});
 let logs='';proceso.stdout.on('data',b=>logs+=b);proceso.stderr.on('data',b=>logs+=b);
 for(let i=0;i<150&&!logs.includes('[SGF] https://');i++){if(proceso.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 assert.match(logs,/\[SGF\] https:\/\//);
 const get=(servername,ca)=>new Promise((resolve,reject)=>{https.get({host:'127.0.0.1',port:puerto,path:'/api/health',servername,ca},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});
 assert.equal(await get(dns,identidad.autoridadPublica),200);
 assert.equal(await get(undefined,identidad.autoridadPublica),200,'La IP figura en el certificado');
 await assert.rejects(get('otro.empresa.example',identidad.autoridadPublica));
 await assert.rejects(get(dns,undefined));
 const fin=once(proceso,'exit');
 const cierre=await new Promise((resolve,reject)=>{const req=https.request({host:'127.0.0.1',port:puerto,path:'/api/panel/apagar',method:'POST',servername:dns,ca:identidad.autoridadPublica,headers:{'x-sgf-console-token':'token-solo-para-pruebas-123456','content-type':'application/json'}},r=>{r.resume();resolve(r.statusCode);});req.on('error',reject);req.end('{}');});
 assert.equal(cierre,200);const [code]=await fin;assert.equal(code,0,logs);proceso=null;
 assert(fs.existsSync(path.join(tmp,'sgf-data.db')));
 console.log('OK: SGF real, HTTPS y DNS institucional exacto en puerto alternativo; rechaza nombre y CA incorrectos.');
} finally {if(proceso&&proceso.exitCode===null){proceso.kill('SIGKILL');await once(proceso,'exit');}fs.rmSync(tmp,{recursive:true,force:true});}
