// Laboratorio aislado. Usa datos temporales y no modifica una instalación SGF.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
const carpeta=await mkdtemp(join(tmpdir(),'sgf-exclusion-lab-'));
const archivo=join(carpeta,'control.sqlite');
const codigo=`const {DatabaseSync}=require('node:sqlite');
try {const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;');console.log('ADQUIRIDO');setInterval(()=>{},1000);}
catch(e){console.log('BLOQUEADO:'+e.message);process.exit(73);}`;
function iniciar(){let p=spawn(process.execPath,['--no-warnings','-e',codigo,archivo],{stdio:['ignore','pipe','pipe']});let salida='';p.stdout.on('data',v=>salida+=v);return {p,texto:()=>salida};}
async function hasta(a,texto){for(let i=0;i<150;i++){if(a.texto().includes(texto))return;await new Promise(r=>setTimeout(r,50));}throw Error(`No se observó ${texto}: ${a.texto()}`);}
async function matar(a){if(a && a.p.exitCode===null && a.p.signalCode===null){let fin=once(a.p,'exit');a.p.kill('SIGKILL');await fin;}}
let a,b,c;
try {
 a=iniciar();await hasta(a,'ADQUIRIDO');
 b=iniciar();const [salida]=await once(b.p,'exit');if(salida!==73||!b.texto().includes('BLOQUEADO'))throw Error('Segunda instancia no bloqueada');
 await matar(a);
 c=iniciar();await hasta(c,'ADQUIRIDO');
 console.log('OK: exclusión y liberación después de terminar un proceso forzosamente.');
} finally {await Promise.all([a,b,c].map(matar));await rm(carpeta,{recursive:true,force:true});}
