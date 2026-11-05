// Chromium real, IP de laboratorio en loopback de VM, certificado ficticio fijado por SPKI.
import { chromium } from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import https from 'node:https'; import net from 'node:net';
import {once} from 'node:events';
import {createHash, X509Certificate} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {crearIdentidadRed} from '../../server/dist/utils/identidad-red.js';
const ip=process.env.SGF_RED_CLIENTE_PRUEBA;
if(!ip) {console.log('OMITIDO: se requiere IP de laboratorio.');process.exit(0);}
const raiz=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sgf-browser-link-'));
let server,browser;
try {
 const nombre='sgf-123456789abc.local';const id=await crearIdentidadRed(nombre,undefined,ip);
 const dir=path.join(tmp,'red-protegida');fs.mkdirSync(dir);
 fs.writeFileSync(path.join(tmp,'nombre-red.json'),JSON.stringify({nombre:'sgf-123456789abc'}));
 fs.writeFileSync(path.join(dir,'servidor-clave.pem'),id.claveServidor);
 fs.writeFileSync(path.join(dir,'servidor.crt'),id.certificadoServidor);
 fs.writeFileSync(path.join(dir,'autoridad-publica.crt'),id.autoridadPublica);
 fs.writeFileSync(path.join(dir,'identidad.json'),JSON.stringify({nombre,ip,huella:id.huellaAutoridad}));
 const socket=net.createServer();socket.listen(0,ip);await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
 const consola='token-consola-ficticio-sgf-12345';
 server=spawn(process.execPath,['dist/index.js'],{cwd:path.join(raiz,'server'),env:{...process.env,SGF_DATA_DIR:tmp,SGF_ENV_FILE:path.join(tmp,'ausente'),SGF_MDNS:'0',DB_TYPE:'sqlite',HOST:ip,PORT:String(port),JWT_SECRET:'secreto-solo-para-pruebas-123456',SGF_CONSOLE_TOKEN:consola},stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
 for(let i=0;i<150&&!logs.includes('[SGF] https://');i++){if(server.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 assert.match(logs,/\[SGF\] https:\/\//);
 const req=(ruta,{method='GET',body}={})=>new Promise((resolve,reject)=>{
  const datos=body===undefined?undefined:JSON.stringify(body); const headers={'x-sgf-console-token':consola};
  if(datos!==undefined){headers['content-type']='application/json';headers['content-length']=Buffer.byteLength(datos);}
  const q=https.request({host:ip,port,path:ruta,method,localAddress:'127.0.0.1',ca:id.autoridadPublica,headers},r=>{let texto='';r.setEncoding('utf8');r.on('data',x=>texto+=x);r.on('end',()=>resolve({status:r.statusCode,texto}));});q.on('error',reject);q.end(datos);
 });
 let r=await req('/api/setup/admin',{method:'POST',body:{username:'admin_ficticio',name:'Administrador ficticio',password:'para-pruebas-123'}});assert.equal(r.status,201,r.texto);
 r=await req('/api/panel/enlace');assert.equal(r.status,200,r.texto);assert.equal(JSON.parse(r.texto).data.accesoDirecto,true);
 const spki=createHash('sha256').update(new X509Certificate(id.certificadoServidor).publicKey.export({type:'spki',format:'der'})).digest('base64');
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--no-proxy-server',`--ignore-certificate-errors-spki-list=${spki}`]});
 const context=await browser.newContext();const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const base=`https://${ip}:${port}`;
 await page.goto(base);
 await page.getByText('Bienvenido a SGF').waitFor({timeout:30000});
 assert(!page.url().includes('#sgf='),'El enlace no contiene un secreto largo');
 await page.getByLabel('Usuario',{exact:true}).fill('admin_ficticio');
 await page.getByLabel('Contraseña',{exact:true}).fill('para-pruebas-123');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByText('Facturas registradas').waitFor({timeout:15000});
 assert.deepEqual(errors,[]);
 // Otro navegador llega al login, pero no obtiene las facturas sin iniciar sesión.
 const otra=await browser.newContext();const p2=await otra.newPage();
 await p2.goto(base);await p2.getByText('Bienvenido a SGF').waitFor();
 const rr=await p2.evaluate(()=>fetch('/api/facturas').then(r=>r.status));assert.equal(rr,401);
 await otra.close(); await context.close();
 console.log('OK: Chromium abre el enlace corto HTTPS, inicia sesión y protege los datos sin sesión.');
} finally {
 if(browser)await browser.close();
 if(server&&server.exitCode===null){server.kill('SIGTERM');await once(server,'exit');}
 fs.rmSync(tmp,{recursive:true,force:true});
}
