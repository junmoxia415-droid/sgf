// Laboratorio aislado: Firefox 80 real, servidor local y SQLite ficticia desechable.
// Uso: SGF_FIREFOX80=/ruta/firefox SGF_GECKODRIVER=/ruta/geckodriver node test/firefox80.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const firefox = process.env.SGF_FIREFOX80;
const geckodriver = process.env.SGF_GECKODRIVER;
if (!firefox || !geckodriver) throw new Error('Indique SGF_FIREFOX80 y SGF_GECKODRIVER');
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'sgf-firefox80-'));
const freePort = async () => { const s=net.createServer(); await new Promise((r,j)=>s.once('error',j).listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; };
const port = await freePort(); const driverPort = await freePort();
const base=`http://127.0.0.1:${port}`, driverBase=`http://127.0.0.1:${driverPort}`;
const tokenConsola='solo-consola-ficticia-firefox80';
const server=spawn(process.execPath,['dist/index.js'],{cwd:path.join(raiz,'server'),env:{...process.env,DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(port),SGF_DATA_DIR:datos,JWT_SECRET:'secreto-solo-pruebas-firefox-12345',SGF_CONSOLE_TOKEN:tokenConsola},stdio:'ignore'});
// Firefox 80 no inicia su sandbox de contenido en algunas plataformas Linux modernas.
// Este laboratorio usa solo datos ficticios, proxy bloqueado y servidor local; no navegar por Internet.
const driver=spawn(geckodriver,['--port',String(driverPort)],{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'},stdio:['ignore','pipe','pipe']});
let driverLog=''; driver.stdout.on('data',x=>driverLog+=x); driver.stderr.on('data',x=>driverLog+=x);
let session;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn, label, ms=20000) { const end=Date.now()+ms; let last; while(Date.now()<end) { try { const v=await fn(); if(v) return v; } catch(e) { last=e; } await sleep(150); } throw new Error(`Tiempo agotado: ${label}. ${last?.message||''}\n${driverLog.slice(-1200)}`); }
async function wd(method,route,body) { const r=await fetch(driverBase+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}); const j=await r.json(); if(!r.ok) throw new Error(`WebDriver ${route}: ${JSON.stringify(j.value)}\n${driverLog.slice(-3000)}`); return j.value; }
const cmd=(method,route,body)=>wd(method,`/session/${session}${route}`,body);
const execute=(script,...args)=>cmd('POST','/execute/sync',{script,args});
async function find(using,value) { return cmd('POST','/element',{using,value}); }
const id=e=>e['element-6066-11e4-a52e-4f735466cecf'];
async function clickText(text) { const el=await wait(()=>find('xpath',`//button[normalize-space(.)=${JSON.stringify(text)}]`),`botón ${text}`); await cmd('POST',`/element/${id(el)}/click`,{}); }
async function typeCss(selector,text) { const el=await wait(()=>find('css selector',selector),selector); await cmd('POST',`/element/${id(el)}/value`,{text, value:[...text]}); }
async function waitText(text,ms) { return wait(()=>execute('return document.body.innerText.includes(arguments[0])',text),`texto ${text}`,ms); }
async function upload(selector, filename) { await typeCss(selector,path.join(raiz,'client/test/fixtures',filename)); }
try {
  await wait(async()=> (await fetch(base+'/api/health')).ok, 'servidor');
  await wait(async()=> (await fetch(driverBase+'/status')).ok, 'geckodriver');
  async function post(ruta,body,headers={}) { const r=await fetch(base+ruta,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}); const j=await r.json(); assert(r.ok,j.error); return j.data; }
  const admin=await post('/api/setup/admin',{username:'admin_ci',name:'Administrador ficticio',password:'para-pruebas-123'},{'x-sgf-console-token':tokenConsola});
  await post('/api/users',{username:'operador_ci',name:'Operador ficticio',password:'para-pruebas-123',role:'usuario'},{Authorization:`Bearer ${admin.token}`});
  const info=await wd('POST','/session',{capabilities:{alwaysMatch:{browserName:'firefox','moz:firefoxOptions':{binary:firefox,args:['-headless'],prefs:{'app.update.auto':false,'app.update.enabled':false,'datareporting.healthreport.uploadEnabled':false,'toolkit.telemetry.enabled':false,'browser.safebrowsing.downloads.enabled':false,'network.proxy.type':1,'network.proxy.http':'127.0.0.1','network.proxy.http_port':9,'network.proxy.ssl':'127.0.0.1','network.proxy.ssl_port':9,'network.proxy.no_proxies_on':'localhost, 127.0.0.1'}}}}});
  session=info.sessionId; assert.match(info.capabilities.browserVersion,/^80\./);
  await cmd('POST','/window/rect',{width:1360,height:800});
  await cmd('POST','/url',{url:base}); await waitText('Bienvenido a SGF');
  assert.equal(await execute('return location.pathname'),'/compat/index.html','Firefox 80 debe recibir la interfaz compatible');
  if (process.env.SGF_CAPTURAS) fs.writeFileSync(path.join(process.env.SGF_CAPTURAS,'login.png'), Buffer.from(await cmd('GET','/screenshot'),'base64'));
  const estilos=await execute(`const root=document.querySelector('h1').closest('.min-h-screen'); const box=document.querySelector('h1').parentElement.parentElement; const b=document.querySelector('button[type=submit]'); return {display:getComputedStyle(root).display, gradient:getComputedStyle(root).backgroundImage, box:getComputedStyle(box).backgroundColor, radius:getComputedStyle(box).borderRadius, button:getComputedStyle(b).backgroundColor};`);
  assert.equal(estilos.display,'flex'); assert.match(estilos.gradient,/gradient/); assert.equal(estilos.box,'rgb(255, 255, 255)'); assert.notEqual(estilos.radius,'0px'); assert.notEqual(estilos.button,'rgba(0, 0, 0, 0)');
  async function clickCss(selector) { const el=await wait(()=>find('css selector',selector),selector); await cmd('POST',`/element/${id(el)}/click`,{}); }
  await clickCss('[aria-label="Activar tema oscuro"]');
  assert(await execute('return document.documentElement.classList.contains("dark")'));
  assert.notEqual(await execute('return getComputedStyle(document.querySelector("h1").parentElement.parentElement).backgroundColor'),'rgb(255, 255, 255)');
  await clickCss('[aria-label="Activar tema claro"]');
  await typeCss('input[autocomplete="username"]','admin_ci'); await typeCss('input[autocomplete="current-password"]','para-pruebas-123'); await clickText('Entrar');
  await waitText('Facturas registradas');
  await clickText('Usuarios'); await waitText('operador_ci');
  await clickText('Importar Excel'); await upload('#excel-input','lineas-ficticias.xlsx'); await clickText('1. Analizar Excel');
  await clickText('2. Importar a SGF_LINEAS_IMPORTADAS'); await waitText('Importación completada',30000);
  await clickText('Datos de líneas'); await waitText('Persona Ficticia');
  await clickText('Facturas'); await upload('input[type=file]','factura-ficticia.pdf'); await clickText('Analizar factura'); await waitText('Vista previa · sin guardar',30000);
  const token=await execute('return sessionStorage.getItem("sgf_auth_token")');
  const facturas=async()=> (await (await fetch(base+'/api/facturas',{headers:{Authorization:`Bearer ${token}`}})).json());
  assert.equal((await facturas()).meta.total,0,'Analizar no debe guardar');
  await clickText('Guardar factura'); await wait(()=>cmd('GET','/alert/text'),'confirmación'); await cmd('POST','/alert/accept',{}); await waitText('Guardada',30000);
  assert.equal((await facturas()).meta.total,1,'Guardar debe crear una factura');
  await clickText('Historial'); const row=await wait(()=>find('css selector','tbody tr.cursor-pointer td'),'factura en historial'); await sleep(700); await cmd('POST',`/element/${id(row)}/click`,{}); await clickText('Editar'); await waitText('Editar factura');
  const countBefore=await execute('return document.querySelectorAll("input[placeholder=Numero]").length');
  await clickText('Agregar servicio'); await clickText('Agregar servicio');
  assert.equal(await execute('return document.querySelectorAll("input[placeholder=Numero]").length'),countBefore+2,'Cada servicio nuevo debe tener una fila independiente');
  const filas=await cmd('POST','/elements',{using:'css selector',value:'input[placeholder=Numero]'});
  await cmd('POST',`/element/${id(filas[filas.length-2])}/value`,{text:'111111',value:[...'111111']});
  await cmd('POST',`/element/${id(filas[filas.length-1])}/value`,{text:'222222',value:[...'222222']});
  assert.deepEqual((await execute('return Array.from(document.querySelectorAll("input[placeholder=Numero]")).slice(-2).map(e=>e.value)')),['111111','222222'],'Editar una fila no debe modificar la otra');
  await clickText('Cancelar');
  await clickText('Estadísticas'); await waitText('Consumo por mes'); await waitText('Persona Ficticia');
  await wait(()=>execute('return !document.querySelector(".fixed.top-4.right-4")'),'desaparición del aviso');
  await clickCss('[aria-label="Cerrar sesión"]'); await waitText('Bienvenido a SGF');
  await typeCss('input[autocomplete="username"]','operador_ci'); await typeCss('input[autocomplete="current-password"]','para-pruebas-123'); await clickText('Entrar'); await waitText('Bienvenido,');
  assert(!await execute('return [...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Usuarios")'));
  await cmd('POST','/refresh',{}); await waitText('Bienvenido,');
  await cmd('POST','/window/rect',{width:400,height:800}); await sleep(300);
  const medidas=await execute('return {ancho:innerWidth, contenido:document.documentElement.scrollWidth}');
  assert(medidas.contenido<=medidas.ancho,`Desbordamiento en ventana estrecha: ${JSON.stringify(medidas)}`);
  console.log('OK Firefox 80: estilos claros/oscuros, acceso y roles, Excel, PDF, historial, edición de filas, estadísticas y recarga con datos ficticios.');
} finally {
  if(session) { try { await cmd('DELETE',''); } catch {} }
  driver.kill('SIGTERM'); server.kill('SIGTERM');
  await Promise.all([driver,server].map(p=>p.exitCode===null?new Promise(r=>p.once('exit',r)):Promise.resolve()));
  fs.rmSync(datos,{recursive:true,force:true});
}
