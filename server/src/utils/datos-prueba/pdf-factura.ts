/**
 * pdf-factura.ts - Dibuja una factura de telefonia con la MISMA estructura que
 * la factura de ETECSA (cabecera, desglose, resumen por servicios en columnas,
 * comisiones, datos de pago y firma), pero con datos INVENTADOS.
 *
 * Se usa para generar ficheros de prueba de distinto tamano (de 1 a 120
 * servicios) y comprobar que el importador los lee bien.
 *
 * Clave del formato: el resumen por servicios va en COLUMNAS (una columna por
 * campo: Servicio, Cuota, Consumo, Comision, Impuesto, Importe), no en filas.
 * El parser del servidor detecta ese modo y lo comprueba con el modo filas.
 */

import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface ServicioFactura {
  numero: string;
  cuota: number;
  consumo: number;
  comision: number;
  impuesto: number;
  importe: number;
}

export interface DatosFactura {
  cliente: string;
  cuenta: string;
  direccion: string;
  numeroCliente: string;
  numeroCuenta: string;
  noFactura: string;
  fechaEmision: string; // dd/mm/aa
  fechaVencimiento: string; // dd/mm/aa
  periodoConsumo: string; // "01/09/26 – 30/09/26"
  codigoPago: string;
  moneda: string;
  nit: string;
  noRegistro: string;
  zonaPostal: string;
  folio: string;
  sucursal: string;
  servicios: ServicioFactura[];
  totales: {
    cuota: number;
    consumo: number;
    comision: number;
    impuesto: number;
    facturado: number;
    estadoCuenta: number;
    totalPagar: number;
    totalServicios: number;
    descuento: number;
  };
  cuentaBanco: string;
  direccionBanco: string;
  oficinaComercial: string;
  codigoReeup: string;
  servicio: string;
  firmaNombre: string;
  firmaCargo: string;
  aPagarUsd?: number;
  tasa?: number;
}

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 40;
const FILAS_POR_PAGINA = 46;

export function fmt(v: number): string {
  return Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Dibuja la factura completa. Devuelve los bytes del PDF.
 * `filasPorPagina` permite forzar facturas muy cortas (1 pagina) o muy largas.
 */
export async function dibujarFactura(datos: DatosFactura): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Factura de prueba ${datos.noFactura}`);
  pdf.setAuthor("Datos inventados - SGF");
  pdf.setSubject("Factura de telefonia de prueba (datos ficticios)");
  pdf.setCreator("SGF generador de datos de prueba");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  let pagina = pdf.addPage([A4.ancho, A4.alto]);
  let y = A4.alto - MARGEN;

  const texto = (t: string, x: number, yy: number, tam = 8, fuente = normal, color = rgb(0.1, 0.1, 0.1)) => {
    pagina.drawText(t, { x: MARGEN + x, y: yy, size: tam, font: fuente, color });
  };
  const linea = (x1: number, y1: number, x2: number, y2: number, grosor = 0.5) => {
    pagina.drawLine({
      start: { x: MARGEN + x1, y: y1 },
      end: { x: MARGEN + x2, y: y2 },
      thickness: grosor,
      color: rgb(0.55, 0.55, 0.55),
    });
  };
  const saltoPagina = () => {
    pagina = pdf.addPage([A4.ancho, A4.alto]);
    y = A4.alto - MARGEN;
    return y;
  };

  const ANCHO_COLUMNA = A4.ancho - MARGEN * 2;

  // ------------------------------------------------------------------
  // Cabecera: los mismos campos y en el mismo orden que la factura real,
  // para que el importador los encuentre por etiqueta.
  // ------------------------------------------------------------------
  const dibujarCabecera = () => {
    texto(`Zona Postal: ${datos.zonaPostal}`, 0, y);
    y -= 11;
    texto(`Folio: ${datos.folio}`, 0, y);
    y -= 11;
    texto(`Código de Pago en Banco: ${datos.codigoPago}`, 0, y);
    y -= 11;
    texto(`Número de Cliente:${datos.numeroCliente}`, 0, y);
    y -= 11;
    texto(`Fecha de Vencimiento: ${datos.fechaVencimiento}`, 0, y);
    y -= 11;
    texto(`Periodo de consumo: ${datos.periodoConsumo}`, 0, y);
    y -= 11;
    texto(`Moneda: ${datos.moneda}`, 0, y);
    y -= 14;

    // Cuadro de importes: una linea con 7 importes seguidos, que es lo que
    // lee el parser (cuota, consumo, comision, impuesto, facturado, estado, total).
    const t = datos.totales;
    texto(
      `${fmt(t.cuota)} ${fmt(t.consumo)} ${fmt(t.comision)} ${fmt(t.impuesto)} ${fmt(t.facturado)} ${fmt(t.estadoCuenta)} ${fmt(t.totalPagar)}`,
      0,
      y,
      8,
      normal,
    );
    y -= 10;
    texto("Cuota     Consumo    Comisión   Impuesto   Facturado    Estado    Total a Pagar", 0, y, 6.5, normal, rgb(0.45, 0.45, 0.45));
    y -= 14;

    texto(datos.direccion, 0, y, 7.5);
    y -= 11;
    texto(
      `A Pagar:${fmt(datos.aPagarUsd ?? 4260.95)}Tasa:${fmt(datos.tasa ?? 24)}Moneda:USD`,
      0,
      y,
      7.5,
    );
    y -= 11;
    texto(`Número de Cuenta: ${datos.numeroCuenta}`, 0, y, 7.5);
    y -= 11;
    texto(`Cliente:${datos.cliente}`, 0, y, 7.5);
    y -= 11;
    texto(`Cuenta:${datos.cuenta}`, 0, y, 7.5);
    y -= 11;
    texto(`No. factura: ${datos.noFactura}`, 0, y, 7.5);
    y -= 11;
    texto(`Sucursal Bancaria: ${datos.sucursal}`, 0, y, 7.5);
    y -= 11;
    texto(`NIT: ${datos.nit}`, 0, y, 7.5);
    y -= 11;
    texto(`Fecha Factura: ${datos.fechaEmision}`, 0, y, 7.5);
    y -= 11;
    texto(`No. Registro: ${datos.noRegistro}`, 0, y, 7.5);
    y -= 13;

    // Desglose de consumo general (informativo)
    const sumaConsumo = datos.servicios.reduce((a, s) => a + s.consumo, 0);
    const sms = Math.round(sumaConsumo * 0.0001 * 100) / 100;
    texto("Desglose (Consumo)", 0, y, 8, negrita);
    y -= 11;
    texto(`Consumo Voz ${fmt(sumaConsumo - sms)}`, 0, y, 7.5);
    y -= 11;
    texto(`Consumo SMS ${fmt(sms)}`, 0, y, 7.5);
    y -= 11;
    texto("Cargos Misceláneos 0.00", 0, y, 7.5);
    y -= 13;
    texto("Desglose de Factura Importe", 0, y, 8, negrita);
    y -= 11;
    texto("Desglose (Comisión)", 0, y, 8, negrita);
    y -= 11;
    texto(`Descuento Comercial (15) ${fmt(datos.totales.descuento)}`, 0, y, 7.5);
    y -= 16;

    texto("Resumen por Servicios", 0, y, 9, negrita);
    y -= 12;
  };

  dibujarCabecera();

  // ------------------------------------------------------------------
  // Resumen por servicios: una LINEA por servicio, en columnas alineadas con
  // fuente monoespaciada. Importante: cada fila se dibuja con una sola llamada,
  // asi el texto extraido del PDF devuelve "numero cuota consumo comision
  // impuesto importe" en la misma linea y el importador la reconoce.
  // ------------------------------------------------------------------
  const ANCHO_SERVICIO = 12;
  const ANCHO_IMPORTE = 13;
  const formatoFila = (numero: string, valores: number[]) =>
    numero.padEnd(ANCHO_SERVICIO) + valores.map((v) => fmt(v).padStart(ANCHO_IMPORTE)).join(" ");

  const dibujarCabeceraColumnas = () => {
    texto(
      "Servicio".padEnd(ANCHO_SERVICIO) +
        ["Cuota", "Consumo", "Comisión", "Impuesto", "Importe"].map((t) => t.padStart(ANCHO_IMPORTE)).join(" "),
      0,
      y,
      7.5,
      negrita,
    );
    y -= 4;
    linea(0, y, ANCHO_COLUMNA, y, 0.7);
    y -= 12;
  };

  const dibujarPieDeColumnas = () => {
    linea(0, y + 4, ANCHO_COLUMNA, y + 4, 0.7);
    const t = datos.totales;
    texto(
      "Total" + formatoFila("", [t.cuota, t.consumo, t.comision, t.impuesto, t.totalServicios]),
      0,
      y - 9,
      8,
      negrita,
    );
    y -= 22;
  };

  dibujarCabeceraColumnas();

  for (const s of datos.servicios) {
    if (y < MARGEN + 120) {
      dibujarPieDeColumnas();
      saltoPagina();
      dibujarCabeceraColumnas();
    }
    texto(formatoFila(s.numero, [s.cuota, s.consumo, s.comision, s.impuesto, s.importe]), 0, y, 7.5, mono);
    y -= 10;
  }

  dibujarPieDeColumnas();

  // ------------------------------------------------------------------
  // Cierre: comisiones, datos de pago y firma (como en la factura real).
  // ------------------------------------------------------------------
  if (y < MARGEN + 190) saltoPagina();

  texto("Comisiones a la cuenta Importe", 0, y, 8, negrita);
  y -= 11;
  texto(`Descuento Comercial (15) ${fmt(datos.totales.descuento)}`, 0, y, 7.5);
  y -= 11;
  texto(`Total a la cuenta -${fmt(datos.totales.descuento)}`, 0, y, 7.5);
  y -= 15;

  texto("Pagar a:", 0, y, 8, negrita);
  y -= 11;
  texto(`Cuenta: ${datos.cuentaBanco}`, 0, y, 7.5);
  y -= 11;
  texto(`Dirección:${datos.direccionBanco}`, 0, y, 7.5);
  y -= 11;
  texto(datos.oficinaComercial, 0, y, 7.5);
  y -= 11;
  texto(`Código REEUP:${datos.codigoReeup} NIT: ${datos.nit}`, 0, y, 7.5);
  y -= 11;
  texto(`No. factura: ${datos.noFactura}`, 0, y, 7.5);
  y -= 11;
  texto(`Numero de cliente: ${datos.numeroCliente}`, 0, y, 7.5);
  y -= 11;
  texto(`Fecha de Vencimiento: ${datos.fechaVencimiento}`, 0, y, 7.5);
  y -= 11;
  texto(`Servicio: ${datos.servicio}`, 0, y, 7.5);
  y -= 11;
  texto(`Moneda: ${datos.moneda}`, 0, y, 7.5);
  y -= 16;

  texto("Certifico que los datos de la factura se corresponden", 0, y, 7.5);
  y -= 10;
  texto("con los gastos.", 0, y, 7.5);
  y -= 16;
  texto(`     ${datos.firmaNombre}`, 0, y, 7.5);
  y -= 10;
  texto(`     ${datos.firmaCargo}`, 0, y, 7.5);

  return pdf.save();
}

export async function guardarFactura(datos: DatosFactura, destino: string) {
  const bytes = await dibujarFactura(datos);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, bytes);
  return { ruta: destino, bytes: bytes.length };
}

export { FILAS_POR_PAGINA };
