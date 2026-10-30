import {BloqueoDatos} from './bloqueo-datos.js';

// Proceso auxiliar del reinicio explícito de datos. Mantiene exactamente el
// mismo bloqueo que el servidor hasta que la aplicación cierra la tubería.
// Si la aplicación muere, el cierre de stdin también libera el bloqueo.
if(process.argv.length!==3 || !process.argv[2]) {
  console.error('Se necesita la carpeta de datos.'); process.exit(2);
}
let bloqueo:BloqueoDatos;
try {bloqueo=BloqueoDatos.adquirir(process.argv[2]);}
catch(error:any) {console.error(error?.message || 'No se pudo proteger la carpeta de datos.'); process.exit(1);}
let cerrado=false;
function terminar() {
  if(cerrado)return;
  cerrado=true;
  try {bloqueo.cerrar(); process.exit(0);} catch {process.exit(1);}
}
process.stdout.write('SGF_BLOQUEO_OK\n');
process.stdin.resume();
process.stdin.on('end',terminar);
process.stdin.on('error',terminar);
process.on('SIGTERM',terminar);
process.on('SIGINT',terminar);
