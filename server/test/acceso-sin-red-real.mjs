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
 assert.match(codigo,/^[A-Za-z0-9_-]{43}$/);
 let r=await req('/',{ip:fuente});assert.equal(r.status,200);assert(r.texto.includes('location.hash'));assert(!r.texto.includes(codigo));
 for(const ruta of ['/api/health','/api/facturas','/api/panel/estado','/api/panel/enlace','/api/setup/estado']) assert.equal((await req(ruta,{ip:fuente})).status,403,ruta);
 r=await req('/api/acceso/enlace',{ip:fuente,method:'POST',headers:{'x-sgf-enlace':'incorrecto'}});assert.equal(r.status,403);
 r=await req('/api/acceso/enlace',{ip:fuente,method:'POST',headers:{'x-sgf-enlace':codigo}});assert.equal(r.status,204,r.texto);
 const cookie=r.headers['set-cookie'][0].split(';')[0];
 assert.equal((await req('/api/facturas',{ip:fuente,headers:{cookie}})).status,401,'Una invitación no inicia sesión');
 assert.equal((await req('/api/panel/estado',{ip:fuente,headers:{cookie,'x-sgf-console-token':consola}})).status,403,'El panel sigue solo en el equipo local');
 assert.equal((await req('/api/setup/estado',{ip:fuente,headers:{cookie}})).status,403,'La configuración inicial sigue siendo local');
 assert.equal((await req('/api/facturas',{ip:otra})).status,403,'Una segunda dirección no se autoriza automáticamente');
 assert.equal((await req('/api/health',{ip:fuente,headers:{cookie,'x-forwarded-for':'203.0.113.8'}})).status,403,'Proxy no autorizado');
 r=await req('/api/auth/login',{ip:fuente,method:'POST',headers:{cookie},body:{username:'admin_ficticio',password:'para-pruebas-123'}});
 assert.equal(r.status,200,r.texto);const jwt=JSON.parse(r.texto).data.token;
 r=await req('/api/facturas',{ip:fuente,headers:{cookie,authorization:`Bearer ${jwt}`}});
 assert.equal(r.status,200,r.texto);
 // Otra PC puede usar el mismo enlace, sin conocer ni configurar su IP.
 r=await req('/api/acceso/enlace',{ip:otra,method:'POST',headers:{'x-sgf-enlace':codigo}});assert.equal(r.status,204,r.texto);
 assert.equal((await req('/api/health',{ip:otra,headers:{cookie:r.headers['set-cookie'][0].split(';')[0]}})).status,200);
 const terminado=once(proceso,'exit');
 r=await req('/api/panel/apagar',{method:'POST',headers:{'x-sgf-console-token':consola}});assert.equal(r.status,200);
 const [code]=await terminado;assert.equal(code,0,logs);proceso=null;
 await arrancar();
 const panelNuevo=await req('/api/panel/enlace',{headers:{'x-sgf-console-token':consola}});
 const codigoNuevo=JSON.parse(panelNuevo.texto).data.codigoEnlace;
 assert.notEqual(codigoNuevo,codigo,'El enlace cambia al reiniciar el servidor');
 assert.equal((await req('/api/facturas',{ip:fuente,headers:{cookie,authorization:`Bearer ${jwt}`}})).status,403,'La cookie anterior no sirve tras reiniciar');
 const finNuevo=once(proceso,'exit');
 assert.equal((await req('/api/panel/apagar',{method:'POST',headers:{'x-sgf-console-token':consola}})).status,200);
 const [codeNuevo]=await finNuevo;assert.equal(codeNuevo,0,logs);proceso=null;
 console.log('OK: dos clientes, invitación privada, login, reinicio e invalidación de enlace con datos ficticios.');
} finally {if(proceso&&proceso.exitCode===null){proceso.kill('SIGKILL');await once(proceso,'exit');}fs.rmSync(tmp,{recursive:true,force:true});}
