// Prueba integral con Chromium y datos ficticios; siempre crea una SQLite temporal.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'sgf-web-test-'));
const socket = net.createServer();
await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const tokenConsola = 'token-consola-pruebas-ficticias';
const server = spawn(process.execPath, ['dist/index.js'], { cwd:path.join(raiz,'server'), env:{...process.env, DB_TYPE:'sqlite', HOST:'127.0.0.1', PORT:String(port), SGF_DATA_DIR:datos, JWT_SECRET:'secreto-solo-para-pruebas-123456', SGF_CONSOLE_TOKEN:tokenConsola}, stdio:'ignore' });
let browser;
try {
  let listo = false;
  for (let i=0; i<100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { listo=true; break; } } catch {} await new Promise(resolve=>setTimeout(resolve,100)); }
  assert(listo, 'El servidor no arrancó');
  async function post(ruta, body, headers={}) { const r=await fetch(base+ruta, {method:'POST', headers:{'Content-Type':'application/json', ...headers}, body:JSON.stringify(body)}); const j=await r.json(); assert(r.ok, j.error); return j.data; }
  const cuenta = await post('/api/setup/admin',{username:'admin_ci',name:'Administrador ficticio',password:'para-pruebas-123'},{'x-sgf-console-token':tokenConsola});
  await post('/api/users',{username:'operador_ci',name:'Operador ficticio',password:'para-pruebas-123',role:'usuario'},{Authorization:`Bearer ${cuenta.token}`});
  const html=await fetch(base); assert.match(html.headers.get('cache-control') || '', /no-cache/);
  browser=await chromium.launch({headless:true, args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1360,height:800}});
  const errores=[]; page.on('pageerror',e=>errores.push(e.message));
  const login=async user => {await page.getByLabel('Usuario',{exact:true}).fill(user); await page.getByLabel('Contraseña',{exact:true}).fill('para-pruebas-123'); await page.getByRole('button',{name:'Entrar',exact:true}).click(); await page.getByText('Bienvenido,').waitFor();};
  await page.goto(process.env.SGF_TEST_COMPAT === '1' ? `${base}/compat/index.html` : base); await page.getByText('Bienvenido a SGF').waitFor();
  assert.equal(new URL(page.url()).pathname, process.env.SGF_TEST_COMPAT === '1' ? '/compat/index.html' : '/moderna/index.html', 'Debe cargar la variante esperada');
  assert.equal(await page.getByRole('navigation').count(),0,'No se debe mostrar el menú sin sesión');
  await login('admin_ci'); await page.getByText('Facturas registradas').waitFor();
  await page.getByRole('button',{name:'Activar tema oscuro'}).click(); assert(await page.locator('html').evaluate(e=>e.classList.contains('dark')));
  await page.getByRole('button',{name:'Activar tema claro'}).click(); assert(!await page.locator('html').evaluate(e=>e.classList.contains('dark')));
  await page.getByRole('button',{name:'Usuarios',exact:true}).click(); await page.getByText('operador_ci',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Importar Excel',exact:true}).click(); await page.locator('#excel-input').setInputFiles(path.join(raiz,'client/test/fixtures/lineas-ficticias.xlsx'));
  await page.getByRole('button',{name:'1. Analizar Excel'}).click(); await page.getByRole('button',{name:/2. Importar a/}).waitFor(); await page.getByRole('button',{name:/2. Importar a/}).click(); await page.getByText('Importación completada').first().waitFor({timeout:30000});
  await page.getByRole('button',{name:'Datos de líneas',exact:true}).click(); await page.getByText('Persona Ficticia').first().waitFor();
  await page.getByRole('button',{name:'Facturas',exact:true}).click(); await page.locator('input[type=file]').setInputFiles(path.join(raiz,'client/test/fixtures/factura-ficticia.pdf')); await page.getByRole('button',{name:'Analizar factura'}).click(); await page.getByText('Vista previa · sin guardar').waitFor({timeout:30000});
  let token=await page.evaluate(()=>sessionStorage.getItem('sgf_auth_token'));
  let facturas=await (await fetch(`${base}/api/facturas`,{headers:{Authorization:`Bearer ${token}`}})).json();
  assert.equal(facturas.meta.total,0,'Analizar no debe guardar');
  page.once('dialog', dialog=>dialog.accept());
  await page.getByRole('button',{name:'Guardar factura'}).click(); await page.getByText('Guardada',{exact:true}).waitFor({timeout:30000});
  facturas=await (await fetch(`${base}/api/facturas`,{headers:{Authorization:`Bearer ${token}`}})).json();
  assert.equal(facturas.meta.total,1,'Guardar debe crear una factura');
  await page.getByRole('button',{name:'Estadísticas',exact:true}).click(); await page.getByText('Consumo por mes').waitFor(); await page.getByText('Detalle por línea').waitFor(); await page.getByText('Persona Ficticia').first().waitFor();
  await page.getByRole('button',{name:'Cerrar sesión'}).click(); await page.getByText('Bienvenido a SGF').waitFor(); await login('operador_ci');
  assert.equal(await page.getByRole('button',{name:'Usuarios',exact:true}).count(),0,'Usuario normal no debe ver usuarios');
  assert.equal(await page.getByRole('button',{name:'Estadísticas',exact:true}).count(),0,'Usuario sin permiso no debe ver estadísticas');
  await page.reload(); await page.getByText('Bienvenido,').waitFor();
  await page.setViewportSize({width:400,height:800}); assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=400, 'Desbordamiento en móvil');
  assert.deepEqual(errores,[]); console.log('OK: login, roles, temas, Excel y PDF ficticios, cruce, estadísticas, recarga y móvil.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit',resolve)); }
  fs.rmSync(datos,{recursive:true,force:true});
}
