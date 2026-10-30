/** Facturas sintéticas: no contienen ningún dato de los PDF recibidos.
 * Ejecutar: npx tsx src/scripts/prueba-pdf-variados.ts [--salida=/ruta]
 * Sin --salida solo verifica los PDF en memoria (apto para CI).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { extraerTextoPdf } from '../utils/pdf-text.js';
import { normalizarNumero, parseFacturaEtcsa } from '../utils/factura-parser.js';

type Caso = { nombre:string; cantidad:number; estilo:'punto'|'coma'|'miles'; semilla:number; fragmentos?:boolean; desfase?:number; duplicado?:boolean };
const casos:Caso[] = [
  {nombre:'01-corta-variable',cantidad:17,estilo:'punto',semilla:1},
  {nombre:'02-multipagina',cantidad:113,estilo:'punto',semilla:2},
  {nombre:'03-decimales-coma',cantidad:287,estilo:'coma',semilla:3},
  {nombre:'04-separadores-miles',cantidad:463,estilo:'miles',semilla:4},
  {nombre:'05-gran-volumen',cantidad:907,estilo:'punto',semilla:5},
  {nombre:'06-texto-fragmentado',cantidad:139,estilo:'punto',semilla:6,fragmentos:true},
  {nombre:'07-total-inconsistente',cantidad:38,estilo:'coma',semilla:7,desfase:37},
  {nombre:'08-diferencia-un-centavo',cantidad:42,estilo:'punto',semilla:8,desfase:1},
  {nombre:'09-numero-repetido',cantidad:84,estilo:'miles',semilla:9,fragmentos:true,duplicado:true},
];
const salida=process.argv.find(x=>x.startsWith('--salida='))?.slice('--salida='.length);
if(salida) fs.mkdirSync(salida,{recursive:true});

function dinero(centimos:number, estilo:Caso['estilo']) {
  const negativo=centimos<0 ? '-' : '';
  const n=Math.abs(centimos); let entero=String(Math.floor(n/100));
  if(estilo==='miles') entero=entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo}${entero}${estilo==='punto'?'.':','}${String(n%100).padStart(2,'0')}`;
}

async function crear(caso:Caso) {
  const doc=await PDFDocument.create();
  doc.setTitle('FACTURA FICTICIA - SOLO PRUEBAS'); doc.setAuthor('Datos totalmente inventados');
  const font=await doc.embedFont(StandardFonts.Helvetica), bold=await doc.embedFont(StandardFonts.HelveticaBold);
  let page=doc.addPage([595,842]); let pagina=1;
  const col=[25,155,235,310,382,465];
  const text=(s:string,x:number,y:number,size=9,negrita=false)=>page.drawText(s,{x,y,size,font:negrita?bold:font,color:rgb(0.08,0.14,0.2)});
  const linea=(y:number)=>page.drawLine({start:{x:20,y},end:{x:575,y},thickness:0.5,color:rgb(0.55,0.65,0.72)});
  const filas=Array.from({length:caso.cantidad},(_,i)=>{
    const cuota=100+((i*137+caso.semilla*91)%40000);
    const consumo=(i%9===0?0:(i*311+caso.semilla*73)%60000);
    const comision=i%11===0?-(30+i%23):((i*11)%450);
    const impuesto=(i*19+caso.semilla)%1200;
    return {numero:String(60000000+caso.semilla*100000+(caso.duplicado && i===30 ? 1 : i)), cuota,consumo,comision,impuesto,importe:cuota+consumo+comision+impuesto};
  });
  const total=filas.reduce((a,f)=>[a[0]+f.cuota,a[1]+f.consumo,a[2]+f.comision,a[3]+f.impuesto,a[4]+f.importe],[0,0,0,0,0]);
  const numFactura=`FAKE${String(caso.semilla).padStart(2,'0')}-202611`;
  function cabeceraPagina(primera:boolean) {
    page.drawRectangle({x:20,y:800,width:555,height:24,color:rgb(0.90,0.95,0.98)});
    text('FACTURA FICTICIA — DOCUMENTO DE PRUEBA, SIN VALIDEZ',27,808,10,true);
    text(`Página ${pagina}`,515,789,8);
    if(!primera) { text('Resumen por Servicios (continuación)',25,765,10,true); return 745; }
    text(`Cliente: ENTIDAD DE PRUEBA ${caso.semilla}`,25,780);
    text(`Cuenta: AREA FICTICIA ${caso.semilla}`,25,765);
    text('Dirección: CALLE SIMULADA 10, SECTOR DE PRUEBAS',25,750);
    text(`Número de Cliente: ${9100000+caso.semilla}`,25,735);
    text(`Número de Cuenta: ${9200000+caso.semilla}`,310,735);
    text(`No. factura: ${numFactura}`,25,720);
    text('Fecha Factura: 02/11/2026',310,720);
    text('Fecha de Vencimiento: 25/11/2026',25,705);
    text('Periodo de consumo: 01/10/2026 - 31/10/2026',25,690);
    text(`Código de Pago en Banco: ${String(8300000000000000n+BigInt(caso.semilla))}`,25,675);
    text('Moneda: CUP',310,675);text(`NIT: ${930000000000+caso.semilla}`,25,660);
    text('Cuota     Consumo     Comisión     Impuesto     Facturado     Estado de Cuenta     Total a Pagar',25,640,8,true);
    const values=[...total.slice(0,4),total[4]+(caso.desfase||0),0,total[4]+(caso.desfase||0)];
    values.forEach((v,i)=>text(dinero(v,caso.estilo),[25,95,170,245,320,405,490][i],625,7));
    text('Resumen por Servicios',25,602,10,true);return 582;
  }
  function tabla(y:number) {
    page.drawRectangle({x:20,y:y-5,width:555,height:16,color:rgb(0.92,0.96,0.99)});
    ['Servicio','Cuota','Consumo','Comisión','Impuesto','Importe'].forEach((s,i)=>text(s,col[i],y,8,true));
    linea(y-7);return y-20;
  }
  let y=tabla(cabeceraPagina(true));
  for(const fila of filas) {
    if(y<63){text('Datos inventados para pruebas',25,30,7);page=doc.addPage([595,842]);pagina++;y=tabla(cabeceraPagina(false));}
    const valores=[fila.numero,...[fila.cuota,fila.consumo,fila.comision,fila.impuesto,fila.importe].map(v=>dinero(v,caso.estilo))];
    // El orden interno difiere del visual y se fragmentan algunos textos sin espacios.
    for(const idx of [5,4,3,2,1,0]) {
      const s=valores[idx],x=col[idx];
      if(caso.fragmentos && (idx===0 || idx===2) && s.length>3) {
        const cut=idx===0?4:Math.max(s.lastIndexOf('.'),s.lastIndexOf(','))+1;
        const a=s.slice(0,cut), b=s.slice(cut);
        text(a,x,y,8);text(b,x+font.widthOfTextAtSize(a,8),y,8);
      } else text(s,x,y,8);
    }
    y-=12;
  }
  if(y<78){page=doc.addPage([595,842]);pagina++;y=tabla(cabeceraPagina(false));}
  linea(y+6); text('Total',25,y-6,8,true);
  total.forEach((v,i)=>text(dinero(v+(i===4?(caso.desfase||0):0),caso.estilo),col[i+1],y-6,8,true));
  text('Pagar a: PROVEEDOR IMAGINARIO',25,y-25,8);
  text('Todas las entidades, datos y números son inventados.',25,30,7);
  return {bytes:Buffer.from(await doc.save()),filas,total,numFactura,paginas:pagina};
}

for(const caso of casos) {
 const generado=await crear(caso);
 const texto=await extraerTextoPdf(generado.bytes);
 const factura=parseFacturaEtcsa(texto);
 if(salida) {
   fs.writeFileSync(path.join(salida,`${caso.nombre}.pdf`),generado.bytes);
   fs.writeFileSync(path.join(salida,`${caso.nombre}.json`),JSON.stringify({aviso:'Datos completamente ficticios',factura:generado.numFactura,paginas:generado.paginas,sumaFilas:(generado.total[4]/100).toFixed(2),totalImpreso:((generado.total[4]+(caso.desfase||0))/100).toFixed(2),diferenciaIntencional:((caso.desfase||0)/100).toFixed(2),filas:generado.filas.map(f=>({numero:f.numero,...Object.fromEntries(['cuota','consumo','comision','impuesto','importe'].map(k=>[k,(f[k as keyof typeof f] as number/100).toFixed(2)]))}))},null,2));
 }
 assert.equal(factura.noFactura,generado.numFactura,`${caso.nombre}: número`);
 assert.equal(factura.cliente,`ENTIDAD DE PRUEBA ${caso.semilla}`,`${caso.nombre}: cliente`);
 assert.equal(factura.cuenta,`AREA FICTICIA ${caso.semilla}`,`${caso.nombre}: cuenta`);
 assert.equal(factura.direccion,'CALLE SIMULADA 10, SECTOR DE PRUEBAS',`${caso.nombre}: dirección`);
 assert.equal(factura.numeroCliente,String(9100000+caso.semilla),`${caso.nombre}: número de cliente`);
 assert.equal(factura.numeroCuenta,String(9200000+caso.semilla),`${caso.nombre}: número de cuenta`);
 assert.equal(factura.fechaEmision,'02/11/2026'); assert.equal(factura.fechaVencimiento,'25/11/2026');
 assert.equal(factura.periodoConsumo,'01/10/2026 - 31/10/2026');
 assert.equal(factura.codigoPago,String(8300000000000000n+BigInt(caso.semilla)));
 assert.equal(factura.moneda,'CUP'); assert.equal(factura.nit,String(930000000000+caso.semilla));
 assert.equal(factura.servicios.length,caso.cantidad,`${caso.nombre}: cantidad de filas`);
 for(let i=0;i<generado.filas.length;i++) {
   const esperada=generado.filas[i], obtenida=factura.servicios[i];
   assert.equal(obtenida.numero,esperada.numero,`${caso.nombre}: número en fila ${i+1}`);
   for(const k of ['cuota','consumo','comision','impuesto','importe'] as const)
     assert.equal(Math.round(normalizarNumero(obtenida[k])*100),esperada[k],`${caso.nombre}: ${k} fila ${i+1}`);
 }
 assert.equal(Math.round(normalizarNumero(factura.totales.totalServicios)*100),generado.total[4]+(caso.desfase||0),`${caso.nombre}: total impreso`);
 if(caso.desfase) assert.ok(factura.diagnostics.some(d=>d.code==='totals-mismatch-services'),`${caso.nombre}: debe avisar de diferencia inferior a 1`);
 else assert.ok(!factura.diagnostics.some(d=>d.code==='totals-mismatch-services'),`${caso.nombre}: diferencia falsa`);
 if(caso.duplicado) assert.ok(factura.diagnostics.some(d=>d.code==='services-duplicate-number'),`${caso.nombre}: debe advertir del número repetido`);
 console.log(`OK ${caso.nombre}: ${generado.paginas} páginas, ${caso.cantidad} servicios, 5 columnas${caso.desfase?' y aviso de total inconsistente':''}.`);
}
