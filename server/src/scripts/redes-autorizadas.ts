// Configuración local explícita; no cambia firewall ni confianza de Windows.
import fs from 'node:fs';
import path from 'node:path';
import {leerRedes,validarRedes} from '../utils/redes-autorizadas.js';
const [operacion,datos,contenido]=process.argv.slice(2);
try {
  if(!datos || !path.isAbsolute(datos) || !['leer','guardar'].includes(operacion)) throw new Error('Solicitud inválida.');
  const st=fs.lstatSync(datos);
  if(!st.isDirectory() || st.isSymbolicLink()) throw new Error('Carpeta de datos inválida.');
  const p=path.join(datos,'redes-autorizadas.json');
  if(operacion==='guardar') {
    // Rechazar archivos dañados/enlaces; nunca sustituirlos silenciosamente.
    leerRedes(datos);
    const redes=validarRedes(JSON.parse(contenido || 'null')).map(r=>r.texto);
    const tmp=path.join(datos,`.redes-autorizadas-${process.pid}.tmp`);
    try {
      fs.writeFileSync(tmp,JSON.stringify({version:1,redes}),{mode:0o600,flag:'wx'});
      fs.renameSync(tmp,p);
    } finally {try {fs.unlinkSync(tmp);} catch { /* no queda temporal */ }}
  }
  console.log(JSON.stringify({version:1,redes:leerRedes(datos).map(r=>r.texto)}));
} catch(error:any) {
  console.error(`No se pudo gestionar la red autorizada: ${error?.message || 'error desconocido'}`);
  process.exitCode=1;
}
