import fs from "node:fs";
import path from "node:path";

type Servicio = {
  numero: string;
  cuota: number;
  consumo: number;
  comision: number;
  impuesto: number;
  importe: number;
};

type FacturaFixture = {
  cliente: string;
  cuenta: string;
  numeroCliente: string;
  numeroCuenta: string;
  noFactura: string;
  fechaFactura: string;
  fechaVencimiento: string;
  periodoInicio: string;
  periodoFin: string;
  codigoPago: string;
  moneda: string;
  nit: string;
  servicios: Servicio[];
  descuentoComercial?: number;
};

const OUTPUT_DIR = path.resolve(process.cwd(), "test-fixtures", "facturas-sinteticas");

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function service(num: string, cuota: number, consumo: number, comision = 0, impuesto = 0): Servicio {
  return {
    numero: num,
    cuota,
    consumo,
    comision,
    impuesto,
    importe: Number((cuota + consumo + comision + impuesto).toFixed(2)),
  };
}

function totals(services: Servicio[], descuento = 0) {
  const cuota = services.reduce((s, x) => s + x.cuota, 0);
  const consumo = services.reduce((s, x) => s + x.consumo, 0);
  const comision = services.reduce((s, x) => s + x.comision, 0);
  const impuesto = services.reduce((s, x) => s + x.impuesto, 0);
  const facturado = cuota + consumo + comision + impuesto;
  const totalPagar = Math.max(0, facturado - descuento);
  return { cuota, consumo, comision, impuesto, facturado, totalPagar };
}

function buildColumnarText(data: FacturaFixture) {
  const desc = Number(data.descuentoComercial || 0);
  const t = totals(data.servicios, desc);

  const lines = [
    `Cliente:${data.cliente}`,
    `Cuenta:${data.cuenta}`,
    `Numero de Cliente:${data.numeroCliente} Numero de Cuenta: ${data.numeroCuenta}`,
    `No. factura: ${data.noFactura}`,
    `Fecha de Vencimiento: ${data.fechaVencimiento}`,
    `Periodo de consumo: ${data.periodoInicio} – ${data.periodoFin}`,
    `Codigo de Pago en Banco: ${data.codigoPago}`,
    `Moneda: ${data.moneda}`,
    `Fecha Factura: ${data.fechaFactura}`,
    `NIT: ${data.nit}`,
    `Cuota Consumo Comision Impuesto Facturado Estado Total`,
    `Mensual de Cuenta a Pagar`,
    `${fmt(t.cuota)} ${fmt(t.consumo)} ${fmt(desc || t.comision)} ${fmt(t.impuesto)} ${fmt(t.facturado)} 0.00 ${fmt(t.totalPagar)}`,
    `Resumen por Servicios`,
    `Servicio`,
    ...data.servicios.map((s) => s.numero),
    `Cuota`,
    ...data.servicios.map((s) => fmt(s.cuota)),
    `Consumo`,
    ...data.servicios.map((s) => fmt(s.consumo)),
    `Comision`,
    ...data.servicios.map((s) => fmt(s.comision)),
    `Impuesto`,
    ...data.servicios.map((s) => fmt(s.impuesto)),
    `Importe`,
    ...data.servicios.map((s) => fmt(s.importe)),
    `Total ${fmt(t.cuota)} ${fmt(t.consumo)} ${fmt(t.comision)} ${fmt(t.impuesto)} ${fmt(data.servicios.reduce((s, x) => s + x.importe, 0))}`,
    `Comisiones Importe`,
    `Descuento Comercial (15) ${fmt(desc)}`,
    `Total a la cuenta -${fmt(desc)}`,
  ];

  return lines.join("\n") + "\n";
}

function buildRowText(data: FacturaFixture) {
  const desc = Number(data.descuentoComercial || 0);
  const t = totals(data.servicios, desc);

  const lines = [
    `Cliente: ${data.cliente}`,
    `Cuenta: ${data.cuenta}`,
    `Numero de Cliente: ${data.numeroCliente}`,
    `Numero de Cuenta: ${data.numeroCuenta}`,
    `No. factura: ${data.noFactura}`,
    `Fecha Factura: ${data.fechaFactura}`,
    `Fecha de Vencimiento: ${data.fechaVencimiento}`,
    `Periodo de consumo: ${data.periodoInicio} - ${data.periodoFin}`,
    `Codigo de Pago en Banco: ${data.codigoPago}`,
    `Moneda: ${data.moneda}`,
    `NIT: ${data.nit}`,
    `Cuota Consumo Comision Impuesto Facturado Estado Total`,
    `Mensual de Cuenta a Pagar`,
    `${fmt(t.cuota)} ${fmt(t.consumo)} ${fmt(desc || t.comision)} ${fmt(t.impuesto)} ${fmt(t.facturado)} 0.00 ${fmt(t.totalPagar)}`,
    `Resumen por Servicios`,
    `Servicio Cuota Consumo Comision Impuesto Importe`,
    ...data.servicios.map((s) => `${s.numero} ${fmt(s.cuota)} ${fmt(s.consumo)} ${fmt(s.comision)} ${fmt(s.impuesto)} ${fmt(s.importe)}`),
    `Total ${fmt(t.cuota)} ${fmt(t.consumo)} ${fmt(t.comision)} ${fmt(t.impuesto)} ${fmt(data.servicios.reduce((s, x) => s + x.importe, 0))}`,
    `Comisiones Importe`,
    `Descuento Comercial (15) ${fmt(desc)}`,
    `Total a la cuenta -${fmt(desc)}`,
  ];

  return lines.join("\n") + "\n";
}

function mutateNoise(text: string) {
  return text
    .replace(/Numero/g, "Número")
    .replace(/Codigo/g, "Código")
    .replace(/Fecha de Vencimiento/g, "Fech a de Vencimiento")
    .replace(/Moneda:/g, "Moneda: ")
    .replace(/Cuenta:/g, "Cuenta:")
    .replace(/Periodo de consumo/g, "Periodo de consumo")
    .replace(/\n/g, "  \n");
}

function writeFixture(name: string, content: string) {
  const file = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function makeManyServices(prefix: string, count: number) {
  const services: Servicio[] = [];
  for (let i = 0; i < count; i += 1) {
    const num = `${prefix}${String(100000 + i).slice(-6)}`;
    const cuota = i < 4 ? 0 : i < 10 ? 245 : 315;
    const consumo = i % 5 === 0 ? 0 : Number((80 + i * 23.17).toFixed(2));
    services.push(service(num, cuota, consumo));
  }
  return services;
}

function buildIncompleteText(data: FacturaFixture) {
  const text = buildColumnarText(data)
    .replace(/Numero de Cuenta: \d+/i, "")
    .replace(/Codigo de Pago en Banco: \d+/i, "")
    .replace(/NIT: \d+/i, "")
    .replace(/Fecha de Vencimiento: \d{2}\/\d{2}\/\d{2}/i, "");
  return text;
}

function buildDamagedText(data: FacturaFixture) {
  return [
    `Cliente:${data.cliente}`,
    `No. factura: ${data.noFactura}`,
    `Moneda: ${data.moneda}`,
    `Resumen por Servicios`,
    `Servicio`,
    ...data.servicios.slice(0, 4).map((s) => s.numero),
    `Cuota`,
    `245.00`,
    `315.00`,
    `Consumo`,
    `179.56`,
    `668.43`,
    `Importe`,
    `424.56`,
    `983.43`,
    `Documento dañado`,
  ].join("\n") + "\n";
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const base: FacturaFixture = {
    cliente: "DELEGACION TERRITORIAL DEL MININT VILLA CLARA",
    cuenta: "DELEGACION TERRITORIAL DEL MININT VILLA CLARA",
    numeroCliente: "7162327",
    numeroCuenta: "2708712",
    noFactura: "310811313858",
    fechaFactura: "04/01/24",
    fechaVencimiento: "31/01/24",
    periodoInicio: "01/12/23",
    periodoFin: "31/12/23",
    codigoPago: "0643641227459010",
    moneda: "CUP",
    nit: "011001601946",
    descuentoComercial: 514.86,
    servicios: [
      service("52587423", 0, 0),
      service("52214752", 0, 0),
      service("52325147", 0, 668.43),
      service("52962001", 0, 179.56),
      service("59101047", 245, 0),
      service("59786523", 245, 0),
      service("59201485", 245, 0),
      service("59145639", 245, 0),
      service("59002255", 315, 234.27),
      service("59874152", 315, 327.5),
      service("59485614", 315, 97.6),
    ],
  };

  const fixtures: Array<{ name: string; content: string }> = [
    { name: "01-base-columnar.txt", content: buildColumnarText(base) },
    {
      name: "02-25-servicios-columnar.txt",
      content: buildColumnarText({
        ...base,
        noFactura: "410811313859",
        numeroCliente: "8162327",
        numeroCuenta: "3708712",
        codigoPago: "1643641227459011",
        servicios: makeManyServices("52", 25),
        descuentoComercial: 620.45,
      }),
    },
    {
      name: "03-40-servicios-columnar.txt",
      content: buildColumnarText({
        ...base,
        cliente: "EMPRESA DE TELECOMUNICACIONES DE PRUEBA OCCIDENTE",
        cuenta: "EMPRESA DE TELECOMUNICACIONES DE PRUEBA OCCIDENTE",
        noFactura: "510811313860",
        numeroCliente: "9162327",
        numeroCuenta: "4708712",
        codigoPago: "2643641227459012",
        servicios: makeManyServices("59", 40),
        descuentoComercial: 980.2,
      }),
    },
    {
      name: "04-base-row-format.txt",
      content: buildRowText({
        ...base,
        noFactura: "610811313861",
        numeroCliente: "7169999",
        numeroCuenta: "2708123",
        codigoPago: "3643641227459013",
      }),
    },
    {
      name: "05-noisy-ocr.txt",
      content: mutateNoise(
        buildColumnarText({
          ...base,
          noFactura: "710811313862",
          numeroCliente: "7262327",
          numeroCuenta: "2808712",
          codigoPago: "4643641227459014",
        }),
      ),
    },
    {
      name: "06-missing-fields.txt",
      content: buildIncompleteText({
        ...base,
        noFactura: "810811313863",
        numeroCliente: "7362327",
        numeroCuenta: "2908712",
        codigoPago: "5643641227459015",
      }),
    },
    {
      name: "07-damaged-layout.txt",
      content: buildDamagedText({
        ...base,
        noFactura: "910811313864",
      }),
    },
  ];

  const manifest = fixtures.map((item) => ({ file: writeFixture(item.name, item.content), size: item.content.split(/\n/).length }));
  fs.writeFileSync(path.join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Fixtures generados en ${OUTPUT_DIR}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
