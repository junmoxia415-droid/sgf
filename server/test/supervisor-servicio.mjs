// Servicio supervisado con SGF real y datos ficticios temporales; no instala servicios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {createHmac,createHash,randomBytes} from 'node:crypto';
import selfsigned from 'selfsigned';
import {prepararRedProtegida} from '../dist/utils/red-protegida.js';
import {solicitarCierreServicio} from '../dist/utils/canal-servicio.js';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sgf-supervisor-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const token=randomBytes(32).toString('hex');const tokenFile=path.join(tmp,'token');const descriptor=path.join(tmp,'anuncio.json');const config=path.join(tmp,'config.json');
let supervisor;
const esperaSalida=p=>new Promise(r=>p.once('exit',(code)=>r(code)));
async function control(anuncio,ruta,body) {
  const s=tls.connect({host:'127.0.0.1',port:anuncio.puerto,rejectUnauthorized:false});
  await new Promise((r,j)=>{s.once('secureConnect',r);s.once('error',j);});
  const raw=s.getPeerCertificate().raw;
  assert.equal(createHash('sha256').update(raw).digest('hex'),anuncio.huella);
  s.end();
  const pem=`-----BEGIN CERTIFICATE-----\n${raw.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  return new Promise((resolve,reject)=>{
    const txt=body===undefined?null:JSON.stringify(body);
    const req=https.request({host:'127.0.0.1',port:anuncio.puerto,path:ruta,method:txt?'POST':'GET',ca:pem,headers:{'x-sgf-console-token':token,...(txt?{'content-type':'application/json'}:{})}},res=>{let b='';res.on('data',x=>b+=x);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(b)}));});req.on('error',reject);req.end(txt);
  });
}
try {
  const fake=await selfsigned.generate([{name:'commonName',value:'falso'}],{keyType:'ec',curve:'P-256',algorithm:'sha256'});let recibidas=0;
  const impostor=https.createServer({key:fake.private,cert:fake.cert},(req,res)=>{recibidas++;res.end('no');});
  await new Promise(r=>impostor.listen(0,'127.0.0.1',r));
  await assert.rejects(solicitarCierreServicio(impostor.address().port,'a'.repeat(64),token));
  assert.equal(recibidas,0,'Un servidor falso no debe recibir el token');await new Promise(r=>impostor.close(r));
  const data=path.join(tmp,'datos');fs.mkdirSync(data);const identidad=await prepararRedProtegida(data);
  const e=path.join(data,'.env');fs.writeFileSync(e,'DB_TYPE=sqlite\nJWT_SECRET=solo-prueba-ficticia-servicio-123456\n');fs.writeFileSync(tokenFile,token,{mode:0o600});
  const sk=net.createServer();await new Promise(r=>sk.listen(0,'127.0.0.1',r));const port=sk.address().port;await new Promise(r=>sk.close(r));
  fs.writeFileSync(config,JSON.stringify({tipo:'sgf-servicio-v1',datos:data,archivoEnv:e,token:tokenFile,anuncio:descriptor,puerto:port}));
  const clave='contrasena-ficticia-123';
  for(let vez=0;vez<2;vez++) {
    supervisor=spawn(process.execPath,['dist/scripts/supervisor-servicio.js'],{env:{...process.env,SGF_SERVICIO_CONFIG:config},stdio:['pipe','pipe','pipe']});
    const fin=esperaSalida(supervisor);let log='';supervisor.stdout.on('data',x=>log+=x);supervisor.stderr.on('data',x=>log+=x);
    for(let i=0;i<200&&!fs.existsSync(descriptor);i++){if(supervisor.exitCode!==null)throw Error('Supervisor terminó: '+log);await sleep(100);}
    assert(fs.existsSync(descriptor),'El servicio publica un canal autenticado');
    const d=JSON.parse(fs.readFileSync(descriptor,'utf8'));const a=JSON.parse(d.linea.slice('[SGF_TLS] '.length));
    assert.equal(a.mac,createHmac('sha256',token).update(`SGF_TLS:${a.puerto}:${a.huella}`).digest('hex'));
    const lan=await new Promise((resolve,reject)=>{https.get({host:'127.0.0.1',port,path:'/api/health',servername:identidad.nombre,ca:fs.readFileSync(identidad.certificadoPublico)},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(lan,200);
    if(vez===0){const r=await control(a,'/api/setup/admin',{username:'ficticio',name:'Prueba',password:clave});assert.equal(r.status,201);}
    const login=await control(a,'/api/auth/login',{username:'ficticio',password:clave,machineId:'ci'});assert.equal(login.status,200);
    supervisor.stdin.write('STOP\n');assert.equal(await fin,0,log);supervisor=null;
    assert(!fs.existsSync(descriptor),'Se elimina solo el anuncio propio al cerrar');
    assert(!log.includes(token),'El token no debe salir en el registro');
  }
  console.log('OK: supervisor real, HTTPS persistente, control autenticado, persistencia, dos arranques y cierres ordenados.');
} finally {if(supervisor&&supervisor.exitCode===null)supervisor.kill();fs.rmSync(tmp,{recursive:true,force:true});}
