// Construye ambas interfaces desde el mismo código y genera el selector de entrada.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});
for (const target of ['moderna','compat']) {
  console.log(`\nConstruyendo interfaz ${target}...`);
  const r=spawnSync(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build'],{
    cwd:root,stdio:'inherit',env:{...process.env,SGF_WEB_TARGET:target},
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`Falló la construcción ${target} (${r.status}).`);
}
fs.copyFileSync(path.join(root,'selector.html'),path.join(dist,'index.html'));
fs.copyFileSync(path.join(root,'seleccionar-version.js'),path.join(dist,'seleccionar-version.js'));
console.log('\nInterfaz moderna, compatible y selector preparados.');
