/**
 * generar.ts - Genera un paquete completo de datos de PRUEBA para SGF.
 *
 * Crea, en la carpeta indicada (por defecto datos-prueba/):
 *   - lineas-telefonicas.xlsx   (Excel con las mismas columnas que prueba.xlsx)
 *   - oficiales.xlsx            (relacion de oficiales a cargo)
 *   - pdf/factura-corta-*.pdf   (facturas de 1, 2 y 4 servicios)
 *   - pdf/factura-larga-*.pdf   (facturas de 12, 40 y 120 servicios)
 *   - por-mes/2026-08..10/...   (2 facturas por mes, como en la realidad)
 *   - estadisticas.json/.csv    (consumo por mes, ceros, medias, por oficial)
 *
 * Todos los datos son inventados. La semilla es fija: repetir el comando da
 * exactamente los mismos ficheros.
 *
 * Uso:  npx tsx src/utils/datos-prueba/generar.ts [carpeta-destino]
 */

import fs from "node:fs";
import path from "node:path";
// El xlsx del proyecto es un paquete local (vendor/) y su tipado no expone
// write/WorkBook desde el import ESM: se usa el default como en excel-importer.
import * as XLSXMod from "xlsx";
const XLSX: any = (XLSXMod as any).default || XLSXMod;
import { generarLineas, consumoDeLinea } from "./generador.js";
import { guardarFactura, fmt, type ServicioFactura, type DatosFactura } from "./pdf-factura.js";

const DESTINO = path.resolve(process.argv[2] || "datos-prueba");

// Los 3 meses que se facturan. Cada mes va en 2 facturas (como en la practica:
// los telefonos se reparten entre dos cuentas/facturas del mismo mes).
const MESES = [
  { clave: "2026-08", nombre: "agosto", desde: "01/08/26", hasta: "31/08/26", emision: "02/09/26", vence: "30/09/26", dias: 31 },
  { clave: "2026-09", nombre: "septiembre", desde: "01/09/26", hasta: "30/09/26", emision: "02/10/26", vence: "31/10/26", dias: 30 },
  { clave: "2026-10", nombre: "octubre", desde: "01/10/26", hasta: "31/10/26", emision: "02/11/26", vence: "30/11/26", dias: 31 },
];

const FACTURAS_POR_MES = 2;

function escribirExcelLineas(lineas: ReturnType<typeof generarLineas>["lineas"]) {
  // Mismas cabeceras exactas que prueba.xlsx, para que el mapeo funcione igual.
  const filas = lineas.map((l) => ({
    "Número": l.numero,
    "Asignación voz": l.asignacionVoz,
    "Asignación SMS": l.asignacionSms,
    "Tipo de Teléfono": l.tipoTelefono,
    "Estructura": l.organo,
    "Provincia": l.provincia,
    "Municipio": l.municipio,
    "Órgano": l.organo,
    "Unidad": l.unidad,
    "Ubicación": `${l.unidad}`,
    "Cargo": l.cargo,
    "Usuario/Puesto": l.oficial,
    "Grado": l.grado,
    "Estado": l.estado,
    "Marca": l.marca,
    "Modelo": l.modelo,
    "Tarjeta SD": l.tarjetaSd,
    "Público": l.publico,
    "Estuche": l.estuche,
    "PIN": l.pin,
    "PUK": l.puk,
    "IMEI": l.imei,
    "Mms": l.mms,
    "Internet": l.internet,
    "Fecha de actualización": "29/10/2026",
  }));

  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja["!cols"] = [
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 20 },
    { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 6 },
    { wch: 10 }, { wch: 16 }, { wch: 6 }, { wch: 9 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(libro, hoja, "Lineas");

  // Segunda hoja: oficiales, para poder cruzarlos con las lineas.
  return libro;
}

function escribirExcelOficiales(oficiales: ReturnType<typeof generarLineas>["oficiales"], lineas: ReturnType<typeof generarLineas>["lineas"]) {
  const filas = oficiales.map((o) => ({
    "Nombre y apellidos": o.nombre,
    "CI": o.ci,
    "Provincia": o.provincia,
    "Municipio": o.municipio,
    "Órgano": o.organo,
    "Unidad": o.unidad,
    "Cargo": o.cargo,
    "Grado": o.grado,
    "Líneas a su cargo": lineas.filter((l) => l.oficial === o.nombre).length,
  }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Oficiales");
  return libro;
}

/** Construye los datos de la factura (cabecera + servicios) de un lote. */
function facturaDe(
  indiceMes: number,
  numeroFactura: number,
  lote: number,
  servicios: ServicioFactura[],
): DatosFactura {
  const mes = MESES[indiceMes];
  const t = servicios.reduce(
    (a, s) => ({
      cuota: a.cuota + s.cuota,
      consumo: a.consumo + s.consumo,
      comision: a.comision + s.comision,
      impuesto: a.impuesto + s.impuesto,
      importe: a.importe + s.importe,
    }),
    { cuota: 0, consumo: 0, comision: 0, impuesto: 0, importe: 0 },
  );
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const totalServicios = r2(t.cuota + t.consumo + t.comision + t.impuesto);
  const descuento = r2(t.comision);
  const facturado = r2(totalServicios - descuento);
  const noFactura = `3108${String(numeroFactura).padStart(2, "0")}A19${String(50000 + numeroFactura * 7 + lote).padStart(5, "0")}`;

  return {
    cliente: lote === 1
      ? "DELEGACION TERRITORIAL DEL MININT VILLA CLARA"
      : "SECCION ECONOMICA MININT VILLA CLARA",
    cuenta: lote === 1
      ? "DELEGACION TERRITORIAL DEL MININT VILLA CLARA"
      : "SECCION ECONOMICA MININT VILLA CLARA",
    direccion: "CARRET CTRAL #000 SANTA CLARA, VILLA CLARA",
    numeroCliente: String(7162327 + lote),
    numeroCuenta: String(2708710 + lote),
    noFactura,
    fechaEmision: mes.emision,
    fechaVencimiento: mes.vence,
    periodoConsumo: `${mes.desde} \u2013 ${mes.hasta}`,
    codigoPago: `0643641266${String(820010 + numeroFactura + lote).slice(0, 6)}`,
    moneda: "CUP",
    nit: "011001601946",
    noRegistro: `272.0.0${9464 + numeroFactura + lote}`,
    zonaPostal: "50200",
    folio: String(62809 + numeroFactura * 3 + lote).padStart(8, "0"),
    sucursal: "BANDEC",
    servicios,
    totales: {
      cuota: r2(t.cuota),
      consumo: r2(t.consumo),
      comision: r2(t.comision),
      impuesto: r2(t.impuesto),
      facturado,
      estadoCuenta: facturado,
      totalPagar: facturado,
      totalServicios,
      descuento,
    },
    cuentaBanco: "0524220007611414",
    direccionBanco: "17A NO.16405 e/ 164 y 174,Playa",
    oficinaComercial: "ETECSA-Area de Gobierno No.6",
    codigoReeup: "161.1.40095",
    servicio: String(52090317 + lote),
    firmaNombre: "TC Delvis Castillo Núñez",
    firmaCargo: "Jefe OICC Villa Clara",
    aPagarUsd: 4260.95,
    tasa: 24,
  };
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });
  fs.mkdirSync(path.join(DESTINO, "pdf"), { recursive: true });

  const { lineas, oficiales } = generarLineas(120);

  // ------------------------------------------------------------------
  // Consumo de los 3 meses: se guarda todo para el informe de estadisticas
  // ------------------------------------------------------------------
  const consumos = lineas.map((l) => ({
    linea: l,
    meses: MESES.map((_, i) => consumoDeLinea(l, MESES[i].clave, i)),
  }));

  // ------------------------------------------------------------------
  // Excel: lineas + oficiales
  // ------------------------------------------------------------------
  // xlsx en ESM no escribe ficheros directamente: se genera el buffer y se guarda.
  const guardarLibro = (libro: any, archivo: string) => {
    const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
    fs.writeFileSync(archivo, buffer);
  };
  guardarLibro(escribirExcelLineas(lineas), path.join(DESTINO, "lineas-telefonicas.xlsx"));
  guardarLibro(escribirExcelOficiales(oficiales, lineas), path.join(DESTINO, "oficiales.xlsx"));

  // ------------------------------------------------------------------
  // Facturas: 2 por mes (los telefonos se reparten en dos lotes)
  // ------------------------------------------------------------------
  let numeroFactura = 1;
  const generadas: Array<{ archivo: string; servicios: number; total: number; mes: string }> = [];

  for (let i = 0; i < MESES.length; i += 1) {
    const mes = MESES[i];
    const carpeta = path.join(DESTINO, "por-mes", mes.clave);
    fs.mkdirSync(carpeta, { recursive: true });

    for (let lote = 1; lote <= FACTURAS_POR_MES; lote += 1) {
      // Reparto: la mitad de las lineas en cada factura del mes, alternando.
      const servicios: ServicioFactura[] = consumos
        .filter((_, idx) => (idx % FACTURAS_POR_MES) + 1 === lote)
        .map((c) => {
          const m = c.meses[i];
          return {
            numero: c.linea.numero,
            cuota: m.cuota,
            consumo: m.consumo,
            comision: m.comision,
            impuesto: m.impuesto,
            importe: m.importe,
          };
        });

      const datos = facturaDe(i, numeroFactura, lote, servicios);
      const archivo = path.join(carpeta, `factura-${mes.clave}-parte-${lote}-de-${FACTURAS_POR_MES}.pdf`);
      await guardarFactura(datos, archivo);
      generadas.push({ archivo: path.relative(DESTINO, archivo), servicios: servicios.length, total: datos.totales.totalPagar, mes: mes.clave });
      numeroFactura += 1;
    }
  }

  // ------------------------------------------------------------------
  // Facturas de distintos tamanos: para probar el parser con 1 pagina y con
  // muchas. Se reutiliza el consumo de septiembre.
  // ------------------------------------------------------------------
  const tamanos = [1, 2, 4, 12, 40, 120];
  for (const tam of tamanos) {
    const etiqueta = tam <= 4 ? "corta" : "larga";
    const servicios: ServicioFactura[] = consumos.slice(0, tam).map((c) => {
      const m = c.meses[1];
      return { numero: c.linea.numero, cuota: m.cuota, consumo: m.consumo, comision: m.comision, impuesto: m.impuesto, importe: m.importe };
    });
    const datos = facturaDe(1, numeroFactura, 1, servicios);
    datos.cliente = `UNIDAD DE PRUEBA ${tam} SERVICIOS`;
    datos.cuenta = datos.cliente;
    const archivo = path.join(DESTINO, "pdf", `factura-${etiqueta}-${String(tam).padStart(3, "0")}-servicios.pdf`);
    await guardarFactura(datos, archivo);
    generadas.push({ archivo: path.relative(DESTINO, archivo), servicios: servicios.length, total: datos.totales.totalPagar, mes: "2026-09" });
    numeroFactura += 1;
  }

  // ------------------------------------------------------------------
  // Estadisticas: ceros, medias y comparativa de los 3 meses
  // ------------------------------------------------------------------
  const resumenMeses = MESES.map((mes, i) => {
    const valores = consumos.map((c) => c.meses[i]);
    const importes = valores.map((v) => v.importe);
    const ceros = valores.filter((v) => v.cero).length;
    const sinVoz = valores.filter((v) => v.consumo === 0).length;
    const suma = importes.reduce((a, b) => a + b, 0);
    return {
      periodo: mes.clave,
      mes: mes.nombre,
      dias: mes.dias,
      lineas: valores.length,
      lineasSinConsumo: ceros,
      porcentajeSinConsumo: Math.round((ceros / valores.length) * 10000) / 100,
      lineasSinConsumoVoz: sinVoz,
      importeTotal: Math.round(suma * 100) / 100,
      importeMedio: Math.round((suma / valores.length) * 100) / 100,
      importeMaximo: Math.round(Math.max(...importes) * 100) / 100,
      consumoTotal: Math.round(valores.reduce((a, v) => a + v.consumo, 0) * 100) / 100,
    };
  });

  // Evolucion por linea (para la vista de 3 meses) y por oficial.
  const porLinea = consumos.map((c) => ({
    numero: c.linea.numero,
    oficial: c.linea.oficial,
    unidad: c.linea.unidad,
    importes: c.meses.map((m) => m.importe),
    ceros: c.meses.filter((m) => m.cero).length,
    importeTotal: Math.round(c.meses.reduce((a, m) => a + m.importe, 0) * 100) / 100,
  }));

  const porOficial = oficiales.map((o) => {
    const propias = consumos.filter((c) => c.linea.oficial === o.nombre);
    const porMes = MESES.map((_, i) => Math.round(propias.reduce((a, c) => a + c.meses[i].importe, 0) * 100) / 100);
    return {
      oficial: o.nombre,
      grado: o.grado,
      unidad: o.unidad,
      lineas: propias.length,
      importes: porMes,
      importeTotal: Math.round(porMes.reduce((a, b) => a + b, 0) * 100) / 100,
    };
  }).sort((a, b) => b.importeTotal - a.importeTotal);

  const estadisticas = {
    generado: new Date().toISOString(),
    aviso: "Datos INVENTADOS solo para pruebas. No corresponden a personas ni a consumos reales.",
    meses: resumenMeses,
    totalesPeriodo: {
      lineasDistintas: lineas.length,
      oficiales: oficiales.length,
      facturasPorMes: FACTURAS_POR_MES,
      importe3Meses: Math.round(porLinea.reduce((a, l) => a + l.importeTotal, 0) * 100) / 100,
      lineasConCeroAlgunMes: porLinea.filter((l) => l.ceros > 0).length,
      lineasConCeroLos3Meses: porLinea.filter((l) => l.ceros === 3).length,
    },
    porOficial,
    porLinea,
    facturasGeneradas: generadas,
  };

  fs.writeFileSync(path.join(DESTINO, "estadisticas.json"), JSON.stringify(estadisticas, null, 2), "utf8");

  // CSV de los 3 meses por linea, para abrirlo en Excel.
  const cabecera = ["numero", "oficial", "unidad", ...MESES.map((m) => `importe_${m.clave}`), "ceros", "total"];
  const filasCsv = porLinea.map((l) =>
    [l.numero, `"${l.oficial}"`, `"${l.unidad}"`, ...l.importes.map((i) => fmt(i)), l.ceros, fmt(l.importeTotal)].join(","),
  );
  fs.writeFileSync(path.join(DESTINO, "consumo-3-meses.csv"), [cabecera.join(","), ...filasCsv].join("\n"), "utf8");

  // ------------------------------------------------------------------
  // Resumen por consola
  // ------------------------------------------------------------------
  console.log(`Carpeta: ${DESTINO}`);
  console.log(`Excel: lineas-telefonicas.xlsx (${lineas.length} lineas), oficiales.xlsx (${oficiales.length} oficiales)`);
  console.log(`Facturas: ${generadas.length}`);
  for (const mes of resumenMeses) {
    console.log(
      `  ${mes.periodo}  importe ${fmt(mes.importeTotal).padStart(12)}  media ${fmt(mes.importeMedio).padStart(9)}  sin consumo ${mes.lineasSinConsumo}/${mes.lineas} (${mes.porcentajeSinConsumo}%)`,
    );
  }
  console.log(`  Tamano de las facturas de prueba: ${tamanos.join(", ")} servicios`);
}

main().catch((error) => {
  console.error("Error generando los datos de prueba:", error);
  process.exit(1);
});
