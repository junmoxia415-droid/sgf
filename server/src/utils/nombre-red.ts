import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import ciao from '@homebridge/ciao';
import type { Responder, CiaoService, ServiceOptions } from '@homebridge/ciao';

/** Nombre mDNS local. No es DNS público, HTTPS ni autenticación del servidor. */
export type EstadoNombreRed = {
  estado: 'desactivado' | 'esperando_red' | 'publicando' | 'activo' | 'error';
  nombre: string | null;
  enlace: string | null;
  mensaje: string;
};
type ServicioRed = Pick<CiaoService,'on'|'advertise'|'getHostname'>;
type RespondedorRed = {createService(opciones:ServiceOptions):ServicioRed; shutdown():Promise<void>};
type Opciones = {direcciones?:()=>string[]; crearRespondedor?:()=>RespondedorRed; intervaloMs?:number};

/** Aceptar únicamente direcciones privadas no loopback a las que SGF atiende. */
export function esIpv4Privada(ip:string):boolean {
  const p=ip.split('.');
  if(p.length!==4 || p.some(x=>!/^\d{1,3}$/.test(x) || Number(x)>255)) return false;
  const [a,b]=p.map(Number);
  return a===10 || (a===192 && b===168) || (a===172 && b>=16 && b<=31) || (a===169 && b===254);
}
export function direccionesPrivadas():string[] {
  const ips=new Set<string>();
  for(const interfaces of Object.values(os.networkInterfaces())) {
    for(const item of interfaces || []) {
      if(!item.internal && item.family==='IPv4' && esIpv4Privada(item.address)) ips.add(item.address);
    }
  }
  return [...ips].sort();
}

function nombrePersistido(carpeta:string):string {
  const archivo=path.join(carpeta,'nombre-red.json');
  try {
    const v=JSON.parse(fs.readFileSync(archivo,'utf8'));
    if(typeof v.nombre==='string' && /^sgf-[a-f0-9]{12}$/.test(v.nombre)) return v.nombre;
  } catch { /* La primera vez no existe. */ }
  const nombre=`sgf-${randomBytes(6).toString('hex')}`;
  fs.mkdirSync(carpeta,{recursive:true});
  // Fallar si no puede persistirse: un nombre nuevo en cada reinicio sería engañoso.
  const temporal=`${archivo}.${process.pid}.tmp`;
  try { fs.writeFileSync(temporal, JSON.stringify({nombre}),{mode:0o600}); fs.renameSync(temporal,archivo); }
  finally { try { fs.unlinkSync(temporal); } catch {} }
  return nombre;
}

export class AnunciadorRed {
  private estado: EstadoNombreRed = {estado:'desactivado',nombre:null,enlace:null,mensaje:'El anuncio de red no está activo.'};
  private responder: RespondedorRed | null = null;
  private temporizador: NodeJS.Timeout | null = null;
  private actualizando = false;
  private detenido = false;
  private direccionesAnteriores = '';
  private puerto = 0;
  private carpeta = '';
  private readonly direcciones:()=>string[];
  private readonly crearRespondedor:()=>RespondedorRed;
  private readonly intervaloMs:number;
  constructor(opciones:Opciones={}) {
    this.direcciones=opciones.direcciones || direccionesPrivadas;
    this.crearRespondedor=opciones.crearRespondedor || (()=>ciao.getResponder() as Responder);
    this.intervaloMs=opciones.intervaloMs || 10000;
  }
  obtenerEstado():EstadoNombreRed { return {...this.estado}; }

  private async cerrarAnuncio() {
    const anterior=this.responder;
    this.responder=null;
    if(anterior) await anterior.shutdown();
  }

  async actualizar() {
    if(this.detenido || this.actualizando) return;
    this.actualizando=true;
    try {
      // Validar de nuevo, incluso si una fuente de pruebas aporta otras direcciones.
      const direcciones=[...new Set(this.direcciones().filter(esIpv4Privada))].sort();
      const marca=direcciones.join(',');
      if(marca===this.direccionesAnteriores && (this.estado.estado==='activo' || this.estado.estado==='esperando_red')) return;
      await this.cerrarAnuncio();
      if(this.detenido) return;
      this.direccionesAnteriores=marca;
      if(direcciones.length===0) {
        this.estado={estado:'esperando_red',nombre:null,enlace:null,mensaje:'Esperando una dirección IPv4 privada.'};
        return;
      }
      const nombre=nombrePersistido(this.carpeta);
      this.estado={estado:'publicando',nombre:null,enlace:null,mensaje:'Preparando el nombre local en la red.'};
      const responder=this.crearRespondedor(); this.responder=responder;
      const servicio=responder.createService({name:nombre,hostname:nombre,type:'http',port:this.puerto,
        disabledIpv6:true,restrictedAddresses:direcciones});
      // Si un clon usa el mismo nombre, nunca continuar mostrando el nombre
      // anterior: podría resolver al otro equipo. También puede detectarse un
      // conflicto después del anuncio inicial.
      let conflicto=false;
      const avisarConflicto=()=>{
        conflicto=true;
        if(this.responder===responder && this.estado.estado==='activo') {
          this.estado={estado:'error',nombre:null,enlace:null,mensaje:'Otro equipo usa el mismo nombre local. Use el enlace por IP y consulte al administrador.'};
          void this.cerrarAnuncio().catch(()=>{});
        }
      };
      servicio.on('name-change',avisarConflicto);
      servicio.on('hostname-change',avisarConflicto);
      await servicio.advertise();
      if(this.detenido) return;
      if(conflicto) {
        await this.cerrarAnuncio();
        this.estado={estado:'error',nombre:null,enlace:null,mensaje:'Otro equipo usa el mismo nombre local. Use el enlace por IP y consulte al administrador.'};
        return;
      }
      const host=servicio.getHostname().replace(/\.$/,'').toLowerCase();
      if(host!==`${nombre}.local`) throw new Error('El nombre local publicado no coincide con el esperado.');
      this.estado={estado:'activo',nombre:host,enlace:`http://${host}:${this.puerto}`,mensaje:'Nombre publicado en esta red; depende de que los clientes acepten mDNS.'};
      console.log(`[SGF] Nombre de red local: ${this.estado.enlace}`);
    } catch(error:any) {
      try { await this.cerrarAnuncio(); } catch { /* No impedir el cierre del servidor. */ }
      if(!this.detenido) {
        this.estado={estado:'error',nombre:null,enlace:null,mensaje:`No se pudo publicar el nombre local: ${error?.message || 'error de red'}`};
        console.warn('[SGF] Nombre local no disponible:',error?.message || 'error de red');
      }
    } finally { this.actualizando=false; }
  }

  /** Se llama solo después de que HTTP escucha en interfaces de red. */
  iniciar(carpeta:string,puerto:number,host:string) {
    if(!carpeta || !['0.0.0.0','::'].includes(host) || process.env.SGF_MDNS==='0') {
      this.estado={estado:'desactivado',nombre:null,enlace:null,mensaje:'El anuncio local está desactivado o el servidor solo escucha en este equipo.'};
      return;
    }
    this.carpeta=carpeta; this.puerto=puerto; this.detenido=false; this.direccionesAnteriores='';
    void this.actualizar();
    this.temporizador=setInterval(()=>void this.actualizar(),this.intervaloMs);
    this.temporizador.unref();
  }
  async detener() {
    this.detenido=true;
    if(this.temporizador) {clearInterval(this.temporizador); this.temporizador=null;}
    await this.cerrarAnuncio();
    this.estado={estado:'desactivado',nombre:null,enlace:null,mensaje:'El anuncio de red se ha detenido.'};
  }
}
const anunciador=new AnunciadorRed();
export function estadoNombreRed():EstadoNombreRed {return anunciador.obtenerEstado();}
export function iniciarNombreRed(carpeta:string,puerto:number,host:string) {anunciador.iniciar(carpeta,puerto,host);}
export async function detenerNombreRed() {await anunciador.detener();}
