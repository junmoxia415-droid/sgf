// Integración real con dos IP de laboratorio añadidas temporalmente al loopback
// de la VM. No usa equipos, DNS, certificados ni facturas reales.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {crearIdentidadRed} from '../dist/utils/identidad-red.js';
const fuente=process.env.SGF_RED_CLIENTE_PRUEBA;
const otra=process.env.SGF_RED_OTRA_PRUEBA;
if(!fuente || !otra) { console.log('OMITIDO: requiere dos IP aisladas de laboratorio.');process.exit(0); }
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sgf-enlace-privado-'));
let proceso;
const vecino=fs.mkdtempSync(path.join(process.cwd(),'../client/dist-prueba-prefijo-'));
fs.writeFileSync(path.join(vecino,'privado.txt'),'SENTINELA-NO-PUBLICA');
try {
 const nombre='sgf-123456789abc.local';
 const id=await crearIdentidadRed(nombre,undefined,'127.0.0.1');
 const dir=path.join(tmp,'red-protegida'); fs.mkdirSync(dir);
 fs.writeFileSync(path.join(tmp,'nombre-red.json'),JSON.stringify({nombre:'sgf-123456789abc'}));
 fs.writeFileSync(path.join(dir,'servidor-clave.pem'),id.claveServidor);
 fs.writeFileSync(path.join(dir,'servidor.crt'),id.certificadoServidor);
 fs.writeFileSync(path.join(dir,'autoridad-publica.crt'),id.autoridadPublica);
 fs.writeFileSync(path.join(dir,'identidad.json'),JSON.stringify({nombre,ip:'127.0.0.1',huella:id.huellaAutoridad}));
 const socket=net.createServer(); socket.listen(0,'127.0.0.1'); await once(socket,'listening');
 const port=socket.address().port; await new Promise(r=>socket.close(r));
 const consola='token-consola-ficticio-sgf-12345';
 let logs='';
 const arrancar=async()=>{
  logs='';proceso=spawn(process.execPath,['dist/index.js'],{env:{...process.env,SGF_DATA_DIR:tmp,SGF_ENV_FILE:path.join(tmp,'ausente'),SGF_MDNS:'0',DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(port),JWT_SECRET:'secreto-solo-para-pruebas-123456',SGF_CONSOLE_TOKEN:consola},stdio:['ignore','pipe','pipe']});
  proceso.stdout.on('data',b=>logs+=b);proceso.stderr.on('data',b=>logs+=b);
  for(let i=0;i<150&&!logs.includes('[SGF] https://');i++){if(proceso.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
  assert.match(logs,/\[SGF\] https:\/\//);
 };
 await arrancar();
 const req=(ruta,{ip,method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
   const datos=body===undefined ? undefined : JSON.stringify(body);
   const h={...headers}; if(datos!==undefined) {h['content-type']='application/json'; h['content-length']=Buffer.byteLength(datos);}
   const q=https.request({host:'127.0.0.1',port,path:ruta,method,localAddress:ip,ca:id.autoridadPublica,headers:h},r=>{
    let texto='';r.setEncoding('utf8');r.on('data',b=>texto+=b);r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,texto}));
   });q.on('error',reject);q.end(datos);
 });
 const setup=await req('/api/setup/admin',{method:'POST',headers:{'x-sgf-console-token':consola},body:{username:'admin_ficticio',name:'Prueba',password:'para-pruebas-123'}});
 assert.equal(setup.status,201,setup.texto);
 const panel=await req('/api/panel/enlace',{headers:{'x-sgf-console-token':consola}});
 assert.equal(panel.status,200,panel.texto);const codigo=JSON.parse(panel.texto).data.codigoEnlace;
 assert.match(codigo,/^[A-Za-z0-9_-]{43}$/);assert.equal(JSON.parse(panel.texto).data.accesoDirecto,true);
 let r=await req('/',{ip:fuente});assert.equal(r.status,200);assert(r.texto.includes('seleccionar-version.js'));assert(!r.texto.includes(codigo));
 r=await req('/%2e%2e%2f'+path.basename(vecino)+'/privado.txt',{ip:fuente});assert.equal(r.status,403,'No se sirve un directorio vecino con el mismo prefijo');assert(!r.texto.includes('SENTINELA-NO-PUBLICA'));
 r=await req('/api/health',{ip:fuente});assert.equal(r.status,200);assert(!r.texto.includes('sgf-data.db'),'Health no revela la ruta de la base');
 assert.equal((await req('/api/db/config',{ip:fuente})).status,403,'Configuración BD no es pública');
 assert.equal((await req('/api/db/disconnect',{ip:fuente,method:'POST',body:{}})).status,403,'No se puede cambiar BD sin sesión');
 assert.equal((await req('/api/facturas',{ip:fuente})).status,401,'Sin cuenta no hay acceso a facturas');
 for(const ruta of ['/api/panel/estado','/api/panel/enlace','/api/setup/estado']) assert.equal((await req(ruta,{ip:fuente})).status,403,ruta);
 assert.equal((await req('/api/panel/estado',{ip:fuente,headers:{'x-sgf-console-token':consola}})).status,403,'El panel sigue local');
 assert.equal((await req('/api/health',{ip:fuente,headers:{'x-forwarded-for':'203.0.113.8'}})).status,403,'Proxy no autorizado');
 r=await req('/api/auth/login',{ip:fuente,method:'POST',body:{username:'admin_ficticio',password:'para-pruebas-123'}});
 assert.equal(r.status,200,r.texto);const jwt=JSON.parse(r.texto).data.token;
 r=await req('/api/facturas',{ip:fuente,headers:{authorization:`Bearer ${jwt}`}});assert.equal(r.status,200,r.texto);
 assert.equal((await req('/api/health',{ip:otra})).status,200,'Otra PC llega sin configurar rangos');
 assert.equal((await req('/api/facturas',{ip:otra})).status,401);
 for(let i=0;i<30;i++) {
  r=await req('/api/auth/login',{ip:otra,method:'POST',body:{username:`usuario_inventado_${i}`,password:'para-pruebas-123'}});
  assert.equal(r.status,401);
 }
 r=await req('/api/auth/login',{ip:otra,method:'POST',body:{username:'otro_usuario',password:'para-pruebas-123'}});
 assert.equal(r.status,429,'Limite por IP aunque se varíe el usuario');
 const terminado=once(proceso,'exit');
 r=await req('/api/panel/apagar',{method:'POST',headers:{'x-sgf-console-token':consola}});assert.equal(r.status,200);
 const [code]=await terminado;assert.equal(code,0,logs);proceso=null;
 await arrancar();
 const panelNuevo=await req('/api/panel/enlace',{headers:{'x-sgf-console-token':consola}});
 const codigoNuevo=JSON.parse(panelNuevo.texto).data.codigoEnlace;
 assert.notEqual(codigoNuevo,codigo,'El antiguo código efímero sigue cambiando, pero ya no forma parte del enlace corto');
 assert.equal((await req('/',{ip:fuente})).status,200,'La dirección sin secreto sigue funcionando tras reiniciar');
 assert.equal((await req('/api/facturas',{ip:fuente})).status,401,'Sin sesión siguen protegidos los datos tras reiniciar');
 const finNuevo=once(proceso,'exit');
 assert.equal((await req('/api/panel/apagar',{method:'POST',headers:{'x-sgf-console-token':consola}})).status,200);
 const [codeNuevo]=await finNuevo;assert.equal(codeNuevo,0,logs);proceso=null;
 console.log('OK: dos clientes, enlace corto estable, autenticación, límite de intentos y reinicio con datos ficticios.');
} finally {if(proceso&&proceso.exitCode===null){proceso.kill('SIGKILL');await once(proceso,'exit');}fs.rmSync(tmp,{recursive:true,force:true});fs.rmSync(vecino,{recursive:true,force:true});}
