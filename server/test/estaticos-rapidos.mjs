// Servidor de laboratorio; solo archivos compilados del proyecto y SQLite temporal.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import http from 'node:http';import {gunzipSync} from 'node:zlib';import {spawn} from 'node:child_process';import {once} from 'node:events';
const base=path.resolve('../client/dist');
const js=fs.readdirSync(path.join(base,'compat/assets')).find(s=>/^index-.*\.js$/.test(s));assert(js,'Compilar la web antes de esta prueba');
const original=fs.readFileSync(path.join(base,'compat/assets',js));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sgf-gzip-'));
const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
const proc=spawn(process.execPath,['--no-warnings','dist/index.js'],{env:{...process.env,DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(port),SGF_DATA_DIR:dir,SGF_MDNS:'0',SGF_ENV_FILE:path.join(dir,'ausente'),JWT_SECRET:'secreto-solo-para-pruebas-123456',SGF_CONSOLE_TOKEN:'token-consola-ficticio-123'},stdio:['ignore','pipe','pipe']});
let logs='';proc.stdout.on('data',x=>logs+=x);proc.stderr.on('data',x=>logs+=x);
const get=(url,encoding)=>new Promise((resolve,reject)=>{const r=http.get({host:'127.0.0.1',port,path:url,headers:encoding?{'accept-encoding':encoding}:{}},res=>{const b=[];res.on('data',c=>b.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(b)}));});r.on('error',reject);});
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await get('/api/health')).status===200){ready=true;break}}catch{}if(proc.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,80));}assert(ready,logs);
 const url='/compat/assets/'+js;
 const a=await get(url,'gzip, deflate');assert.equal(a.status,200);assert.equal(a.headers['content-encoding'],'gzip');assert.equal(a.headers.vary,'Accept-Encoding');assert.match(a.headers['cache-control'],/immutable/);assert.deepEqual(gunzipSync(a.body),original);assert(a.body.length<original.length*.7);
 const b=await get(url,'gzip;q=0');assert.equal(b.headers['content-encoding'],undefined);assert.deepEqual(b.body,original);
 const c=await get('/compat/index.html','gzip');assert.equal(c.headers['content-encoding'],undefined);assert.match(c.headers['cache-control'],/no-store/);
 console.log(`OK: JS compat ${original.length} bytes → ${a.body.length} bytes gzip; cliente sin gzip recibe original; HTML no queda obsoleto.`);
} finally {if(proc.exitCode===null){proc.kill('SIGTERM');await once(proc,'exit');}fs.rmSync(dir,{recursive:true,force:true});}
