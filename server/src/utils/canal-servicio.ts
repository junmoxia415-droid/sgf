import tls from 'node:tls';
import {createHash} from 'node:crypto';

/** Envía el cierre solo DESPUÉS de verificar la huella en el mismo socket. */
export function solicitarCierreServicio(puerto:number,huella:string,token:string):Promise<void> {
  if(!Number.isInteger(puerto) || puerto<1 || puerto>65535 || !/^[a-f0-9]{64}$/.test(huella) || !/^[a-f0-9]{64}$/.test(token)) {
    return Promise.reject(new Error('Datos del canal local de servicio inválidos.'));
  }
  return new Promise((resolve,reject)=>{
    const socket=tls.connect({host:'127.0.0.1',port:puerto,rejectUnauthorized:false});
    let completado=false,buffer='';
    const terminar=(error?:Error)=>{if(completado)return;completado=true;socket.destroy();error?reject(error):resolve();};
    socket.setTimeout(5000,()=>terminar(new Error('El canal local no respondió al cierre.')));
    socket.once('error',e=>terminar(e));
    socket.once('secureConnect',()=>{
      const cert=socket.getPeerCertificate();
      if(!cert.raw || createHash('sha256').update(cert.raw).digest('hex')!==huella) {
        terminar(new Error('Se rechazó el certificado del canal local.'));return;
      }
      const cuerpo='{}';
      socket.write(`POST /api/panel/apagar HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(cuerpo)}\r\nx-sgf-console-token: ${token}\r\nConnection: close\r\n\r\n${cuerpo}`);
    });
    socket.on('data',b=>{buffer+=b.toString('utf8');if(buffer.length>16384) terminar(new Error('Respuesta local excesiva.'));});
    socket.once('end',()=>/^HTTP\/1\.[01] 200\b/.test(buffer) ? terminar() : terminar(new Error('El servidor no confirmó el cierre.')));
  });
}
