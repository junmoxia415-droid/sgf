// TLS local efímero con datos SQLite ficticios; no prueba HTTPS de la LAN.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,createHmac,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
const base=await mkdtemp(join(tmpdir(),'sgf-control-tls-'));
const token=randomBytes(32).toString('hex'), jwt=randomBytes(32).toString('hex');
const principal=resolve('dist/index.js');
let servidor;
async function puertoLibre(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const n=s.address().port;await new Promise(r=>s.close(r));return n;}
function ejecutar(port,tkn,dir) {
  const p=spawn(process.execPath,['--no-warnings',principal],{env:{...process.env,DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(port),SGF_DATA_DIR:dir,SGF_ENV_FILE:join(base,'ausente.env'),SGF_CONSOLE_TOKEN:tkn,SGF_CONTROL_TLS:'1',JWT_SECRET:jwt},stdio:['ignore','pipe','pipe']});
  const x={p,stdout:'',stderr:'',fin:once(p,'exit')};p.stdout.on('data',b=>x.stdout+=b.toString());p.stderr.on('data',b=>x.stderr+=b.toString());return x;
}
async function esperarMarca(x) {
  for(let i=0;i<120;i++){
    const m=x.stdout.match(/^\[SGF_TLS\] (.+)$/m);if(m)return JSON.parse(m[1]);
    if(x.p.exitCode!==null)throw Error(x.stderr);
    await new Promise(r=>setTimeout(r,100));
  }
  throw Error(`El canal TLS no inició: ${x.stderr}`);
}
function pedir(port,ruta,metodo='GET',cabeceras={}) {
  return new Promise((resolve,reject)=>{
    const req=https.request({host:'127.0.0.1',port,path:ruta,method:metodo,rejectUnauthorized:false,headers:cabeceras},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));});
    req.on('error',reject);if(metodo==='POST')req.write('{}');req.end();
  });
}
try {
  const port=await puertoLibre();servidor=ejecutar(port,token,join(base,'SGF','datos'));
  const marca=await esperarMarca(servidor);
  assert.match(marca.huella,/^[0-9a-f]{64}$/);
  assert.equal(marca.mac,createHmac('sha256',token).update(`SGF_TLS:${marca.puerto}:${marca.huella}`).digest('hex'));
  const conexion=tls.connect({host:'127.0.0.1',port:marca.puerto,rejectUnauthorized:false});await once(conexion,'secureConnect');
  assert.equal(createHash('sha256').update(conexion.getPeerCertificate().raw).digest('hex'),marca.huella);conexion.end();
  const publico=await pedir(marca.puerto,'/api/panel/ping');assert.equal(publico.body.data.pid,servidor.p.pid);
  assert.equal((await pedir(marca.puerto,'/api/panel/estado')).status,403);
  assert.equal((await pedir(marca.puerto,'/api/panel/estado','GET',{'x-sgf-console-token':token})).status,200);
  assert.equal((await pedir(marca.puerto,'/api/panel/apagar','POST',{'content-type':'application/json','x-sgf-console-token':token})).status,200);
  const [salida]=await servidor.fin;assert.equal(salida,0);
  const sinClave=ejecutar(await puertoLibre(),'',join(base,'sin-token'));const [fallo]=await sinClave.fin;assert.notEqual(fallo,0);assert.match(sinClave.stderr,/token local/i);
  console.log('OK: canal TLS solo local, huella autenticada, token exigido y cierre ordenado.');
} finally {
  if(servidor && servidor.p.exitCode===null && servidor.p.signalCode===null){servidor.p.kill('SIGKILL');await servidor.fin;}
  await rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
