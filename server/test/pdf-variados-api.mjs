// Genera únicamente facturas y usuarios ficticios; la SQLite temporal se borra.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';

const tmp=mkdtempSync(join(tmpdir(),'sgf-pdf-variados-'));
let server;
try {
  execFileSync(process.execPath,['--import','tsx','src/scripts/prueba-pdf-variados.ts',`--salida=${tmp}`],{stdio:'inherit'});
  const sock=createServer(); await new Promise(r=>sock.listen(0,'127.0.0.1',r));
  const port=sock.address().port; await new Promise(r=>sock.close(r));
  const base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['dist/index.js'],{env:{...process.env,DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(port),SGF_DATA_DIR:join(tmp,'db'),JWT_SECRET:'clave-para-pruebas-123456',SGF_CONSOLE_TOKEN:'consola-para-pruebas-123456'},stdio:'ignore'});
  const req=async(path,body,token)=>{
    const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'x-sgf-console-token':'consola-para-pruebas-123456'})},body:body?JSON.stringify(body):undefined});
    return [r.status,await r.json()];
  };
  let listo=false;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){listo=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
  assert(listo,'El servidor ficticio debe iniciar');
  const [status,setup]=await req('/api/setup/admin',{username:'admin_falso',name:'Administrador inventado',password:'clave-para-pruebas-123'});
  assert.equal(status,201);const token=setup.data.token;
  const body=(name,accion)=>({filename:`${name}.pdf`,file:readFileSync(join(tmp,`${name}.pdf`)).toString('base64'),accion});
  const [s,grande]=await req('/api/facturas/upload',body('05-gran-volumen','analizar'),token);
  assert.equal(s,200);assert.equal(grande.data.totalServicios,907);assert.equal(grande.data.factura.servicios.length,907);
  const [,antes]=await req('/api/facturas',null,token);assert.equal(antes.meta.total,0,'Analizar no escribe');
  const [se,errorTotal]=await req('/api/facturas/upload',body('08-diferencia-un-centavo','analizar'),token);
  assert.equal(se,200);assert(errorTotal.data.factura.diagnostics.some(d=>d.code==='totals-mismatch-services'));assert(errorTotal.data.requiereRevision);
  const [sd,repetido]=await req('/api/facturas/upload',body('09-numero-repetido','analizar'),token);
  assert.equal(sd,200);assert.equal(repetido.data.totalServicios,84);assert(repetido.data.factura.diagnostics.some(d=>d.code==='services-duplicate-number'));
  const [ss,guardado]=await req('/api/facturas/upload',body('09-numero-repetido','guardar'),token);
  assert.equal(ss,200);assert.equal(guardado.data.totalServicios,84);
  const [sf,detalle]=await req(`/api/facturas/${guardado.data.sgfFacturaId}`,null,token);
  assert.equal(sf,200);assert.equal(detalle.data.servicios.length,84);
  const numeros=detalle.data.servicios.map(f=>f.numero_servicio);
  assert.equal(numeros.length-new Set(numeros).size,1,'Debe conservar la fila repetida');
  console.log('OK: vista previa sin escritura, 907 servicios, alerta de un centavo y 84 filas guardadas con repetido.');
} finally {
  if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
  rmSync(tmp,{recursive:true,force:true});
}
