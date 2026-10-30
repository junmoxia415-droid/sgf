// Prueba determinista: no modifica DNS, firewall, red del equipo ni datos reales.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AnunciadorRed,esIpv4Privada,crearEnlaceRed} from '../dist/utils/nombre-red.js';

assert.equal(crearEnlaceRed('sgf-aabbccddeeff.local',443,'https'),'https://sgf-aabbccddeeff.local');
assert.equal(crearEnlaceRed('sgf-aabbccddeeff.local',8443,'https'),'https://sgf-aabbccddeeff.local:8443');
assert.equal(crearEnlaceRed('sgf-aabbccddeeff.local',80,'http'),'http://sgf-aabbccddeeff.local');
assert.throws(()=>crearEnlaceRed('sgf.local',0,'https'));
for(const ip of ['192.168.1.8','10.3.1.4','172.16.0.1','172.31.255.254','169.254.1.3']) assert(esIpv4Privada(ip));
for(const ip of ['8.8.8.8','127.0.0.1','172.32.1.1','172.15.1.1','192.168.256.3','::1','1.2.3']) assert(!esIpv4Privada(ip));
const tmp=mkdtempSync(join(tmpdir(),'sgf-nombre-red-'));
let ips=['192.168.10.31','8.8.8.8']; let opciones=[]; let cerrados=0; let conflicto=false; let ultimoServicio;
class Servicio extends EventEmitter {
 constructor(ajustes){super();this.ajustes=ajustes;}
 async advertise(){if(conflicto)this.emit('hostname-change','falso');}
 getHostname(){return `${this.ajustes.hostname}.local.`;}
}
function crear(){return {createService(o){opciones.push(o);ultimoServicio=new Servicio(o);return ultimoServicio;},async shutdown(){cerrados++;}};}
const esperar=async(a,tipo)=>{for(let i=0;i<100;i++){if(a.obtenerEstado().estado===tipo)return;await new Promise(r=>setTimeout(r,2));}throw Error(`No llegó a ${tipo}: ${JSON.stringify(a.obtenerEstado())}`);};
let a;
try {
 a=new AnunciadorRed({direcciones:()=>ips,crearRespondedor:crear,intervaloMs:60000});
 a.iniciar(tmp,3000,'0.0.0.0'); await esperar(a,'activo');
 const primero=a.obtenerEstado(); assert.match(primero.enlace,/^http:\/\/sgf-[a-f0-9]{12}\.local:3000$/);
 assert.deepEqual(opciones.at(-1).restrictedAddresses,['192.168.10.31']);assert.equal(opciones.at(-1).disabledIpv6,true);
 ips=['192.168.10.78']; await a.actualizar(); await esperar(a,'activo');
 assert.equal(a.obtenerEstado().enlace,primero.enlace,'El nombre sobrevive a un cambio de IP');
 assert.deepEqual(opciones.at(-1).restrictedAddresses,['192.168.10.78']);assert.equal(cerrados,1);
 ips=[]; await a.actualizar(); assert.equal(a.obtenerEstado().estado,'esperando_red');assert.equal(a.obtenerEstado().enlace,null);
 ips=['10.1.1.2'];await a.actualizar();await esperar(a,'activo');assert.equal(a.obtenerEstado().enlace,primero.enlace);
 await a.detener();
 const b=new AnunciadorRed({direcciones:()=>ips,crearRespondedor:crear,intervaloMs:60000});a=b;
 b.iniciar(tmp,3000,'0.0.0.0');await esperar(b,'activo');assert.equal(b.obtenerEstado().enlace,primero.enlace,'El nombre se conserva al reiniciar');
 ultimoServicio.emit('hostname-change','otro-equipo');
 assert.equal(b.obtenerEstado().estado,'error');assert.equal(b.obtenerEstado().enlace,null,'Un conflicto posterior invalida inmediatamente el enlace');
 await b.detener();
 conflicto=true;const c=new AnunciadorRed({direcciones:()=>ips,crearRespondedor:crear,intervaloMs:60000});a=c;
 c.iniciar(tmp,3000,'0.0.0.0');await esperar(c,'error');assert.equal(c.obtenerEstado().enlace,null,'No se muestra un nombre en conflicto');
 await c.detener();
 const d=new AnunciadorRed({direcciones:()=>ips,crearRespondedor:crear});a=d;d.iniciar(tmp,3000,'127.0.0.1');assert.equal(d.obtenerEstado().estado,'desactivado');
 conflicto=false;const e=new AnunciadorRed({direcciones:()=>ips,crearRespondedor:crear,intervaloMs:60000});a=e;
 e.iniciar(tmp,443,'0.0.0.0','https');await esperar(e,'activo');
 assert.match(e.obtenerEstado().enlace,/^https:\/\/sgf-[a-f0-9]{12}\.local$/);
 assert.equal(opciones.at(-1).type,'https');await e.detener();
 console.log('OK: nombre local persistente, cambio de IP, red caída, conflicto y filtro de direcciones.');
} finally {if(a)await a.detener();rmSync(tmp,{recursive:true,force:true});}
