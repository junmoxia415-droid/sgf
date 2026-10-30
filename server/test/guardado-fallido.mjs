// SQLite temporal: simula un error de escritura sin tocar datos reales.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sgf-error-guardado-'));
process.env.DB_TYPE='sqlite'; process.env.SGF_DATA_DIR=dir;
const {initDatabase,execute,query,closeDb}=await import('../dist/models/database.js');
const obstaculo=path.join(dir,`sgf-data.db.tmp-${process.pid}`);
try {
  await initDatabase();
  fs.mkdirSync(obstaculo);
  await execute('INSERT INTO SGF_LINEAS_IMPORTADAS (ID,NUMERO) VALUES (:id,:n)',{id:'dato-ficticio',n:'50000000'});
  await assert.rejects(closeDb(),/No se pudieron guardar/);
  assert.equal((await query('SELECT ID FROM SGF_LINEAS_IMPORTADAS WHERE ID=:id',{id:'dato-ficticio'})).length,1,'Los cambios siguen en memoria después del fallo');
  fs.rmSync(obstaculo,{recursive:true,force:true});
  await closeDb();
  await initDatabase();
  assert.equal((await query('SELECT ID FROM SGF_LINEAS_IMPORTADAS WHERE ID=:id',{id:'dato-ficticio'})).length,1,'Se conservan al reintentar y reabrir');
  console.log('OK: el cierre informa un fallo de escritura y conserva los cambios en memoria para reintentar.');
} finally {
  fs.rmSync(obstaculo,{recursive:true,force:true});
  await closeDb();
  fs.rmSync(dir,{recursive:true,force:true});
}
