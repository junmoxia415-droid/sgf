// SGF real con datos y certificados ficticios; no instala CA ni usa otra PC.
import assert from 'node:assert/strict';
import {crearIdentidadRed} from '../dist/utils/identidad-red.js';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
const tmp=await mkdtemp(join(tmpdir(),'sgf-https-red-')),datos=join(tmp,'datos');
const {mkdir}=await import('node:fs/promises');await mkdir(datos);
const nombre='sgf-123456789abc.local', identidad=await crearIdentidadRed(nombre);
await writeFile(join(datos,'nombre-red.json'),JSON.stringify({nombre:'sgf-123456789abc'}));
const certificado=join(tmp,'servidor.crt'),clave=join(tmp,'servidor.key');
await writeFile(certificado,identidad.certificadoServidor);await writeFile(clave,identidad.claveServidor,{mode:0o600});
const token=randomBytes(32).toString('hex'), jwt=randomBytes(32).toString('hex'), pass=randomBytes(32).toString('hex');
async function puertoLibre(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const port=await puertoLibre();let proceso;
function arrancar(env) {
 const p=spawn(process.execPath,['--no-warnings',resolve('dist/index.js')],{env:{...process.env,DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(port),SGF_DATA_DIR:datos,SGF_ENV_FILE:join(tmp,'no.env'),SGF_CONSOLE_TOKEN:token,JWT_SECRET:jwt,SGF_MDNS:'0',SGF_CONTROL_TLS:'0',SGF_LAN_TLS:'1',SGF_LAN_TLS_CERT:certificado,SGF_LAN_TLS_KEY:clave,SGF_LAN_TLS_NOMBRE:nombre,...env},stdio:['ignore','pipe','pipe']});
 const o={p,out:'',err:'',fin:once(p,'exit')};p.stdout.on('data',b=>o.out+=b);p.stderr.on('data',b=>o.err+=b);return o;
}
function solicitar(ruta,{ca=identidad.autoridadPublica,servername=nombre,body,headers={}}={}) {
 return new Promise((resolve,reject)=>{
  const req=https.request({host:'127.0.0.1',port,servername,path:ruta,ca,method:body?'POST':'GET',headers:{...headers,...(body?{'content-type':'application/json'}:{})}},res=>{let datos='';res.on('data',b=>datos+=b);res.on('end',()=>{try{resolve({status:res.statusCode,json:JSON.parse(datos)});}catch(e){reject(e);}});});
  req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 });
}
function httpPlano() {return new Promise(resolve=>{const r=http.get({host:'127.0.0.1',port,path:'/api/health',timeout:3000},res=>{res.resume();resolve(res.statusCode);});r.on('error',()=>resolve(null));r.on('timeout',()=>{r.destroy();resolve(null);});});}
try {
 proceso=arrancar({});
 for(let i=0;i<160&&!proceso.out.includes('[SGF] https://');i++){if(proceso.p.exitCode!==null)throw Error(proceso.err);await new Promise(r=>setTimeout(r,100));}
 assert.match(proceso.out,/\[SGF\] https:\/\//);
 assert.notEqual(await httpPlano(),200,'No debe haber HTTP en el puerto de red seguro.');
 await assert.rejects(solicitar('/api/health',{ca:null,servername:nombre}));
 await assert.rejects(solicitar('/api/health',{servername:'distinto.local'}));
 assert.equal((await solicitar('/api/health')).json.data.dbMode,'sqlite');
 const headers={'x-sgf-console-token':token};
 assert.equal((await solicitar('/api/setup/admin',{body:{username:'admin_prueba',name:'Cuenta ficticia',password:pass},headers})).status,201);
 assert.equal((await solicitar('/api/auth/login',{body:{username:'admin_prueba',password:'incorrecta-ficticia'}})).status,401);
 assert.equal((await solicitar('/api/auth/login',{body:{username:'admin_prueba',password:pass}})).status,200);
 assert.equal((await solicitar('/api/panel/apagar',{body:{},headers})).status,200);
 const [codigo]=await proceso.fin;assert.equal(codigo,0);proceso=null;
 const antes=await readFile(join(datos,'sgf-data.db'));
 // Una clave inexistente o un nombre distinto jamás provocan HTTP de respaldo.
 const invalido=arrancar({SGF_LAN_TLS_KEY:join(tmp,'no-existe.key')});
 const [fallo]=await invalido.fin;assert.notEqual(fallo,0);assert.match(invalido.err,/identidad HTTPS/);
 assert.notEqual(await httpPlano(),200);assert.deepEqual(await readFile(join(datos,'sgf-data.db')),antes);
 console.log('OK: SGF real sobre HTTPS, validación de nombre y CA, login ficticio y fallo cerrado sin HTTP.');
} finally {if(proceso&&proceso.p.exitCode===null){proceso.p.kill('SIGKILL');await proceso.fin;}await rm(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
