import fs from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";
import { parseFacturaEtcsa } from "../utils/factura-parser.js";

const carpeta = "/home/user/datos-prueba";
const ficheros: string[] = [];
for (const d of ["pdf", "por-mes/2026-08", "por-mes/2026-09", "por-mes/2026-10"]) {
  for (const f of fs.readdirSync(path.join(carpeta, d)).filter((x: string) => x.endsWith(".pdf"))) {
    ficheros.push(path.join(carpeta, d, f));
  }
}

async function main(){
let ok = 0, fallos = 0;
for (const f of ficheros) {
  const data = await pdfParse(Uint8Array.from(fs.readFileSync(f)));
  const r = parseFacturaEtcsa(data.text);
  const paginas = data.numpages;
  const sumaImportes = r.servicios.reduce((a, s) => a + Number(s.importe), 0);
  // La factura real suma el importe bruto de cada servicio y despues resta el
  // descuento comercial: total a pagar = suma de servicios - descuento.
  const descuento = Number(r.totales.descuento);
  const totalOk = Math.abs(sumaImportes - descuento - Number(r.totalPagar)) < 1;
  const brutoOk = Math.abs(sumaImportes - (Number(r.totales.cuota) + Number(r.totales.consumo) + Number(r.totales.comision) + Number(r.totales.impuesto))) < 1;
  const bien = r.servicios.length > 0 && r.noFactura && r.cliente && r.periodoConsumo && r.totalPagar !== "0.00";
  const correcto = bien && totalOk && brutoOk;
  if (correcto) ok++; else fallos++;
  console.log(`${bien && totalOk ? "OK " : "MAL"} ${path.basename(f).padEnd(42)} pag=${String(paginas).padStart(2)} serv=${String(r.servicios.length).padStart(3)} conf=${String(r.confidence).padStart(2)} ${r.reviewStatus.padEnd(8)} total=${r.totalPagar.padStart(12)} sumServ=${sumaImportes.toFixed(2).padStart(12)} per="${r.periodoConsumo}" nf=${r.noFactura} cli=${r.cliente.slice(0,28)}`);
  if (!correcto) {
    console.log(`     totalOk=${totalOk} brutoOk=${brutoOk} descuento=${descuento}`);
    for (const d of r.diagnostics.filter(d=>d.level!=="info")) console.log("     ", d.level, d.code, d.message.slice(0,110));
  }
}
console.log(`\nRESULTADO: ${ok}/${ficheros.length} facturas leidas correctamente, ${fallos} fallos`);
}
main();
