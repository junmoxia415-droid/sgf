// Migración de una instalación SQLite anterior con datos ficticios.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgf-migracion-'));
const dataFile = path.join(dir, 'sgf-data.db');
const SQL = await initSqlJs();
const db = new SQL.Database();
db.run("CREATE TABLE SGF_USUARIOS (ID TEXT PRIMARY KEY, USERNAME TEXT UNIQUE, NOMBRE TEXT, ROL TEXT, PASSWORD_HASH TEXT, ACTIVO INTEGER, CREADO TEXT)");
db.run("INSERT INTO SGF_USUARIOS VALUES (?, ?, ?, ?, ?, ?, ?)", ['usuario-anterior','admin_anterior','Cuenta anterior','admin',bcrypt.hashSync('para-pruebas-123', 10),1,'2025-01-01']);
db.run("CREATE TABLE DATOS_ANTERIORES (DATO TEXT)");
db.run("INSERT INTO DATOS_ANTERIORES VALUES ('dato-ficticio-conservado')");
fs.writeFileSync(dataFile, db.export()); db.close();
const listener = net.createServer();
await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const p = spawn('node', ['dist/index.js'], { cwd: process.cwd(), env: {...process.env, DB_TYPE:'sqlite', HOST:'127.0.0.1', PORT:String(port), SGF_DATA_DIR:dir, JWT_SECRET:'secreto-solo-para-pruebas-123456'}, stdio:'ignore' });
try {
  let listo = false;
  for (let i=0;i<100;i++) {
    try { const r=await fetch(`http://127.0.0.1:${port}/api/health`); const j=await r.json(); if (j?.data?.instanceId) { listo=true; break; } } catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if (!listo || p.exitCode !== null) throw Error('No se pudo iniciar el servidor de migración');
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:'admin_anterior',password:'para-pruebas-123'})});
  if (login.status !== 200) throw Error(`No se conserva la cuenta anterior: ${login.status}`);
  const datos = await login.json();
  if (!Array.isArray(datos.data.user.permisos)) throw Error('No se añadió la columna de permisos');
  const actual = new SQL.Database(fs.readFileSync(dataFile));
  if (actual.exec('SELECT DATO FROM DATOS_ANTERIORES')[0]?.values?.[0]?.[0] !== 'dato-ficticio-conservado') throw Error('No se conservaron los datos previos');
  actual.close();
  console.log('OK: migración aditiva conserva cuenta y datos de la instalación anterior.');
} finally {
  p.kill('SIGTERM'); await new Promise(resolve => p.once('exit', resolve));
  fs.rmSync(dir, {recursive:true, force:true});
}
