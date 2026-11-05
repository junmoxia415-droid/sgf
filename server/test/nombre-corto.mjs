// Ensayo determinista; no anuncia tráfico de red ni toca datos reales.
import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {AnunciadorRed} from '../dist/utils/nombre-red.js';
let conflict=false;let servicios=[];let ips=['192.168.44.20'];
class Servicio extends EventEmitter {
 constructor(options){super();this.options=options;this.closed=false;servicios.push(this);}
 async advertise(){if(this.options.hostname==='sgf-minint'&&conflict)this.emit('hostname-change','sgf-minint-2');}
 getHostname(){return this.options.hostname+'.local.';}
 async destroy(){this.closed=true;}
}
const responder=()=>({createService:o=>new Servicio(o),shutdown:async()=>{}});
const tmp=mkdtempSync(join(tmpdir(),'sgf-alias-'));
const esperar=async(fn)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,2));}throw Error('Tiempo de espera');};
let a;
try {
 a=new AnunciadorRed({direcciones:()=>ips,crearRespondedor:responder,intervaloMs:60000});
 a.iniciar(tmp,443,'0.0.0.0','https');await esperar(()=>a.obtenerEstado().enlaceAmigable);
 assert.equal(a.obtenerEstado().enlaceAmigable,'https://sgf-minint.local');
 const anterior=a.obtenerEstado().enlace;ips=['192.168.44.21'];await a.actualizar();
 assert.equal(a.obtenerEstado().enlaceAmigable,'https://sgf-minint.local');assert.equal(a.obtenerEstado().enlace,anterior);
 let alias=servicios.filter(x=>x.options.hostname==='sgf-minint').at(-1);
 alias.emit('hostname-change','conflicto');assert.equal(a.obtenerEstado().enlaceAmigable,null);assert.equal(a.obtenerEstado().enlace,anterior);assert.equal(alias.closed,true);
 await a.detener(); conflict=true;
 a=new AnunciadorRed({direcciones:()=>ips,crearRespondedor:responder,intervaloMs:60000});a.iniciar(tmp,8443,'0.0.0.0','https');
 await esperar(()=>a.obtenerEstado().mensajeAmigable);
 assert.equal(a.obtenerEstado().enlaceAmigable,null,'No ofrecer alias si ya lo usa otro equipo');
 assert.match(a.obtenerEstado().mensajeAmigable,/ocupado/);
 await a.detener();conflict=false;
 const segunda=mkdtempSync(join(tmpdir(),'sgf-alias-otra-pc-'));
 try {
  a=new AnunciadorRed({direcciones:()=>ips,crearRespondedor:responder,intervaloMs:60000});a.iniciar(segunda,8443,'0.0.0.0','https');
  await esperar(()=>a.obtenerEstado().enlaceAmigable);
  assert.equal(a.obtenerEstado().enlaceAmigable,'https://sgf-minint.local:8443','Mismo nombre en otra PC, puerto no estándar visible');
 } finally {await a.detener();rmSync(segunda,{recursive:true,force:true});}
 console.log('OK: nombre corto, cambio de PC/IP, conflicto y puerto alternativo.');
} finally {if(a)await a.detener();rmSync(tmp,{recursive:true,force:true});}
