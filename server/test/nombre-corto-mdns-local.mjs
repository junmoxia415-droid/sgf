// Prueba de mDNS real solo en loopback de la VM; no toca DNS ni equipos externos.
import assert from 'node:assert/strict';import dgram from 'node:dgram';import {once} from 'node:events';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import ciao from '@homebridge/ciao';
import {DNSPacket} from '@homebridge/ciao/lib/coder/DNSPacket.js';
import {AnunciadorRed} from '../dist/utils/nombre-red.js';
const dir=mkdtempSync(join(tmpdir(),'sgf-mdns-loopback-'));let a;
const responder=()=>{const r=ciao.getResponder({interface:'lo',excludeIpv6:true});return {createService(o){return r.createService({...o,restrictedAddresses:['127.0.0.1']});},shutdown:()=>r.shutdown()};};
const esperar=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('mDNS no se anunció en loopback');};
const q=Buffer.concat([Buffer.from([0,0,0,0,0,1,0,0,0,0,0,0]),Buffer.from([10]),Buffer.from('sgf-minint'),Buffer.from([5]),Buffer.from('local'),Buffer.from([0,0,1,0x80,1])]);
let sock;
try {
 a=new AnunciadorRed({direcciones:()=>['203.0.113.50'],crearRespondedor:responder,intervaloMs:60000});
 a.iniciar(dir,443,'0.0.0.0','https');await esperar(()=>a.obtenerEstado().enlaceAmigable);
 sock=dgram.createSocket({type:'udp4',reuseAddr:true});sock.bind(0,'127.0.0.1');await once(sock,'listening');sock.setMulticastInterface('127.0.0.1');sock.setMulticastTTL(1);
 const respuesta=new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('mDNS no respondió a la consulta en loopback')),4000);sock.on('message',(data,rinfo)=>{try{const packet=DNSPacket.decode(rinfo,data);for(const record of packet.answers.values())if(record.name.toLowerCase()==='sgf-minint.local.'&&record.ipAddress==='127.0.0.1'){clearTimeout(t);resolve(record);}}catch{}});});
 sock.send(q,5353,'224.0.0.251');await respuesta;
 console.log('OK: consulta mDNS real de sgf-minint.local resuelta solo en loopback.');
} finally {sock?.close();if(a)await a.detener();rmSync(dir,{recursive:true,force:true});}
