import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

/**
 * Exclusión entre procesos para la carpeta de datos: el kernel libera el
 * bloqueo SQLite incluso si un proceso termina de forma inesperada. Se usa
 * una base de control separada; nunca se abre ni cambia la base de facturas.
 *
 * Requiere Node 22.13 o posterior. No sirve para bloquear versiones antiguas
 * de SGF que no usan este protocolo ni para archivosystems que no implementen
 * correctamente los bloqueos SQLite (por ejemplo, algunas carpetas de red).
 */
export function rutaBloqueo(carpetaDatos:string):string {
  fs.mkdirSync(carpetaDatos,{recursive:true});
  const datos=fs.realpathSync.native(path.resolve(carpetaDatos));
  const padre=path.dirname(datos);
  // El reinicio de escritorio mueve toda la carpeta SGF: el archivo de control
  // debe quedar fuera de ella para que el bloqueo no se pueda eludir al moverla.
  const escritorio=path.basename(datos).toLowerCase()==='datos' && path.basename(padre).toLowerCase()==='sgf';
  const contenedor=escritorio ? path.dirname(padre) : padre;
  const normalizado=process.platform==='win32' ? datos.toLowerCase() : datos;
  const id=createHash('sha256').update(normalizado).digest('hex').slice(0,24);
  return path.join(contenedor,`.sgf-bloqueo-${id}.sqlite`);
}

export class BloqueoDatos {
  private cerrado=false;
  private constructor(private readonly control:DatabaseSync) {}
  static adquirir(carpetaDatos:string):BloqueoDatos {
    const archivo=rutaBloqueo(carpetaDatos);
    const control=new DatabaseSync(archivo);
    try {
      control.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;');
      return new BloqueoDatos(control);
    } catch(error:any) {
      try {control.close();} catch {}
      if(error?.code==='ERR_SQLITE_ERROR' && /locked|busy/i.test(error?.message || '')) {
        throw new Error('La carpeta de datos ya está en uso por otro servidor SGF. Cierre la otra instancia antes de continuar.');
      }
      throw new Error(`No se pudo proteger la carpeta de datos: ${error?.message || 'error desconocido'}`);
    }
  }
  cerrar() {
    if(this.cerrado)return;
    this.cerrado=true;
    this.control.close();
  }
}
