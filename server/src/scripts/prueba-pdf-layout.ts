/** PDF sintético multipágina: todo el contenido es inventado. */
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extraerTextoPdf } from '../utils/pdf-text.js';
import { parseFacturaEtcsa, normalizarNumero } from '../utils/factura-parser.js';

const pdf=await PDFDocument.create();
const font=await pdf.embedFont(StandardFonts.Helvetica);
let page=pdf.addPage([600,800]);
const draw=(text:string,x:number,y:number)=>page.drawText(text,{x,y,size:9,font});
draw('Cliente: ORGANIZACION FICTICIA',20,760);
draw('Cuenta: AREA DE PRUEBA',20,745);
draw('Numero de Cliente: 1234567',20,730); draw('Numero de Cuenta: 7654321',320,730);
draw('No. factura: 789123A1234567',320,715); draw('Fecha Factura: 02/01/2025',320,700);
draw('Fecha de Vencimiento: 22/01/2025',320,685); draw('Periodo de consumo: 01/01/2025 - 31/01/2025',20,670);
draw('Codigo de Pago en Banco: 1111222233334444',20,655); draw('Moneda: CUP',320,655); draw('NIT: 123456789012',20,640);
draw('Cuota   Consumo   Comision   Impuesto   Facturado   Estado de Cuenta   Total a Pagar',20,620);
const count=140; draw(`140.00 280.00 0.00 0.00 420.00 0.00 420.00`,20,605);
draw('Resumen por Servicios',20,580);draw('Servicio    Cuota    Consumo    Comision    Impuesto    Importe',20,565);
let y=550;
for(let i=0;i<count;i++) {
  if(y<45){page=pdf.addPage([600,800]);y=760;}
  // Pintar deliberadamente primero los importes y después el número, como en PDFs con orden interno distinto al visual.
  draw('1.00',200,y);draw('2.00',270,y);draw('0.00',340,y);draw('0.00',410,y);draw('3.00',480,y);draw(String(50000000+i),30,y);y-=10;
}
draw('Total 140.00 280.00 0.00 0.00 420.00',20,y-4);
draw('Pagar a: PROVEEDOR FICTICIO',20,y-20);
const bytes=Buffer.from(await pdf.save());
const texto=await extraerTextoPdf(bytes);const factura=parseFacturaEtcsa(texto);
assert.equal(factura.noFactura,'789123A1234567');
assert.equal(factura.numeroCliente,'1234567'); assert.equal(factura.numeroCuenta,'7654321');
assert.equal(factura.servicios.length,count);
for(let i=0;i<count;i++) {
 const s=factura.servicios[i];assert.equal(s.numero,String(50000000+i));
 assert.deepEqual([s.cuota,s.consumo,s.comision,s.impuesto,s.importe],['1.00','2.00','0.00','0.00','3.00']);
}
assert.equal(normalizarNumero(factura.totales.totalServicios),420);
assert.equal(normalizarNumero(factura.totalPagar),420);
console.log(`OK: PDF sintético multipágina; ${count} filas, columnas y totales.`);
