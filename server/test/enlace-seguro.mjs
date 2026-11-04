// Comprueba el control de acceso sin modificar ninguna red ni certificado real.
import assert from 'node:assert/strict';
import {codigoInvitacion, comprobarEnlace} from '../dist/utils/enlace-seguro.js';
const codigo = codigoInvitacion();
assert.match(codigo, /^[A-Za-z0-9_-]{43}$/);
function prueba({method='GET',url='/',encrypted=true,headers={},remoteAddress='203.0.113.20'}={}) {
  const req={method,url,socket:{encrypted,remoteAddress},headers:{host:'sgf.example',...headers}};
  const respuesta={status:0,headers:{},body:'',writeHead(s,h){this.status=s;this.headers=h;},end(b=''){this.body=b;}};
  return {continua:comprobarEnlace(req,respuesta),...respuesta};
}
const inicial=prueba();
assert.equal(inicial.continua,false); assert.equal(inicial.status,200);
assert(!inicial.body.includes(codigo),'El servidor nunca revela el secreto al visitante');
assert(inicial.body.includes("location.hash"));
for(const ruta of ['/api/health','/api/facturas','/api/panel/estado','/index.js']) {
 const r=prueba({url:ruta}); assert.equal(r.continua,false); assert.equal(r.status,0);
}
for(const headers of [ {}, {'x-sgf-enlace':'incorrecto'}, {'x-sgf-enlace':codigo,'x-forwarded-for':'203.0.113.8'}, {'x-sgf-enlace':codigo,origin:'https://malicioso.example'}, {'x-sgf-enlace':codigo,'content-length':'5'} ]) {
 const r=prueba({method:'POST',url:'/api/acceso/enlace',headers});
 assert.equal(r.continua,false); assert.notEqual(r.status,204);
}
const r=prueba({method:'POST',url:'/api/acceso/enlace',headers:{'x-sgf-enlace':codigo,origin:'https://sgf.example'}});
assert.equal(r.status,204); assert.match(r.headers['Set-Cookie'],/Secure; HttpOnly; SameSite=Strict/);
const c=r.headers['Set-Cookie'].split(';')[0];
assert.equal(prueba({url:'/api/facturas',headers:{cookie:c}}).continua,true);
assert.equal(prueba({url:'/api/facturas',headers:{cookie:c+'; '+c}}).continua,false);
assert.equal(prueba({url:'/api/facturas',headers:{cookie:c,'x-real-ip':'203.0.113.1'}}).continua,false);
assert.equal(prueba({url:'/api/facturas',encrypted:false,headers:{cookie:c}}).continua,false);
for(let i=0;i<31;i++) prueba({method:'POST',url:'/api/acceso/enlace',headers:{'x-sgf-enlace':'invalido'},remoteAddress:'198.51.100.77'});
assert.equal(prueba({method:'POST',url:'/api/acceso/enlace',headers:{'x-sgf-enlace':codigo},remoteAddress:'198.51.100.77'}).status,429);
console.log('OK: enlace secreto TLS directo, sin rangos, no revela datos ni abre HTTP/proxy.');
