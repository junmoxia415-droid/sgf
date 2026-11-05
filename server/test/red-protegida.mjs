// Identidad HTTPS persistente y SGF real, solo archivos y datos ficticios temporales.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';
import {prepararRedProtegida,estadoRedProtegida} from '../dist/utils/red-protegida.js';
import {nombrePersistido} from '../dist/utils/nombre-red.js';

const dir=mkdtempSync(join(tmpdir(),'sgf-red-protegida-'));
const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));
const espera=ms=>new Promise(r=>setTimeout(r,ms));let proc;
const start=()=>spawn(process.execPath,['dist/index.js'],{env:{...process.env,DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(port),SGF_DATA_DIR:dir,SGF_MDNS:'0',SGF_ENV_FILE:join(dir,'no-existe.env'),JWT_SECRET:'prueba-solo-ficticia-red-123456'},stdio:['ignore','pipe','pipe']});
function get(o) {return new Promise((resolve,reject)=>{const r=https.get({host:'127.0.0.1',port,path:'/api/health',...o},res=>{let b='';res.on('data',x=>b+=x);res.on('end',()=>resolve({status:res.statusCode,body:b}));});r.on('error',reject);});}
try {
  assert.equal(estadoRedProtegida(dir),null);
  const identidad=await prepararRedProtegida(dir);
  assert.match(identidad.nombre,/^sgf-[a-f0-9]{12}\.local$/);
  assert.match(identidad.huella,/^[a-f0-9]{64}$/);
  assert.equal(identidad.cubreNombreAmigable,true,'Una nueva identidad incluye el nombre corto');
  if(process.platform!=='win32') assert.equal(statSync(join(dir,'red-protegida')).mode & 0o077,0);
  const clave=readFileSync(identidad.claveServidor,'utf8');
  const ca=readFileSync(identidad.certificadoPublico,'utf8');
  assert.deepEqual(await prepararRedProtegida(dir),identidad);
  assert.equal(readFileSync(identidad.claveServidor,'utf8'),clave,'No regenerar la identidad existente');
  proc=start();let log='';proc.stdout.on('data',x=>log+=x);proc.stderr.on('data',x=>log+=x);
  let respuesta;
  for(let i=0;i<150;i++){try{respuesta=await get({servername:identidad.nombre,ca});break;}catch{if(proc.exitCode!==null)throw Error(log);await espera(100);}}
  assert.equal(respuesta?.status,200,'El servidor real debe iniciar HTTPS usando la identidad persistida');
  assert.equal((await get({servername:'sgf-minint.local',ca})).status,200,'Nombre corto cubierto en identidades nuevas');
  await assert.rejects(get({servername:identidad.nombre}),/certificate|issuer|self.signed/i);
  await assert.rejects(get({servername:'otro.local',ca}),/altname|hostname|certificate/i);
  const plano=await new Promise(resolve=>{const r=http.get({host:'127.0.0.1',port,path:'/api/health',timeout:3000},res=>{res.resume();resolve(res.statusCode);});r.on('error',()=>resolve(null));r.on('timeout',()=>{r.destroy();resolve(null);});});
  assert.notEqual(plano,200,'No debe quedar HTTP abierto');
  proc.kill('SIGTERM');await new Promise(r=>proc.once('exit',r));proc=null;
  writeFileSync(identidad.claveServidor,'clave dañada');
  assert.throws(()=>estadoRedProtegida(dir));
  await assert.rejects(prepararRedProtegida(dir),'No debe reemplazar clave dañada');
  proc=start();let error='';proc.stderr.on('data',x=>error+=x);
  const code=await new Promise(r=>proc.once('exit',r));proc=null;
  assert.notEqual(code,0);assert.match(error,/No se abrió HTTP/);
  assert.equal(readFileSync(identidad.claveServidor,'utf8'),'clave dañada');
  writeFileSync(join(dir,'nombre-red.json'),'invalido');
  assert.throws(()=>nombrePersistido(dir),'Un nombre dañado no debe sustituirse automáticamente');
  console.log('OK: identidad protegida persistente, HTTPS real, rechazo sin CA/nombre, sin HTTP y fallo cerrado ante daño.');
} finally {if(proc&&proc.exitCode===null)proc.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
