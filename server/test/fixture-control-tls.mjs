// Dos servidores TLS falsos y locales para pruebas; no usa datos de usuario.
import https from 'node:https';
import {X509Certificate,randomBytes} from 'node:crypto';
import selfsigned from 'selfsigned';
const servidores=[]; const datos=[];
for(const etiqueta of ['A','B']) {
  const hoy=Date.now();const p=await selfsigned.generate([{name:'commonName',value:'Prueba SGF'}],{keyType:'ec',algorithm:'sha256',notBeforeDate:new Date(hoy-300000),notAfterDate:new Date(hoy+86400000),extensions:[{name:'subjectAltName',altNames:[{type:7,ip:'127.0.0.1'}]}]});
  const huella=new X509Certificate(p.cert).fingerprint256.replaceAll(':','').toLowerCase();
  const s=https.createServer({key:p.private,cert:p.cert},(req,res)=>{
    console.log(`PETICION_${etiqueta}`);req.resume();req.on('end',()=>{
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({success:true,data:{token:randomBytes(24).toString('hex'),user:{username:'cuenta-prueba',role:'admin',permisos:[]}}}));
    });
  });
  await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});
  servidores.push(s);datos.push({puerto:s.address().port,huella});
}
console.log(JSON.stringify(datos));
process.stdin.resume();process.stdin.on('end',()=>{for(const s of servidores)s.close();});
