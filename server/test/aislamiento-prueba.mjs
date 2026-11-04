// El modo experimental no utiliza Oracle/MSSQL, ni siquiera con un DB_TYPE heredado.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import net from 'node:net'; import http from 'node:http';
import {spawn} from 'node:child_process'; import {once} from 'node:events';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sgf-aislado-'));
const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
const token='token-consola-solo-para-pruebas';
const p=spawn(process.execPath,['--no-warnings','dist/index.js'],{env:{...process.env,SGF_PRUEBA_AISLADA:'1',DB_TYPE:'oracle',SGF_DATA_DIR:dir,SGF_ENV_FILE:path.join(dir,'ausente'),HOST:'127.0.0.1',PORT:String(port),JWT_SECRET:'secreto-solo-para-pruebas-123456',SGF_CONSOLE_TOKEN:token,SGF_MDNS:'0'},stdio:['ignore','pipe','pipe']});
let logs='';p.stdout.on('data',x=>logs+=x);p.stderr.on('data',x=>logs+=x);
const pedir=(ruta,method='GET',body)=>new Promise((resolve,reject)=>{const datos=body?JSON.stringify(body):'';const req=http.request({host:'127.0.0.1',port,path:ruta,method,headers:{'x-sgf-console-token':token,...(body?{'content-type':'application/json','content-length':Buffer.byteLength(datos)}:{})}},r=>{let b='';r.on('data',x=>b+=x);r.on('end',()=>resolve({status:r.statusCode,body:JSON.parse(b)}));});req.on('error',reject);req.end(datos);});
try {
 let salud;for(let i=0;i<150;i++){try{salud=await pedir('/api/health');break;}catch{if(p.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}}
 assert.equal(salud.status,200,logs);
 const cfg=await pedir('/api/db/config');assert.equal(cfg.status,200);assert.equal(cfg.body.data.mode,'sqlite');
 for(const type of ['oracle','mssql'])for(const endpoint of ['/api/db/test','/api/db/connect']){
  const r=await pedir(endpoint,'POST',{type,host:'198.51.100.10',server:'198.51.100.10',port:'1'});assert.equal(r.status,403);
 }
 const fin=once(p,'exit');assert.equal((await pedir('/api/panel/apagar','POST',{})).status,200);assert.equal((await fin)[0],0);
 console.log('OK: edición aislada fuerza SQLite y bloquea conexiones externas, sin usar bases reales.');
} finally {if(p.exitCode===null){p.kill('SIGKILL');await once(p,'exit');}fs.rmSync(dir,{recursive:true,force:true});}
