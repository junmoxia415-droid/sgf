// Únicamente PDF y credenciales ficticios; crea y elimina una SQLite temporal.
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const tmp=mkdtempSync(join(tmpdir(),'sgf-pdf-test-'));
const sk=createServer();await new Promise(r=>sk.listen(0,'127.0.0.1',r));const port=sk.address().port;await new Promise(r=>sk.close(r));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['dist/index.js'],{env:{...process.env,DB_TYPE:'sqlite',HOST:'127.0.0.1',PORT:String(port),SGF_DATA_DIR:tmp,JWT_SECRET:'ficticio-solo-ci-123456789',SGF_CONSOLE_TOKEN:'ficticio-consola-123456789'},stdio:'ignore'});
const req=async(path,body,token,method)=>{const r=await fetch(base+path,{method:method ?? (body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'x-sgf-console-token':'ficticio-consola-123456789'})},body:body?JSON.stringify(body):undefined});return [r.status,await r.json()];};
try {
 let listo=false;for(let i=0;i<100;i++){try {if((await fetch(base+'/api/health')).ok){listo=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));} assert(listo);
 const [status,setup]=await req('/api/setup/admin',{username:'admin_fake',name:'Administrador ficticio',password:'clave-para-pruebas-123'});assert.equal(status,201);const token=setup.data.token;
 const file=readFileSync('../client/test/fixtures/factura-ficticia.pdf').toString('base64'); const body={filename:'ficticio.pdf',file};
 const [sa,a]=await req('/api/facturas/upload',{...body,accion:'analizar'},token);assert.equal(sa,200);const [,before]=await req('/api/facturas',null,token);assert.equal(before.meta.total,0);assert(a.data.totalServicios>0);
 const simultaneas=await Promise.all([req('/api/facturas/upload',{...body,accion:'guardar'},token),req('/api/facturas/upload',{...body,accion:'guardar'},token)]);assert.deepEqual(simultaneas.map(x=>x[0]).sort((a,b)=>a-b),[200,409]);const [,after]=await req('/api/facturas',null,token);assert.equal(after.meta.total,1);
 const [sd]=await req('/api/facturas/upload',{...body,accion:'guardar'},token);assert.equal(sd,409);const [sr]=await req('/api/facturas/upload',{...body,accion:'guardar',confirmarSustitucion:true},token);assert.equal(sr,200);
 const [,again]=await req('/api/facturas',null,token);assert.equal(again.meta.total,1);
 const id=again.data[0].id;const [editado]=await req(`/api/facturas/${encodeURIComponent(id)}`,{cliente:'Entidad ficticia actualizada'},token,'PUT');assert.equal(editado,200);
 const [detalleStatus,detalle]=await req(`/api/facturas/${encodeURIComponent(id)}`,null,token);assert.equal(detalleStatus,200);assert.equal(detalle.data.cliente,'Entidad ficticia actualizada');assert(detalle.data.servicios.length>0);

 // Una versión antigua pudo guardar solo el prefijo de una factura alfanumérica.
 const [creado]=await req('/api/facturas',{cliente:'Entidad ficticia',noFactura:'765432'},token);assert.equal(creado,201);
 const pdf=await PDFDocument.create();const pagina=pdf.addPage([600,800]);const font=await pdf.embedFont(StandardFonts.Helvetica);
 ['Cliente: ENTIDAD FICTICIA','No. factura: 765432A998877','Numero de Cliente: 1234567','Numero de Cuenta: 7654321','Resumen por Servicios','Servicio Cuota Consumo Comision Impuesto Importe','50000001 1.00 2.00 0.00 0.00 3.00'].forEach((line,i)=>pagina.drawText(line,{x:30,y:760-i*15,size:10,font}));
 const oldBody={filename:'ficticio-antiguo.pdf',file:Buffer.from(await pdf.save()).toString('base64')};
 const [previewStatus,preview]=await req('/api/facturas/upload',{...oldBody,accion:'analizar'},token);assert.equal(previewStatus,200);assert.equal(preview.data.posibleRegistroAntiguo,true);
 const [conflict]=await req('/api/facturas/upload',{...oldBody,accion:'guardar',confirmarSustitucion:true},token);assert.equal(conflict,409);
 const [,conservadas]=await req('/api/facturas',null,token);assert.equal(conservadas.meta.total,2);
 console.log('OK: PDF ficticio: vista previa, concurrencia, sustitución, edición y protección de registros antiguos.');
} finally {server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));rmSync(tmp,{recursive:true,force:true});}
