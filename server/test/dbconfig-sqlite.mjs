// Verifica persistencia de configuración y conservación: solo SQLite ficticia.
import {spawn} from 'node:child_process';import {mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createServer} from 'node:net';import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'sgf-dbconfig-'));const envfile=join(dir,'config','.env');
import {mkdirSync} from 'node:fs';mkdirSync(join(dir,'config'));writeFileSync(envfile,'# Configuracion ficticia\nDB_TYPE=sqlite\nPERSONALIZADO=conservar\nJWT_SECRET=secreto-ficticio-para-ci-12345\n');
const sk=createServer();await new Promise(r=>sk.listen(0,'127.0.0.1',r));const port=sk.address().port;await new Promise(r=>sk.close(r));const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['dist/index.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),SGF_DATA_DIR:dir,SGF_ENV_FILE:envfile,SGF_CONSOLE_TOKEN:'consola-ficticia-test-123'},stdio:'ignore'});
const req=async(path,body,token)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'x-sgf-console-token':'consola-ficticia-test-123'})},body:body?JSON.stringify(body):undefined});return [r.status,await r.json()];};
try {
 let listo=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){listo=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(listo);
 let [status,setup]=await req('/api/setup/admin',{username:'admin_ci',name:'Cuenta ficticia',password:'clave-para-pruebas-123'});assert.equal(status,201);let token=setup.data.token;
 const antes=readFileSync(envfile,'utf8');const [invalido]=await req('/api/db/connect',{type:'no-implementada',confirmarCambio:true},token);assert.equal(invalido,400);assert.equal(readFileSync(envfile,'utf8'),antes);
 const [sinConfirmar]=await req('/api/db/disconnect',{},token);assert.equal(sinConfirmar,409);assert.equal(readFileSync(envfile,'utf8'),antes);
 const [ok]=await req('/api/db/disconnect',{confirmarCambio:true},token);assert.equal(ok,200);
 const text=readFileSync(envfile,'utf8');assert.match(text,/PERSONALIZADO=conservar/);assert.match(text,/JWT_SECRET=secreto-ficticio-para-ci-12345/);assert.match(text,/DB_TYPE=['"]?sqlite/);assert(!readdirSync(join(dir,'config')).some(x=>x.includes('.tmp-')));
 const [login,resp]=await req('/api/auth/login',{username:'admin_ci',password:'clave-para-pruebas-123'});assert.equal(login,200);token=resp.data.token;const [config,r]=await req('/api/db/config',null,token);assert.equal(config,200);assert.equal(r.data.mode,'sqlite');
 console.log('OK: configuración persistida en SGF_ENV_FILE y cuenta SQLite conservada.');
} finally {server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));rmSync(dir,{recursive:true,force:true});}
