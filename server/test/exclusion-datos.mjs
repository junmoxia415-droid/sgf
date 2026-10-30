// Procesos reales, SQLite y cuentas ficticias; no usa Oracle ni SQL Server.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,rename} from 'node:fs/promises';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import net from 'node:net';
const base=await mkdtemp(join(tmpdir(),'sgf-bloqueo-test-'));
const datos=join(base,'SGF','datos');
const token='token-consola-para-pruebas-abc123';
const clave='Clave-ficticia-para-prueba-4321';
const principal=resolve('dist/index.js');const guardia=resolve('dist/utils/guardia-bloqueo.js');
const procesos=[];
function iniciar(args,env={}) {
  const p=spawn(process.execPath,['--no-warnings',...args],{env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
  const salida={p, stdout:'',stderr:'', fin:once(p,'exit')};
  p.stdout.on('data',b=>salida.stdout+=b.toString());p.stderr.on('data',b=>salida.stderr+=b.toString());
  procesos.push(salida);return salida;
}
async function cerrar(p) {
  if(!p || p.p.exitCode!==null || p.p.signalCode!==null)return;
  p.p.kill('SIGKILL');await p.fin;
}
async function puertoLibre(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const esperar=ms=>new Promise(r=>setTimeout(r,ms));
async function servidor(port) {
  const p=iniciar([principal],{DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(port),SGF_DATA_DIR:datos,SGF_ENV_FILE:join(base,'no-existe.env'),SGF_CONSOLE_TOKEN:token,JWT_SECRET:'clave-de-prueba-jwt-123456789'});
  return p;
}
async function esperarSalud(p,port) {
  for(let i=0;i<120;i++) {
    if(p.p.exitCode!==null||p.p.signalCode!==null)throw Error(`Proceso terminó antes de iniciar: ${p.stderr} ${p.stdout}`);
    try {const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok)return;} catch {}
    await esperar(100);
  }
  throw Error(`Servidor de prueba no respondió: ${p.stderr} ${p.stdout}`);
}
try {
  const port1=await puertoLibre(), port2=await puertoLibre();assert.notEqual(port1,port2);
  const a=await servidor(port1);await esperarSalud(a,port1);
  const crear=await fetch(`http://127.0.0.1:${port1}/api/setup/admin`,{method:'POST',headers:{'content-type':'application/json','x-sgf-console-token':token},body:JSON.stringify({username:'administrador_ficticio',name:'Prueba',password:clave})});
  assert.equal(crear.status,201,await crear.text());
  // La persistencia diferida termina antes de simular el corte forzado.
  await esperar(2200);
  const b=await servidor(port2);const [codigo]=await b.fin;assert.notEqual(codigo,0);assert.match(b.stderr,/carpeta de datos ya está en uso/i);
  const g=iniciar([guardia,datos]);const [codigoGuardia]=await g.fin;assert.notEqual(codigoGuardia,0);assert.match(g.stderr,/carpeta de datos ya está en uso/i);
  await cerrar(a);
  const c=await servidor(port2);await esperarSalud(c,port2);
  const login=await fetch(`http://127.0.0.1:${port2}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'administrador_ficticio',password:clave})});
  assert.equal(login.status,200,await login.text());
  const apagar=await fetch(`http://127.0.0.1:${port2}/api/panel/apagar`,{method:'POST',headers:{'content-type':'application/json','x-sgf-console-token':token},body:'{}'});assert.equal(apagar.status,200);await c.fin;
  const h=iniciar([guardia,datos]);
  for(let i=0;i<100&&!h.stdout.includes('SGF_BLOQUEO_OK');i++)await esperar(50);
  assert.match(h.stdout,/SGF_BLOQUEO_OK/);
  // El archivo de control queda fuera de SGF: mover la carpeta durante el
  // reinicio no puede permitir que otra instancia abra datos en su lugar.
  await rename(join(base,'SGF'),join(base,'SGF-respaldo'));
  const durante=await servidor(port1);const [resultadoDurante]=await durante.fin;
  assert.notEqual(resultadoDurante,0);assert.match(durante.stderr,/carpeta de datos ya está en uso/i);
  h.p.stdin.end();const [cerrado]=await h.fin;assert.equal(cerrado,0);
  const posterior=await servidor(port1);await esperarSalud(posterior,port1);
  const final=await fetch(`http://127.0.0.1:${port1}/api/panel/apagar`,{method:'POST',headers:{'content-type':'application/json','x-sgf-console-token':token},body:'{}'});assert.equal(final.status,200);await posterior.fin;
  console.log('OK: puertos distintos, reinicio y traslado protegidos, caída forzada, liberación y SQLite ficticia conservada.');
} finally {for(const p of procesos)await cerrar(p);await rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
