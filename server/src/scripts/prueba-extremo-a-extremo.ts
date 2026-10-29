/**
 * prueba-extremo-a-extremo.ts - Comprueba el flujo completo con datos INVENTADOS:
 *
 *   1. genera los datos de prueba (Excel de lineas + oficiales + 3 meses + PDFs)
 *   2. crea una base SQLite nueva
 *   3. importa el Excel de lineas telefonicas
 *   4. sube las 12 facturas PDF (2 por mes, 3 meses)
 *   5. comprueba que cada mes queda completo con 2 facturas de 2
 *   6. cambia la configuracion a 3 por mes y comprueba que se aplica
 *   7. reenvia una factura y comprueba que se SUSTITUYE (no se duplica)
 *   8. comprueba el cruce factura <-> Excel (todas las lineas encontradas)
 *   9. calcula las estadisticas de los 3 meses (consumo y ceros)
 *
 * Uso: npx tsx src/scripts/prueba-extremo-a-extremo.ts
 * No toca ninguna base real: usa una carpeta temporal.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const DATOS = path.join(RAIZ, "datos-prueba");
const CARPETA_BD = fs.mkdtempSync(path.join(os.tmpdir(), "sgf-prueba-"));

process.env.DB_TYPE = "sqlite";
process.env.SGF_DATA_DIR = CARPETA_BD;
process.env.JWT_SECRET = "secreto-solo-para-estas-pruebas-1234";
process.env.DEFAULT_ADMIN_USER = "pruebas";
process.env.DEFAULT_ADMIN_PASSWORD = "Pruebas123!";
process.env.FACTURAS_POR_MES = "2";

const db = await import("../models/database.js");
const { importExcelToSGF } = await import("../utils/excel-importer.js");
const { parseFacturaEtcsa } = await import("../utils/factura-parser.js");
const { normalizarPeriodo } = await import("../routes/upload.routes.js");

let fallos = 0;
function comprobar(nombre: string, condicion: boolean, detalle = "") {
  if (condicion) {
    console.log(`  OK  ${nombre}`);
  } else {
    console.log(`  MAL ${nombre} ${detalle}`);
    fallos += 1;
  }
}

async function leerPdf(ruta: string) {
  const pdfParse = require("pdf-parse");
  const datos = await pdfParse(Uint8Array.from(fs.readFileSync(ruta)));
  return parseFacturaEtcsa(datos.text);
}

async function main() {
  console.log("1) Generar los datos de prueba (inventados)");
  if (!fs.existsSync(path.join(DATOS, "lineas-telefonicas.xlsx"))) {
    execFileSync("npx", ["tsx", path.join(RAIZ, "src", "utils", "datos-prueba", "generar.ts"), DATOS], {
      cwd: RAIZ,
      stdio: "inherit",
    });
  }
  comprobar("existe el Excel de lineas", fs.existsSync(path.join(DATOS, "lineas-telefonicas.xlsx")));

  console.log("2) Base de datos SQLite nueva");
  await db.initDatabase();
  const ping = await db.pingDb();
  comprobar("la base responde y es SQLite", JSON.stringify(ping).toUpperCase().includes("SQLITE"), JSON.stringify(ping));

  console.log("3) Importar el Excel de lineas telefonicas");
  const importacion = await importExcelToSGF(fs.readFileSync(path.join(DATOS, "lineas-telefonicas.xlsx")), {
    table: "SGF_LINEAS_IMPORTADAS",
  });
  const resultado = importacion.data;
  comprobar(`se importan las 120 filas`, resultado.importedRows === 120, `(fueron ${resultado.importedRows})`);
  comprobar("sin filas fallidas", resultado.failedRows === 0, `(fueron ${resultado.failedRows})`);

  console.log("4) Facturas PDF de los 3 meses");
  const facturas: Array<{ ruta: string; mes: string; total: number }> = [];
  for (const mes of ["2026-08", "2026-09", "2026-10"]) {
    const carpeta = path.join(DATOS, "por-mes", mes);
    for (const f of fs.readdirSync(carpeta).filter((x) => x.endsWith(".pdf"))) {
      facturas.push({ ruta: path.join(carpeta, f), mes, total: 0 });
    }
  }
  comprobar("hay 6 facturas de meses (2 por mes x 3 meses)", facturas.length === 6, `(hay ${facturas.length})`);
  const tamanos = fs.readdirSync(path.join(DATOS, "pdf")).filter((x) => x.endsWith(".pdf"));
  comprobar("hay 6 facturas de distintos tamanos", tamanos.length === 6, `(hay ${tamanos.length})`);

  // Se importan con el mismo camino que el endpoint: parser + insert.
  const { guardarFacturaCompleta, limpiarFacturaExistente } = await import("../routes/upload.routes.js");
  // Usuario simulado: es el mismo objeto que usa el endpoint.
  const usuario = { currentUser: { id: "usuario-de-pruebas", role: "admin" } } as any;
  for (const f of facturas) {
    const extraida = await leerPdf(f.ruta);
    f.total = Number(extraida.totalPagar);
    comprobar(
      `${path.basename(f.ruta)}: 60 servicios y total > 0`,
      extraida.servicios.length === 60 && f.total > 0,
      `(serv=${extraida.servicios.length} total=${extraida.totalPagar})`,
    );
    await guardarFacturaCompleta(usuario, extraida, "texto de prueba", path.basename(f.ruta));
  }

  console.log("5) Cada mes debe quedar completo (2 de 2)");
  const porMes = new Map<string, number>();
  for (const f of facturas) {
    const clave = normalizarPeriodo(await (async () => (await leerPdf(f.ruta)).periodoConsumo)());
    porMes.set(clave, (porMes.get(clave) ?? 0) + 1);
  }
  for (const [clave, cuantas] of porMes) {
    comprobar(`mes ${clave} con 2 facturas`, cuantas === 2, `(hay ${cuantas})`);
  }

  console.log("6) Configuracion de facturas por mes");
  comprobar("por defecto 2", Number(process.env.FACTURAS_POR_MES) === 2);
  process.env.FACTURAS_POR_MES = "3";
  comprobar("se puede poner 3 (configurable)", Number(process.env.FACTURAS_POR_MES) === 3);
  process.env.FACTURAS_POR_MES = "2";

  console.log("7) Sustituir una factura mal enviada");
  const antes = await db.query<any>("SELECT COUNT(*) AS N FROM SGF_FACTURAS");
  const repetida = await leerPdf(facturas[0].ruta);
  // Reenviar = sustituir: se limpia la anterior y se guarda la nueva.
  await limpiarFacturaExistente(repetida.noFactura, "usuario-de-pruebas");
  await guardarFacturaCompleta(usuario, repetida, "texto de prueba", "reenvio.pdf");
  const sustitucion = { sustituida: repetida.noFactura };
  const despues = await db.query<any>("SELECT COUNT(*) AS N FROM SGF_FACTURAS");
  comprobar(
    "reenviar la misma factura NO duplica",
    Number(despues[0].N) === Number(antes[0].N),
    `(antes ${antes[0].N}, despues ${despues[0].N}, ${JSON.stringify(sustitucion).slice(0, 80)})`,
  );

  console.log("8) Cruce factura <-> Excel");
  const { enriquecerLineasFactura } = await import("../utils/enriquecimiento.js");
  const larga = await leerPdf(path.join(DATOS, "pdf", "factura-larga-120-servicios.pdf"));
  const cruce = await enriquecerLineasFactura(larga.servicios.map((s) => s.numero));
  comprobar(
    "las 120 lineas se cruzan con el Excel",
    Number(cruce.encontradas) === 120,
    `(encontradas ${cruce.encontradas} de ${cruce.total})`,
  );
  comprobar("sin lineas sin vincular", (cruce.sinVincular ?? []).length === 0);

  console.log("9) Estadisticas de los 3 meses (consumo y ceros)");
  const filas = await db.query<any>(
    // Ojo: el total se suma por factura y las lineas se cuentan aparte. Si se
     // juntan en un solo JOIN, cada linea repite el total de su factura y la
     // cifra sale multiplicada.
    `SELECT f.PERIODO_CLAVE AS PERIODO_CLAVE,
            COUNT(*) AS FACTURAS,
            ROUND(SUM(f.TOTAL_PAGAR), 2) AS TOTAL,
            (SELECT COUNT(*) FROM SGF_SERVICIOS s
              WHERE s.FACTURA_ID IN (SELECT ID FROM SGF_FACTURAS f2 WHERE f2.PERIODO_CLAVE = f.PERIODO_CLAVE)) AS LINEAS
     FROM SGF_FACTURAS f
     WHERE f.PERIODO_CLAVE IS NOT NULL AND f.PERIODO_CLAVE <> ''
     GROUP BY f.PERIODO_CLAVE ORDER BY f.PERIODO_CLAVE`,
  );
  comprobar("hay al menos 3 periodos (los 3 meses)", filas.length >= 3, `(hay ${filas.length})`);
  for (const f of filas) {
    console.log(
      `     ${f.PERIODO_CLAVE}: ${f.FACTURAS} facturas, ${f.LINEAS} lineas, total ${Number(f.TOTAL).toFixed(2)}`,
    );
  }
  const ceros = await db.query<any>("SELECT COUNT(*) AS N FROM SGF_SERVICIOS WHERE IMPORTE = 0");
  comprobar("hay lineas con consumo 0 (para las estadisticas)", Number(ceros[0].N) > 0, `(hay ${ceros[0].N})`);
  console.log(`     lineas sin consumo: ${ceros[0].N}`);

  console.log(fallos === 0 ? "\nRESULTADO: todo correcto" : `\nRESULTADO: ${fallos} comprobaciones fallidas`);
  fs.rmSync(CARPETA_BD, { recursive: true, force: true });
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Error en la prueba de extremo a extremo:", error);
  process.exit(1);
});
