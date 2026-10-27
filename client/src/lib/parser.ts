import type { ServiceRow } from "../types/api.ts";

const uid = () => { try { return crypto.randomUUID!(); } catch { return `id_${Date.now()}_${Math.random().toString(16).slice(2,10)}`; } };

function pickFirst(text: string, patterns: RegExp[]): string {
  for (const p of patterns) { const m = text.match(p); if (m?.[1]) return m[1].trim(); } return "";
}

function normalize(text: string): string { return text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

export function parseFields(text: string) {
  const n = normalize(text);
  const cliente = pickFirst(n, [/cliente:\s*([^\n]+?)(?:\s+cuenta:|\s+numero\s+de\s+cliente:)/i]) || "";
  const cuenta = pickFirst(n, [/cuenta:\s*([^\n]+?)(?:\s+numero\s+de\s+cliente:)/i]) || cliente;
  const nc = pickFirst(n, [/numero\s*de\s*cliente\s*[:#-]?\s*(\d{5,})/i, /no\.?\s*cliente\s*[:#-]?\s*(\d{5,})/i]);
  const ncu = pickFirst(n, [/numero\s*de\s*cuenta\s*[:#-]?\s*(\d{5,})/i, /no\.?\s*cuenta\s*[:#-]?\s*(\d{5,})/i]);
  const nf = pickFirst(n, [/no\.?\s*factura:\s*(\d{6,})/i]);
  const fe = pickFirst(n, [/fecha\s*factura:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i]);
  const fv = pickFirst(n, [/fech\s*a\s*de\s*vencimiento:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i]);
  const pr = n.match(/periodo\s*de\s*consumo:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const pc = pr ? `${pr[1]} - ${pr[2]}` : "";
  const cp = (pickFirst(n, [/codigo\s*de\s*pago\s*en\s*banco\s*[:#-]?\s*([\d\s-]{6,})/i, /codigo\s*de\s*pago\s*[:#-]?\s*([\d\s-]{6,})/i]) || "").replace(/\D/g,"");
  const mo = pickFirst(n, [/moneda:\s*(CUP|USD)/i]) || "CUP";
  const ni = pickFirst(n, [/nit:\s*(\d{8,})/i]);
  let tp = 0;
  const tm = n.match(/cuota\s+consumo\s+comision\s+impuesto\s+facturado\s+estado\s+total\s+[-–]+\s+[\d,.]+(?:[\s\n]+[\d,.]+){3,}/i);
  if (tm) { const nums = tm[0].match(/[\d,.]+/g)?.map(s => Number(s.replace(/,/g,""))) || []; tp = nums[nums.length-1] || 0; }
  return { cliente, cuenta: cuenta||cliente, numeroCliente: nc, numeroCuenta: ncu, noFactura: nf, fechaEmision: fe, fechaVencimiento: fv, periodoConsumo: pc, codigoPago: cp, moneda: mo, nit: ni, totalPagar: tp };
}

export function parseServices(text: string): ServiceRow[] {
  const lines = text.replace(/\s+/g," ").trim().split(/\n/);
  const sv: string[] = []; let on = false;
  for (const l of lines) {
    if (/servicio/i.test(l) && /cuota/i.test(l)) { on = true; continue; }
    if (!on) continue;
    if (/^\s*$/.test(l)) break;
    if (/^\s*(total|resumen|subtotal)/i.test(l)) break;
    sv.push(l);
  }
  return sv.map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) return null;
    const nums = parts.map(p => p.replace(/,/g,"")).filter(p => /^\d+(\.\d+)?$/.test(p)).map(Number);
    if (nums.length < 5) return null;
    return { id: uid(), factura_id: "", numero_servicio: parts[0], cuota: nums[nums.length-5]||0, consumo: nums[nums.length-4]||0, comision: nums[nums.length-3]||0, impuesto: nums[nums.length-2]||0, importe: nums[nums.length-1]||0 } as ServiceRow;
  }).filter(Boolean) as ServiceRow[];
}

export function getServerPayload(fields: ReturnType<typeof parseFields>, services: ServiceRow[], file: string, text: string) {
  return {
    ...fields, cuota: 0, consumo: 0, comision: 0, impuesto: 0, total: fields.totalPagar,
    estado: services.length > 0 ? "procesado" : "pendiente" as const,
    parser: "pdfjs-dist", ocrConfidence: 85, ocrDuration: 0, archivo: file, textoOcr: text,
    servicios: services.map(s => ({ numeroServicio: s.numero_servicio, cuota: s.cuota, consumo: s.consumo, comision: s.comision, impuesto: s.impuesto, importe: s.importe })),
  };
}
