// Laboratorio en VM: servidor SGF REAL con base y cuenta ficticias.
// No instala ni usa datos de ninguna persona. No acredita un reinicio físico.
import {spawn,execFileSync} from 'node:child_process';
import {createHmac,createHash,randomBytes} from 'node:crypto';
import {writeFileSync,readFileSync,existsSync,renameSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {once} from 'node:events';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import http from 'node:http';
import assert from 'node:assert/strict';
const root=dirname(fileURLToPath(import.meta.url)), datos=join(root,'datos');
let servidor;
try {
  const cuenta=execFileSync('whoami.exe',{encoding:'utf8'}).trim();
  let ejecutablesEscribibles=true;
  try {writeFileSync(join(root,'no-debe.txt'),'ficticio');} catch {ejecutablesEscribibles=false;}
  assert.equal(ejecutablesEscribibles,false,'La cuenta de servicio no debe modificar ejecutables.');
  const puerto=443, nombre='sgf-123456789abc.local', carpetaBd=join(datos,'SGF','datos');
  mkdirSync(carpetaBd,{recursive:true});
  const cert=join(datos,'lan-cert.crt'), key=join(datos,'lan-key.pem'), ca=join(datos,'lan-ca.crt');
  const cuantos=[cert,key,ca].filter(existsSync).length;
  if(cuantos===0) {
    const {crearIdentidadRed}=await import(pathToFileURL(join(root,'servidor','dist','utils','identidad-red.js')));
    const identidad=await crearIdentidadRed(nombre);
    writeFileSync(key,identidad.claveServidor,{mode:0o600,flag:'wx'});
    writeFileSync(cert,identidad.certificadoServidor,{flag:'wx'});
    writeFileSync(ca,identidad.autoridadPublica,{flag:'wx'});
    writeFileSync(join(carpetaBd,'nombre-red.json'),JSON.stringify({nombre:'sgf-123456789abc'}),{flag:'wx'});
  } else if(cuantos!==3) throw Error('Identidad incompleta: no regenerar automáticamente.');
  const autoridadPublica=readFileSync(ca,'utf8');
  const token=randomBytes(32).toString('hex'),jwt=randomBytes(32).toString('hex');
  const clavePath=join(datos,'ficticio.clave');
  if(!existsSync(clavePath))writeFileSync(clavePath,randomBytes(32).toString('hex'));
  const clave=readFileSync(clavePath,'utf8');
  servidor=spawn(process.execPath,['--no-warnings',join(root,'servidor','dist','index.js')],{env:{...process.env,DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(puerto),SGF_DATA_DIR:carpetaBd,SGF_ENV_FILE:join(datos,'no-existe.env'),SGF_CONSOLE_TOKEN:token,SGF_CONTROL_TLS:'1',SGF_MDNS:'0',SGF_LAN_TLS:'1',SGF_LAN_TLS_CERT:cert,SGF_LAN_TLS_KEY:key,SGF_LAN_TLS_NOMBRE:nombre,JWT_SECRET:jwt},stdio:['ignore','pipe','pipe']});
  const fin=once(servidor,'exit');let texto='',errores='';servidor.stdout.on('data',b=>texto+=b);servidor.stderr.on('data',b=>errores+=b);
  let marca;
  for(let i=0;i<200;i++) {const m=texto.match(/^\[SGF_TLS\] (.+)$/m);if(m){marca=JSON.parse(m[1]);break;}if(servidor.exitCode!==null)throw Error('Servidor de prueba terminó: '+errores);await new Promise(r=>setTimeout(r,100));}
  assert.ok(marca,'No apareció el canal local.');
  assert.equal(marca.mac,createHmac('sha256',token).update(`SGF_TLS:${marca.puerto}:${marca.huella}`).digest('hex'));
  const s=tls.connect({host:'127.0.0.1',port:marca.puerto,rejectUnauthorized:false});await once(s,'secureConnect');const raw=s.getPeerCertificate().raw;
  assert.equal(createHash('sha256').update(raw).digest('hex'),marca.huella);s.end();
  const pem='-----BEGIN CERTIFICATE-----\n'+raw.toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END CERTIFICATE-----\n';
  async function api(path,body) {return new Promise((resolve,reject)=>{
    const datosBody=body===undefined?null:JSON.stringify(body);
    const req=https.request({host:'127.0.0.1',port:marca.puerto,path,method:datosBody?'POST':'GET',ca:pem,headers:{'x-sgf-console-token':token,...(datosBody?{'content-type':'application/json'}:{})}},res=>{let t='';res.on('data',b=>t+=b);res.on('end',()=>{try {resolve({status:res.statusCode,json:JSON.parse(t)});}catch(e){reject(e);}});});req.on('error',reject);req.end(datosBody);
  });}
  const estado=await api('/api/setup/estado');assert.equal(estado.status,200);
  const primerInicio=estado.json.data.requiereConfiguracion;
  if(primerInicio)assert.equal((await api('/api/setup/admin',{username:'admin_ficticio',name:'Ensayo',password:clave})).status,201);
  assert.equal((await api('/api/auth/login',{username:'admin_ficticio',password:clave,machineId:'laboratorio'})).status,200);
  const health=await new Promise((resolve,reject)=>{
    const r=https.get({host:'127.0.0.1',port:puerto,path:'/api/health',servername:nombre,ca:autoridadPublica},res=>{let t='';res.on('data',b=>t+=b);res.on('end',()=>{try{resolve(JSON.parse(t));}catch(e){reject(e);}});});r.on('error',reject);
  });assert.equal(health.success,true);
  const plano=await new Promise(resolve=>{const r=http.get({host:'127.0.0.1',port:puerto,path:'/api/health',timeout:3000},res=>{res.resume();resolve(res.statusCode);});r.on('error',()=>resolve(null));r.on('timeout',()=>{r.destroy();resolve(null);});});
  assert.notEqual(plano,200,'No debe aceptar HTTP en el puerto seguro.');
  const salida=JSON.stringify({cuenta,puerto,primerInicio,ejecutablesEscribibles,httpsSeguro:true});
  writeFileSync(join(datos,'listo.tmp'),salida);renameSync(join(datos,'listo.tmp'),join(datos,'listo.json'));
  process.stdin.setEncoding('utf8');await new Promise(resolve=>process.stdin.once('data',resolve));
  process.stdin.destroy();
  const cierre=await api('/api/panel/apagar',{});assert.equal(cierre.status,200);
  const [codigo]=await fin;assert.equal(codigo,0,'El servidor no confirmó el cierre ordenado.');
  writeFileSync(join(datos,'cierre-ok.txt'),'cierre ordenado');
} catch(e) {
  try {writeFileSync(join(datos,'error.txt'),String(e.stack||e));} catch {}
  if(servidor && servidor.exitCode===null)servidor.kill();process.exitCode=1;
}
