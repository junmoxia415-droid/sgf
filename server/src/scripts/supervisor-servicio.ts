// Proceso supervisor para servicio Windows de identidad restringida. Se comunica
// con la consola mediante un anuncio autenticado y nunca escribe el token en él.
import fs from 'node:fs';
import path from 'node:path';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline';
import {estadoRedProtegida} from '../utils/red-protegida.js';
import {solicitarCierreServicio} from '../utils/canal-servicio.js';

type Anuncio={puerto:number,huella:string,mac:string};
type Config={datos:string,archivoEnv:string,token:string,anuncio:string,puerto:number};
let hijo:ChildProcess|null=null, anuncio:Anuncio|null=null, deteniendo=false, config:Config|null=null;
function regular(p:string) {const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()) throw new Error('Archivo de configuración o token inválido.');}
function leerConfig():Config {
  const p=process.env.SGF_SERVICIO_CONFIG;
  if(!p || !path.isAbsolute(p)) throw new Error('Falta la configuración del servicio.');
  regular(p);
  const x=JSON.parse(fs.readFileSync(p,'utf8'));
  if(x.tipo!=='sgf-servicio-v1' || ![x.datos,x.archivoEnv,x.token,x.anuncio].every((v:any)=>typeof v==='string'&&path.isAbsolute(v)) ||
     !Number.isInteger(x.puerto) || (x.puerto!==443 && (x.puerto<1024 || x.puerto>65535))) throw new Error('Configuración de servicio inválida.');
  if(!fs.lstatSync(x.datos).isDirectory() || fs.lstatSync(x.datos).isSymbolicLink()) throw new Error('Carpeta de datos inválida.');
  regular(x.archivoEnv);regular(x.token);
  if(!estadoRedProtegida(x.datos)) throw new Error('El servicio requiere una identidad HTTPS preparada.');
  return x as Config;
}
function validarMarca(texto:string,token:string):Anuncio {
  const x=JSON.parse(texto) as Anuncio;
  if(!Number.isInteger(x.puerto) || x.puerto<1 || x.puerto>65535 || !/^[a-f0-9]{64}$/.test(x.huella) || !/^[a-f0-9]{64}$/.test(x.mac)) throw new Error('Anuncio local inválido.');
  const mac=createHmac('sha256',token).update(`SGF_TLS:${x.puerto}:${x.huella}`).digest();
  if(!timingSafeEqual(mac,Buffer.from(x.mac,'hex'))) throw new Error('Anuncio local no autenticado.');
  return x;
}
function borrarAnuncio() {
  if(!config || !hijo) return;
  try {
    const v=JSON.parse(fs.readFileSync(config.anuncio,'utf8'));
    if(v.pid===hijo.pid) fs.unlinkSync(config.anuncio);
  } catch { /* ningún anuncio propio que retirar */ }
}
async function detener(token:string) {
  if(deteniendo) return;deteniendo=true;
  if(!hijo || hijo.exitCode!==null) return;
  if(!anuncio) throw new Error('El servidor no anunció un canal de cierre autenticado.');
  const fin=new Promise<number|null>(resolve=>hijo!.once('exit',code=>resolve(code)));
  await solicitarCierreServicio(anuncio.puerto,anuncio.huella,token);
  const resultado=await Promise.race([fin,new Promise<null>(resolve=>setTimeout(()=>resolve(null),12000))]);
  if(resultado!==0) throw new Error('No se confirmó el cierre ordenado del servidor.');
}
try {
  config=leerConfig();
  const token=fs.readFileSync(config.token,'utf8').trim();
  if(!/^[a-f0-9]{64}$/.test(token)) throw new Error('El token del servicio no es válido.');
  const env={...process.env};
  // La identidad del servicio no debe heredar accidentalmente otra base o
  // ajustes de SGF de variables de sistema distintas del .env elegido.
  for(const k of Object.keys(env)) if(/^(?:SGF_|ORACLE_|MSSQL_|JWT_|DB_TYPE$|HOST$|PORT$|NODE_OPTIONS$)/i.test(k)) delete env[k];
  Object.assign(env,{NODE_ENV:'production',SGF_DATA_DIR:config.datos,SGF_ENV_FILE:config.archivoEnv,SGF_CONSOLE_TOKEN:token,SGF_CONTROL_TLS:'1',HOST:'0.0.0.0',PORT:String(config.puerto)});
  const principal=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../index.js');
  hijo=spawn(process.execPath,[principal],{cwd:path.resolve(path.dirname(principal),'..'),env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const proceso=hijo;
  const lineas=readline.createInterface({input:proceso.stdout!});
  lineas.on('line',linea=>{
    if(!linea.startsWith('[SGF_TLS] ')) return;
    try {
      const validado=validarMarca(linea.substring('[SGF_TLS] '.length),token);
      const temporal=`${config!.anuncio}.${process.pid}.tmp`;
      fs.writeFileSync(temporal,JSON.stringify({version:1,pid:proceso.pid,linea}),{mode:0o600,flag:'wx'});
      fs.renameSync(temporal,config!.anuncio);
      anuncio=validado;
      console.log('[SGF] Servicio listo con canal local autenticado.');
    } catch {console.error('[SGF] No se pudo publicar el canal local autenticado.');proceso.kill();}
  });
  // No escribir stderr crudo: puede contener rutas o datos de una configuración.
  proceso.stderr!.on('data',()=>{});
  proceso.once('exit',code=>{borrarAnuncio();if(!deteniendo){console.error('[SGF] El servidor del servicio terminó inesperadamente.');process.exit(code || 1);} });
  const stop=()=>void detener(token).then(()=>{borrarAnuncio();process.exit(0);}).catch(()=>{
    console.error('[SGF] No se confirmó el cierre ordenado; revise el guardado y las copias.');
    borrarAnuncio();if(proceso.exitCode===null)proceso.kill();process.exitCode=1;
  });
  process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{if(String(s).includes('STOP'))stop();});
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
} catch {
  console.error('[SGF] No se pudo iniciar el servicio. Compruebe su configuración e identidad HTTPS.');
  process.exitCode=1;
}
