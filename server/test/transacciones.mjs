// Prueba de aislamiento y rollback, con SQLite temporal y datos inventados.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sgf-tx-'));
process.env.DB_TYPE='sqlite'; process.env.SGF_DATA_DIR=dir;
const {initDatabase,transaction,execute,query,closeDb}=await import('../dist/models/database.js');
let liberar;const espera=new Promise(r=>liberar=r);let notificar;const empezada=new Promise(r=>notificar=r);
try {
 await initDatabase();
 const tx=transaction(async()=>{
   await execute('INSERT INTO SGF_LINEAS_IMPORTADAS (ID,NUMERO) VALUES (:id,:n)',{id:'tx-descartar',n:'50000001'});
   notificar();await espera;throw new Error('error ficticio para probar rollback');
 }).catch(e=>e.message);
 await empezada;
 let terminada=false;
 const otra=execute('INSERT INTO SGF_LINEAS_IMPORTADAS (ID,NUMERO) VALUES (:id,:n)',{id:'independiente',n:'50000002'}).then(()=>{terminada=true;});
 await new Promise(r=>setTimeout(r,30)); assert.equal(terminada,false,'Una petición ajena debe esperar la transacción SQLite');
 liberar();assert.match(await tx,/ficticio/);await otra;
 const filas=await query('SELECT ID FROM SGF_LINEAS_IMPORTADAS ORDER BY ID');assert.deepEqual(filas.map(x=>x.ID),['independiente']);
 console.log('OK: rollback aislado; otra petición espera y se conserva.');
} finally {await closeDb();fs.rmSync(dir,{recursive:true,force:true});}
