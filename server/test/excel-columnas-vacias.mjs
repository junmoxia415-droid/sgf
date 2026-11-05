// Solo datos inventados, SQLite temporal; nunca se abre un archivo del usuario.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import xlsx from 'xlsx';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sgf-excel-vacio-'));
process.env.DB_TYPE='sqlite';process.env.SGF_DATA_DIR=dir;process.env.SGF_PRUEBA_AISLADA='1';
const {initDatabase,query,closeDb}=await import('../dist/models/database.js');
const {analyzeExcelFile,importExcelToSGF}=await import('../dist/utils/excel-importer.js');
try {
 await initDatabase();
 const wb=xlsx.utils.book_new();
 xlsx.utils.book_append_sheet(wb,xlsx.utils.aoa_to_sheet([
   ['', 'NÚMERO', '', 'PROVINCIA', 'MUNICIPIO'],
   ['descartar', '55500001', 'ignorar', 'Lugar ficticio', 'Municipio ficticio'],
   ['descartar', '55500002', 'ignorar', 'Otra provincia', 'Otro municipio'],
 ]),'Datos');
 const buffer=xlsx.write(wb,{type:'buffer',bookType:'xlsx'});
 const analysis=await analyzeExcelFile(buffer);
 assert.deepEqual(analysis.sheets[0].headers,['NÚMERO','PROVINCIA','MUNICIPIO']);
 assert.deepEqual(analysis.sheets[0].preview[0],{'NÚMERO':'55500001','PROVINCIA':'Lugar ficticio','MUNICIPIO':'Municipio ficticio'});
 const imported=await importExcelToSGF(buffer,{table:'SGF_LINEAS_IMPORTADAS'});
 assert.equal(imported.data.importedRows,2);assert.equal(imported.data.failedRows,0);
 const rows=await query('SELECT NUMERO, PROVINCIA, MUNICIPIO FROM SGF_LINEAS_IMPORTADAS ORDER BY NUMERO');
 assert.deepEqual(rows.map(r=>({...r})),[{NUMERO:'55500001',PROVINCIA:'Lugar ficticio',MUNICIPIO:'Municipio ficticio'},{NUMERO:'55500002',PROVINCIA:'Otra provincia',MUNICIPIO:'Otro municipio'}]);
 console.log('OK: Excel con encabezados vacíos conserva los valores en sus columnas originales.');
} finally {await closeDb();fs.rmSync(dir,{recursive:true,force:true});}
