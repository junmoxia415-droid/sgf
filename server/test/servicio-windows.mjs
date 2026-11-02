// Se ejecuta solo en VM Windows efímera con servicio y SQLite ficticios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import tls from 'node:tls';
import https from 'node:https';
import {createHash,createHmac} from 'node:crypto';
const [datos,vez]=process.argv.slice(2);assert(datos && ['1','2'].includes(vez));
const control=`${datos}\\control-servicio`;
const token=fs.readFileSync(`${control}\\token.txt`,'utf8').trim();
const d=JSON.parse(fs.readFileSync(`${control}\\anuncio.json`,'utf8'));
const a=JSON.parse(d.linea.slice('[SGF_TLS] '.length));
assert.equal(a.mac,createHmac('sha256',token).update(`SGF_TLS:${a.puerto}:${a.huella}`).digest('hex'));
const s=tls.connect({host:'127.0.0.1',port:a.puerto,rejectUnauthorized:false});
await new Promise((r,j)=>{s.once('secureConnect',r);s.once('error',j);});
const raw=s.getPeerCertificate().raw;assert.equal(createHash('sha256').update(raw).digest('hex'),a.huella);s.end();
const pem=`-----BEGIN CERTIFICATE-----\n${raw.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
function api(ruta,body) {return new Promise((resolve,reject)=>{const txt=body===undefined?null:JSON.stringify(body);const q=https.request({host:'127.0.0.1',port:a.puerto,path:ruta,method:txt?'POST':'GET',ca:pem,headers:{'x-sgf-console-token':token,...(txt?{'content-type':'application/json'}:{})}},res=>{let b='';res.on('data',x=>b+=x);res.on('end',()=>resolve({status:res.statusCode,json:JSON.parse(b)}));});q.on('error',reject);q.end(txt);});}
const ping=await api('/api/panel/ping');assert.equal(ping.json.data.pid,d.pid);
if(vez==='1') assert.equal((await api('/api/setup/admin',{username:'ficticio_servicio',name:'Prueba ficticia',password:'clave-para-pruebas-123'})).status,201);
assert.equal((await api('/api/auth/login',{username:'ficticio_servicio',password:'clave-para-pruebas-123',machineId:'prueba'})).status,200);
const identidad=JSON.parse(fs.readFileSync(`${datos}\\red-protegida\\identidad.json`,'utf8'));
const raiz=fs.readFileSync(`${datos}\\red-protegida\\autoridad-publica.crt`);
const respuesta=await new Promise((resolve,reject)=>{https.get({host:'127.0.0.1',port:443,path:'/api/health',servername:identidad.nombre,ca:raiz},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(respuesta,200);
await assert.rejects(new Promise((resolve,reject)=>{https.get({host:'127.0.0.1',port:443,path:'/api/health',servername:identidad.nombre},resolve).on('error',reject);}));
console.log('OK: servicio SGF real, HTTPS confiable y control autenticado; cuenta ficticia persistente.');
