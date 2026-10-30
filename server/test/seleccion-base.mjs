import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {seleccionarMotorInicial,iniciarMotorSeleccionado,ErrorSeleccionBase} from '../dist/utils/seleccion-base.js';

assert.equal(seleccionarMotorInicial({}),'sqlite');
for(const motor of ['sqlite','oracle','mssql']) assert.equal(seleccionarMotorInicial({DB_TYPE:motor}),motor);
for(const env of [{DB_TYPE:'mssql-erroneo'},{ORACLE_HOST:'configuracion-existente'},{MSSQL_SERVER:'configuracion-existente'}]) {
  assert.throws(()=>seleccionarMotorInicial(env),e=>e instanceof ErrorSeleccionBase && e.motivo==='configuracion');
}
// Doble de conexión en memoria: nunca toca servidores Oracle ni SQL Server.
for(const tipo of ['oracle','mssql']) {
  const llamadas=[];
  const dobles={sqlite:async()=>{llamadas.push('sqlite');return 'sqlite'},oracle:async()=>{llamadas.push('oracle');throw new Error('fallo ficticio')},mssql:async()=>{llamadas.push('mssql');throw new Error('fallo ficticio')}};
  await assert.rejects(iniciarMotorSeleccionado(tipo,dobles),e=>e instanceof ErrorSeleccionBase && e.motivo==='conexion' && e.motor===tipo);
  assert.deepEqual(llamadas,[tipo], 'No debe intentar SQLite ni otro motor al fallar.');
}
assert.equal(await iniciarMotorSeleccionado('sqlite',{sqlite:async()=>17,oracle:async()=>{throw Error('No debe llamarse')},mssql:async()=>{throw Error('No debe llamarse')}}),17);

// Proceso real sin conectar con ningún servidor externo y con datos testigo.
const dir=await mkdtemp(join(tmpdir(),'sgf-seleccion-'));const testigo=join(dir,'sgf-data.db');
try {
  await writeFile(testigo,'datos ficticios a conservar');
  const env={...process.env,DB_TYPE:'motor-invalido',SGF_DATA_DIR:dir,SGF_ENV_FILE:join(dir,'ausente.env'),SGF_CONTROL_TLS:'0'};
  const hijo=spawn(process.execPath,['--no-warnings',resolve('dist/index.js')],{env,stdio:['ignore','pipe','pipe']});
  let out='';hijo.stdout.on('data',b=>out+=b);hijo.stderr.resume();
  const [codigo]=await once(hijo,'exit');
  assert.notEqual(codigo,0);assert.match(out,/\[SGF_DB_ERROR\] configuracion:ninguno/);
  assert.equal(await readFile(testigo,'utf8'),'datos ficticios a conservar');
} finally {await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
console.log('OK: sin sustitución silenciosa de motor; sin conexiones externas reales.');
