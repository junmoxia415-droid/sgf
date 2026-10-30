// Solo datos ficticios; una prueba de servicio no es un reinicio real.
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {writeFileSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
const raiz=dirname(fileURLToPath(import.meta.url)), datos=join(raiz,'datos');
try {
  const identidad=execFileSync('whoami.exe',{encoding:'utf8'}).trim();
  let carpetaEjecutableEscribible=true;
  try {writeFileSync(join(raiz,'NO-DEBE-ESCRIBIR.txt'),'prueba');} catch {carpetaEjecutableEscribible=false;}
  const db=new DatabaseSync(join(datos,'ficticia.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS ensayos (numero INTEGER NOT NULL); INSERT INTO ensayos VALUES (1);');
  const cantidad=db.prepare('SELECT count(*) AS n FROM ensayos').get().n;
  const srv=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({identidad,cantidad,carpetaEjecutableEscribible}));});
  srv.listen(0,'127.0.0.1',()=>{
    const texto=JSON.stringify({puerto:srv.address().port,identidad,cantidad,carpetaEjecutableEscribible});
    writeFileSync(join(datos,'listo.tmp'),texto);renameSync(join(datos,'listo.tmp'),join(datos,'listo.json'));
  });
} catch (e) {try {writeFileSync(join(datos,'error.txt'),String(e.stack||e));} catch {} process.exit(1);}
