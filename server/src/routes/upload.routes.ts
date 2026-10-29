import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  execute,
  flushDisk,
  isOracleLegacyTablesAvailable,
  nowExpr,
  query,
  transaction,
} from "../models/database.js";
import { sendJson } from "../middleware/auth.js";
import { auditLog } from "../middleware/logger.js";
import {
  calcularParteDelPeriodo,
  clavePeriodo,
  facturasPorMesConfiguradas,
} from "../utils/facturas-periodo.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import {
  normalizarNumero,
  packStoredFacturaText,
  unpackStoredFacturaText,
  parseFacturaEtcsa,
  type FacturaExtraida,
} from "../utils/factura-parser.js";
import { enriquecerLineasFactura } from "../utils/enriquecimiento.js";

import { extraerTextoPdf } from "../utils/pdf-text.js";

/**
 * Normaliza el periodo de consumo para poder compararlo entre facturas:
 * "SEPTIEMBRE 2025", "Septiembre/2025" y "09/2025" deben considerarse iguales.
 * Si no se reconoce el formato se devuelve el texto en mayusculas y sin espacios
 * sobrantes, que sigue sirviendo para comparar "igual con igual".
 */
export function normalizarPeriodo(periodo: string | null | undefined): string {
  const texto = String(periodo ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!texto) return "";

  const meses: Record<string, string> = {
    ENERO: "01", FEBRERO: "02", MARZO: "03", ABRIL: "04", MAYO: "05", JUNIO: "06",
    JULIO: "07", AGOSTO: "08", SEPTIEMBRE: "09", SETIEMBRE: "09", OCTUBRE: "10",
    NOVIEMBRE: "11", DICIEMBRE: "12",
    ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
    JUL: "07", AGO: "08", SEP: "09", SEPT: "09", OCT: "10", NOV: "11", DIC: "12",
  };

  // "SEPTIEMBRE 2026", "SEP-2026", "SEPTIEMBRE DEL 2026"
  const conNombre = texto.match(/([A-ZÁÉÍÓÚ]{3,})[\s\/-]*(?:DEL\s+)?(\d{4})/);
  if (conNombre && meses[conNombre[1]]) return `${conNombre[2]}-${meses[conNombre[1]]}`;

  // Un rango de fechas cuenta por su primer día: "2026-09-01 - 2026-09-30" y
  // "01/09/2026 - 30/09/2026" son el mismo periodo (septiembre de 2026).
  const rango = texto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (rango) return `${rango[1]}-${rango[2]}`;
  const rangoLatino = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (rangoLatino) return `${rangoLatino[3]}-${rangoLatino[2].padStart(2, "0")}`;

  // "09/2026" y "2026/09"
  const numerico = texto.match(/^(\d{1,2})[\s\/-](\d{4})$/);
  if (numerico) return `${numerico[2]}-${numerico[1].padStart(2, "0")}`;
  const inverso = texto.match(/^(\d{4})[\s\/-](\d{1,2})$/);
  if (inverso) return `${inverso[1]}-${inverso[2].padStart(2, "0")}`;

  // Sin formato reconocible: se compara igual con igual.
  return texto;
}

async function detectarDuplicadosFactura(factura: FacturaExtraida, usuarioActual = "") {
  const sameInvoice: Array<Record<string, any>> = [];
  const repeatedServices: Array<Record<string, any>> = [];

  if (factura.noFactura) {
    const rows = await query<any>(
      `SELECT ID, NO_FACTURA, CLIENTE, PERIODO_CONSUMO, CREATED_AT, USER_ID
       FROM SGF_FACTURAS
       WHERE NO_FACTURA = :nf
       ORDER BY CREATED_AT DESC`,
      { nf: factura.noFactura },
    );
    sameInvoice.push(...rows.map((row) => ({
      id: String(row?.ID ?? row?.id ?? ""),
      no_factura: String(row?.NO_FACTURA ?? row?.no_factura ?? ""),
      cliente: String(row?.CLIENTE ?? row?.cliente ?? ""),
      periodo_consumo: String(row?.PERIODO_CONSUMO ?? row?.periodo_consumo ?? ""),
      created_at: String(row?.CREATED_AT ?? row?.created_at ?? ""),
      user_id: String(row?.USER_ID ?? row?.user_id ?? ""),
    })));
  }

  const serviceNumbers = Array.from(new Set((factura.servicios || []).map((item) => item.numero).filter(Boolean)));
  const periodoNuevo = normalizarPeriodo(factura.periodoConsumo);
  // Repetido "en el mismo periodo" = la misma linea facturada dos veces ese mes
  // (eso si es un problema). La misma linea en OTRO mes es lo normal.
  const repeatedSamePeriod: Array<Record<string, any>> = [];
  const repeatedOtherPeriod: Array<Record<string, any>> = [];

  for (let inicio = 0; inicio < serviceNumbers.length; inicio += 200) {
    const grupo = serviceNumbers.slice(inicio, inicio + 200);
    const placeholders = grupo.map((_, index) => `:s${index}`).join(", ");
    const params: Record<string, any> = { nf: factura.noFactura || "", uid: usuarioActual };
    grupo.forEach((numero, index) => { params[`s${index}`] = numero; });

    const rows = await query<any>(
      `SELECT
         s.NUMERO_SERVICIO,
         s.IMPORTE,
         f.ID AS FACTURA_ID,
         f.NO_FACTURA,
         f.CLIENTE,
         f.PERIODO_CONSUMO,
         f.CREATED_AT
       FROM SGF_SERVICIOS s
       JOIN SGF_FACTURAS f ON f.ID = s.FACTURA_ID
       WHERE s.NUMERO_SERVICIO IN (${placeholders})
         AND f.USER_ID = :uid
         AND (:nf = '' OR f.NO_FACTURA <> :nf)
       ORDER BY f.CREATED_AT DESC`,
      params,
    );

    for (const row of rows) {
      const datos = {
        factura_id: String(row?.FACTURA_ID ?? row?.factura_id ?? ""),
        no_factura: String(row?.NO_FACTURA ?? row?.no_factura ?? ""),
        cliente: String(row?.CLIENTE ?? row?.cliente ?? ""),
        periodo_consumo: String(row?.PERIODO_CONSUMO ?? row?.periodo_consumo ?? ""),
        numero_servicio: String(row?.NUMERO_SERVICIO ?? row?.numero_servicio ?? ""),
        importe: Number(row?.IMPORTE ?? row?.importe ?? 0),
        created_at: String(row?.CREATED_AT ?? row?.created_at ?? ""),
      };
      const mismoPeriodo = periodoNuevo !== "" && normalizarPeriodo(datos.periodo_consumo) === periodoNuevo;
      (mismoPeriodo ? repeatedSamePeriod : repeatedOtherPeriod).push(datos);
    }

    repeatedServices.push(...rows.map((row) => ({
      factura_id: String(row?.FACTURA_ID ?? row?.factura_id ?? ""),
      no_factura: String(row?.NO_FACTURA ?? row?.no_factura ?? ""),
      cliente: String(row?.CLIENTE ?? row?.cliente ?? ""),
      periodo_consumo: String(row?.PERIODO_CONSUMO ?? row?.periodo_consumo ?? ""),
      numero_servicio: String(row?.NUMERO_SERVICIO ?? row?.numero_servicio ?? ""),
      importe: Number(row?.IMPORTE ?? row?.importe ?? 0),
      created_at: String(row?.CREATED_AT ?? row?.created_at ?? ""),
      user_id: String(row?.USER_ID ?? row?.user_id ?? ""),
    })));
  }

  // Facturas con el mismo numero que pertenecen a OTRA persona: forzar la carga
  // no debe borrarlas (reemplazo cruzado), asi que se separan.
  const sameInvoiceOtrosUsuarios = sameInvoice.filter((f) => f.user_id && usuarioActual && f.user_id !== usuarioActual);

  return {
    sameInvoice,
    sameInvoiceOtrosUsuarios,
    repeatedServices,
    repeatedSamePeriod,
    repeatedOtherPeriod,
    /**
     * Solo se BLOQUEA (409) cuando el número de factura pertenece a otro usuario
     * (para que nadie reemplace facturas ajenas).
     *
     * Todo lo demás se acepta:
     *   - reenviar la misma factura la SUSTITUYE (era un error y se corrige);
     *   - varias facturas del mismo mes comparten líneas (primera y segunda
     *     quincena), así que repetir líneas es lo normal y solo se avisa.
     */
    hasDuplicates: sameInvoiceOtrosUsuarios.length > 0,
  };
}

export async function limpiarFacturaExistente(noFactura: string, userId: string) {
  if (!noFactura) return;
  // Sin usuario no se borra nada: la version anterior borraba las facturas de
  // TODOS los usuarios con ese numero cuando no habia usuario en la peticion.
  if (!userId) {
    console.warn("[SGF] No se reemplaza la factura anterior: la peticion no tiene usuario.");
    return;
  }

  // Solo se reemplazan las facturas del MISMO usuario: antes se borraban las
    // de cualquier usuario con el mismo numero de factura (reemplazo cruzado).
    const existentes = await query<any>(
      userId
        ? `SELECT ID, CLIENTE FROM SGF_FACTURAS WHERE NO_FACTURA = :nf AND USER_ID = :uid`
        : `SELECT ID, CLIENTE FROM SGF_FACTURAS WHERE NO_FACTURA = :nf`,
      { nf: noFactura, uid: userId },
    );
    for (const fila of existentes) {
      const facturaId = String(fila?.ID ?? fila?.id ?? "");
      if (!facturaId) continue;
      await execute(`DELETE FROM SGF_SERVICIOS WHERE FACTURA_ID = :id`, { id: facturaId });
      await execute(`DELETE FROM SGF_FACTURAS WHERE ID = :id`, { id: facturaId });
    }
    // Solo limpiamos PCELULAR.CARGARARCH si estamos en Oracle, donde
    // esa tabla existe. En SQL Server o SQLite no existe ese esquema
    // y cualquier intento de DELETE fallaria con error de tabla inexistente.
    if (existentes.length > 0 && isOracleLegacyTablesAvailable()) {
      for (const fila of existentes) {
        const cliente = String(fila?.CLIENTE ?? fila?.cliente ?? "");
        const similares = await query<any>(`SELECT COUNT(*) AS CNT FROM SGF_FACTURAS WHERE NO_FACTURA = :nf AND CLIENTE = :cliente`, {nf:noFactura, cliente});
        if (Number(similares[0]?.CNT ?? similares[0]?.cnt ?? 0) > 0) throw new Error("La referencia Oracle coincide con otra factura; no se ha sustituido.");
        const tira = `Factura ${noFactura} - ${cliente.slice(0, 40)}`;
        await execute(`DELETE FROM PCELULAR.CARGARARCH WHERE TIRA = :t`, {t:tira});
      }
    }
}

/**
 * Guarda la factura y sus servicios. Exportada para poder reutilizarla desde la
 * prueba de extremo a extremo (misma logica que el endpoint, sin HTTP).
 */
export async function guardarFacturaCompleta(
  req: { currentUser?: { id?: string } },
  factura: FacturaExtraida,
  textoOcr: string,
  filename: string,
) {
  const facturaId = randomUUID();
  const userId = req.currentUser?.id || "";
  const now = nowExpr();

  await execute(
    `INSERT INTO SGF_FACTURAS (
      ID, CLIENTE, CUENTA, NUMERO_CLIENTE, NUMERO_CUENTA, NO_FACTURA,
      FECHA_EMISION, FECHA_VENCIMIENTO, PERIODO_CONSUMO, CODIGO_PAGO,
      MONEDA, NIT, CUOTA, CONSUMO, COMISION, IMPUESTO, TOTAL, TOTAL_PAGAR,
      ESTADO, PARSER, OCR_CONFIDENCE, OCR_DURATION, ARCHIVO, TEXTO_OCR,
      PERIODO_CLAVE, PERIODO_PARTE, USER_ID, CREATED_AT, UPDATED_AT
    ) VALUES (
      :id, :cliente, :cuenta, :numeroCliente, :numeroCuenta, :noFactura,
      :fechaEmision, :fechaVencimiento, :periodoConsumo, :codigoPago,
      :moneda, :nit, :cuota, :consumo, :comision, :impuesto, :total, :totalPagar,
      :estado, :parser, :ocrConfidence, :ocrDuration, :archivo, :textoOcr,
      :periodoClave, :periodoParte, :userId, ${now}, ${now}
    )`,
    {
      id: facturaId,
      cliente: factura.cliente,
      cuenta: factura.cuenta || factura.cliente,
      numeroCliente: factura.numeroCliente,
      numeroCuenta: factura.numeroCuenta,
      noFactura: factura.noFactura,
      fechaEmision: factura.fechaEmision,
      fechaVencimiento: factura.fechaVencimiento,
      periodoConsumo: factura.periodoConsumo,
      periodoClave: factura.periodoClave || clavePeriodo(factura.periodoConsumo),
      periodoParte: factura.periodoParte ?? null,
      codigoPago: factura.codigoPago,
      moneda: factura.moneda,
      nit: factura.nit,
      cuota: normalizarNumero(factura.totales.cuota),
      consumo: normalizarNumero(factura.totales.consumo),
      comision: normalizarNumero(factura.totales.comision),
      impuesto: normalizarNumero(factura.totales.impuesto),
      total: normalizarNumero(factura.totales.facturado),
      totalPagar: normalizarNumero(factura.totales.totalPagar),
      estado: factura.reviewStatus === "doubtful" ? "error" : factura.requiresReview ? "pendiente" : "procesado",
      parser: `pdf-parse:${factura.strategies.services}/${factura.strategies.totals}`,
      ocrConfidence: factura.confidence,
      ocrDuration: 0,
      archivo: filename,
      textoOcr: packStoredFacturaText(textoOcr, {
        confidence: factura.confidence,
        reviewStatus: factura.reviewStatus,
        reviewLabel: factura.reviewLabel,
        requiresReview: factura.requiresReview,
        diagnostics: factura.diagnostics,
        strategies: factura.strategies,
      }),
      userId,
    },
  );

  for (const servicio of factura.servicios) {
    await execute(
      `INSERT INTO SGF_SERVICIOS (ID, FACTURA_ID, NUMERO_SERVICIO, CUOTA, CONSUMO, COMISION, IMPUESTO, IMPORTE)
       VALUES (:id, :facturaId, :numero, :cuota, :consumo, :comision, :impuesto, :importe)`,
      {
        id: randomUUID(),
        facturaId,
        numero: servicio.numero,
        cuota: normalizarNumero(servicio.cuota),
        consumo: normalizarNumero(servicio.consumo),
        comision: normalizarNumero(servicio.comision),
        impuesto: normalizarNumero(servicio.impuesto),
        importe: normalizarNumero(servicio.importe),
      },
    );
  }

  return facturaId;
}

/**
 * Inserta en PCELULAR.CARGARARCH (tabla del sistema ETECSA principal).
 * Solo disponible cuando el motor es Oracle, donde esa tabla existe.
 * En SQL Server / SQLite devolvemos un array vacio para mantener la
 * forma del contrato del endpoint.
 */
async function guardarEnCargararch(factura: FacturaExtraida) {
  if (!isOracleLegacyTablesAvailable()) {
    return [] as string[];
  }

  const fechaExpr = nowExpr();
  const guardados: string[] = [];

  for (const servicio of factura.servicios) {
    try {
      await execute(
        `INSERT INTO PCELULAR.CARGARARCH (NUMERO, CUOTA, CONSUMO, COMISION, IMPUESTO, IMPORTE, TIRA, FECHA_PARTE)
         VALUES (:n, :c, :cs, :cm, :im, :ip, :t, ${fechaExpr})`,
        {
          n: servicio.numero,
          c: servicio.cuota,
          cs: servicio.consumo,
          cm: servicio.comision,
          im: servicio.impuesto,
          ip: servicio.importe,
          t: `Factura ${factura.noFactura} - ${factura.cliente.slice(0, 40)}`,
        },
      );
      guardados.push(servicio.numero);
    } catch (error: any) {
      throw new Error(`No se pudo guardar un servicio en CARGARARCH: ${error.message}`);
    }
  }

  return guardados;
}

/**
 * Vincula los servicios de la factura con los datos de la linea telefonica.
 * Fuente 1: PCELULAR.* (Oracle). Fuente 2: SGF_LINEAS_IMPORTADAS (el Excel).
 * Se usan los numeros de servicio extraidos del PDF, no solo los insertados en
 * CARGARARCH: en SQLite/SQL Server esa tabla no existe y antes el resultado
 * era siempre vacio.
 */
async function enriquecerLineas(factura: FacturaExtraida): Promise<Awaited<ReturnType<typeof enriquecerLineasFactura>>> {
  return enriquecerLineasFactura(factura.servicios.map((servicio) => servicio.numero), factura.servicios.length);
}

// Las decisiones de duplicado y el guardado de PDF se ejecutan en orden:
// dos cargas simultáneas no pueden comprobar "no existe" y guardarse a la vez.
let turnoCarga: Promise<void> = Promise.resolve();
async function conTurnoCarga<T>(fn: () => Promise<T>): Promise<T> {
  const anterior = turnoCarga;
  let liberar!: () => void;
  turnoCarga = new Promise<void>(resolve => { liberar = resolve; });
  await anterior;
  try { return await fn(); } finally { liberar(); }
}

export async function handleUploadFactura(req: AuthenticatedRequest, res: ServerResponse) {
  let body: any;
  try {
    body = await readJsonBodyLarge(req, 20 * 1024 * 1024);
  } catch {
    return sendJson(res, 400, { success: false, error: "Cuerpo demasiado grande." });
  }

  return conTurnoCarga(async () => {
  const filename = body.filename || "factura.pdf";
  const base64Data = body.file || body.data || "";
  const analizar = body.accion === "analizar";
  const guardar = body.accion === "guardar";
  if (!analizar && !guardar) return sendJson(res, 400, { success: false, error: "Primero analice el PDF y confirme expresamente si quiere guardar la factura." });
  if (!base64Data) {
    return sendJson(res, 400, { success: false, error: "No se recibio el archivo PDF. Envie { file: 'base64...' }" });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = Buffer.from(base64Data, "base64");
  } catch {
    return sendJson(res, 400, { success: false, error: "El archivo no es un base64 valido." });
  }

  if (pdfBuffer.length > 15 * 1024 * 1024) {
    return sendJson(res, 400, { success: false, error: "PDF demasiado grande (>15MB)." });
  }

  const startedAt = Date.now();

  try {
    // Comprobar que es realmente un PDF antes de darselo al parser
    if (!pdfBuffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
      return sendJson(res, 400, { success: false, error: "El archivo no es un PDF valido (falta la cabecera %PDF-)." });
    }

    let texto = "";
    try {
      texto = await extraerTextoPdf(pdfBuffer);
    } catch (error: any) {
      return sendJson(res, 422, {
        success: false,
        error: `No se pudo leer el PDF (${error.message}). Si es un documento escaneado, guardelo como PDF con texto o suba el original.`,
      });
    }

    if (!texto || texto.length < 50) {
      return sendJson(res, 422, {
        success: false,
        error: "No se pudo extraer texto del PDF. Puede que sea una imagen escaneada.",
        data: { caracteresExtraidos: texto.length },
      });
    }

    const factura = parseFacturaEtcsa(texto);

    // ── Facturas por mes ─────────────────────────────────────────────────────
    // Lo habitual es 2 facturas por mes (configurable con FACTURAS_POR_MES). Al
    // cargar una factura se dice en qué parte del mes cae y cuántas van ya, para
    // detectar de un vistazo una factura cargada dos veces o una que falta.
    factura.periodoClave = clavePeriodo(factura.periodoConsumo);
    const esperadasPorMes = facturasPorMesConfiguradas();
    const situacion = await calcularParteDelPeriodo(
      factura.periodoConsumo,
      factura.noFactura,
      req.currentUser?.id || "",
    );
    factura.periodoParte = situacion.yaExiste ? null : situacion.parte;
    const yaCargadas = situacion.yaExiste ? situacion.facturasDelPeriodo : situacion.facturasDelPeriodo;

    if (factura.periodoClave) {
      if (situacion.yaExiste) {
        factura.diagnostics.push({
          level: "warn",
          code: "factura-ya-cargada",
          message: `La factura ${factura.noFactura} ya estaba cargada; solo se sustituirá si lo confirma.`,
        });
      }
      const numeroParte = situacion.yaExiste ? situacion.parte : situacion.parte;
      const nombreParte = esperadasPorMes > 1
        ? ` (factura ${Math.min(numeroParte, esperadasPorMes)} de ${esperadasPorMes} del mes)`
        : "";
      if (situacion.facturasDelPeriodo >= esperadasPorMes && !situacion.yaExiste) {
        factura.diagnostics.push({
          level: "warn",
          code: "mas-facturas-de-las-esperadas",
          message:
            `Este mes ya tenia ${situacion.facturasDelPeriodo} factura(s) y se esperaban ${esperadasPorMes}. ` +
            "Si es una factura de mas, adelante; si no, compruebe que no la esta cargando dos veces. " +
            "El numero de facturas por mes se ajusta en Ajustes (FACTURAS_POR_MES).",
        });
      } else if (!situacion.yaExiste) {
        factura.diagnostics.push({
          level: "info",
          code: "parte-del-mes",
          message: `Periodo ${factura.periodoClave}${nombreParte}: ${yaCargadas + 1} de ${esperadasPorMes} facturas esperadas este mes.`,
        });
      }
    }

    const duplicateSummary = await detectarDuplicadosFactura(factura, req.currentUser?.id || "");
    const prefijoAntiguo = factura.noFactura.match(/^(\d{6,})[A-Za-z]/)?.[1];
    const anteriores = prefijoAntiguo ? await query<any>(
      `SELECT ID, USER_ID, TEXTO_OCR FROM SGF_FACTURAS WHERE NO_FACTURA = :nf`, {nf: prefijoAntiguo},
    ) : [];
    // Una versión anterior truncaba números alfanuméricos. Si el texto guardado
    // identifica sin dudas el número completo, se puede ofrecer reemplazar SOLO
    // ese registro propio; si no, se bloquea hasta revisarlo manualmente.
    const identificados = anteriores.map((row: any) => {
      const texto = row?.TEXTO_OCR ?? row?.texto_ocr;
      const raw = typeof texto === "string" ? unpackStoredFacturaText(texto).text : "";
      const identificador = raw.match(/no\.?\s*factura\s*:?\s*([A-Za-z0-9][A-Za-z0-9-]{5,})/i)?.[1] || "";
      return { id:String(row?.ID ?? row?.id ?? ""), usuario:String(row?.USER_ID ?? row?.user_id ?? ""), identificador };
    });
    const iguales = identificados.filter((r: any) => r.identificador.toUpperCase() === factura.noFactura.toUpperCase());
    const desconocidos = identificados.filter((r: any) => !r.identificador || r.identificador.toUpperCase() === prefijoAntiguo?.toUpperCase());
    const legacyPropia = iguales.length === 1 && iguales[0].usuario === req.currentUser?.id ? iguales[0] : null;
    const legacyAjena = iguales.some((r: any) => r.usuario !== req.currentUser?.id);
    const posibleRegistroAntiguo = desconocidos.length > 0 || iguales.length > 1 || (iguales.length > 0 && isOracleLegacyTablesAvailable()) || (iguales.length > 0 && duplicateSummary.sameInvoice.length > 0);


    // La vista previa no modifica ninguna tabla. Los detalles de facturas de
    // otros usuarios no se devuelven a quien no tiene permiso para editarlas.
    const deOtraPersona = duplicateSummary.sameInvoiceOtrosUsuarios.length > 0 || legacyAjena;
    if (analizar) {
      const enriquecimiento = await enriquecerLineas(factura);
      const propios = duplicateSummary.sameInvoice.filter(d => d.user_id === req.currentUser?.id);
      return sendJson(res, 200, { success: true,
        message: "Análisis terminado. Todavía no se ha guardado la factura.",
        data: {
          estado: "vista_previa", factura: { ...factura, processingMs: Date.now() - startedAt },
          totalServicios: factura.servicios.length, extraccionVacia: factura.servicios.length === 0,
          requiereRevision: factura.requiresReview, enriquecimiento,
          duplicadoPropio: propios.length > 0 || Boolean(legacyPropia), duplicadoAjeno: deOtraPersona, posibleRegistroAntiguo,
          registroAntiguoIdentificado: Boolean(legacyPropia),
          periodo: { clave: factura.periodoClave || "", parte: factura.periodoParte ?? null,
            facturasPorMes: esperadasPorMes, cargadasEsteMes: situacion.facturasDelPeriodo },
        },
      });
    }
    // No se debe crear otra copia ni borrar una factura de otra persona. El
    // reemplazo cruzado requiere un flujo explícito que todavía no existe.
    if (posibleRegistroAntiguo) return sendJson(res, 409, {success:false,
      error:"Hay una factura antigua con número incompleto que podría corresponder a este PDF. Revise el historial con el administrador; no se ha reemplazado ni duplicado."});
    if (deOtraPersona) return sendJson(res, 409, { success:false,
      error:"Esta factura pertenece a otra cuenta. No se ha guardado ni sustituido; consulte al administrador." });
    if ((duplicateSummary.sameInvoice.length > 0 || legacyPropia) && body.confirmarSustitucion !== true) {
      return sendJson(res, 409, { success:false, error:"La factura ya existe. Confirme expresamente si quiere sustituirla.", data:{requiereConfirmarSustitucion:true} });
    }
    if (factura.servicios.length === 0 && body.confirmarSinServicios !== true) {
      return sendJson(res, 422, { success:false, error:"No se detectaron servicios. Revise el PDF; no se ha guardado la factura.", data:{requiereConfirmarSinServicios:true} });
    }
    if (duplicateSummary.sameInvoice.length > 0 || legacyPropia) {
      factura.diagnostics.push({ level:"warn", code:"factura-sustituida",
        message:`La factura ${factura.noFactura} se ha sustituido después de su confirmación.` });
    }

    if (duplicateSummary.repeatedSamePeriod.length > 0) {
      // Lo normal cuando el mes se factura en dos partes: las mismas lineas
      // aparecen en la primera y en la segunda factura del mes.
      const nums = Array.from(new Set(duplicateSummary.repeatedSamePeriod.map((d) => d.numero_servicio)));
      factura.diagnostics.push({
        level: "info",
        code: "lineas-compartidas-con-otra-factura-del-mes",
        message:
          `Estas lineas ya aparecen en otra factura de este mismo periodo ` +
          `(${nums.slice(0, 8).join(", ")}${nums.length > 8 ? "..." : ""}). ` +
          "Es normal si el mes se factura en varias partes; se carga igualmente.",
      });
    }

    if (duplicateSummary.repeatedOtherPeriod.length > 0) {
      // La misma linea en otro mes es lo normal, no un error: se informa y se sigue.
      const unicos = Array.from(new Set(duplicateSummary.repeatedOtherPeriod.map((item) => item.numero_servicio)));
      const periodos = Array.from(new Set(duplicateSummary.repeatedOtherPeriod.map((item) => item.periodo_consumo).filter(Boolean)));
      factura.diagnostics.push({
        level: "info",
        code: "lineas-ya-facturadas-en-otro-periodo",
        message: `Estas lineas ya estaban en facturas de otros periodos (${periodos.slice(0, 4).join(", ")}${periodos.length > 4 ? "..." : ""}): ${unicos.slice(0, 8).join(", ")}${unicos.length > 8 ? "..." : ""}. Se carga igualmente porque el periodo es distinto.`,
      });
    }

    // Borrado + insercion + CARGARARCH en UNA transaccion: antes, si algo
    // fallaba a mitad, la factura anterior ya estaba borrada y la nueva
    // quedaba incompleta (sin servicios).
    let guardados: string[] = [];
    const sgfFacturaId = await transaction(async () => {
      await limpiarFacturaExistente(factura.noFactura, req.currentUser?.id || "");
      if (legacyPropia) {
        await execute(`DELETE FROM SGF_SERVICIOS WHERE FACTURA_ID = :id`, {id:legacyPropia.id});
        await execute(`DELETE FROM SGF_FACTURAS WHERE ID = :id AND USER_ID = :uid`, {id:legacyPropia.id, uid:legacyPropia.usuario});
      }
      const id = await guardarFacturaCompleta(req, factura, texto, filename);
      guardados = await guardarEnCargararch(factura);
      return id;
    });
    flushDisk();
    const enriquecimiento = await enriquecerLineas(factura);


    await auditLog(
      req,
      "procesar_pdf",
      "factura",
      sgfFacturaId,
      factura.diagnostics.some((item) => item.level === "error") ? "warn" : "info",
      `PDF procesado: factura ${factura.noFactura || filename}; servicios ${factura.servicios.length}; CARGARARCH ${guardados.length}; confianza ${factura.confidence}`,
    );

    const extraccionVacia = factura.servicios.length === 0;
    const avisoExtraccion = extraccionVacia
      ? " ATENCIÓN: ha confirmado guardar solo la cabecera; no se pudieron extraer servicios y queda marcada para revisión."
      : factura.requiresReview
        ? " Aviso: la extracción requiere revisión manual."
        : "";

    return sendJson(res, 200, {
      success: true,
      message: `Factura guardada: ${factura.servicios.length} servicios en SGF.${avisoExtraccion}`,
      data: {
        sgfFacturaId,
        factura: {
          ...factura,
          processingMs: Date.now() - startedAt,
        },
        guardados,
        totalServicios: factura.servicios.length,
        extraccionVacia,
        requiereRevision: factura.requiresReview,
        lineasEncontradas: enriquecimiento.lineas,
        enriquecimiento,
        duplicateSummary,
        periodo: {
          clave: factura.periodoClave || "",
          parte: factura.periodoParte ?? null,
          facturasPorMes: esperadasPorMes,
          cargadasEsteMes: factura.periodoParte ? situacion.facturasDelPeriodo + 1 : situacion.facturasDelPeriodo,
          completa: factura.periodoParte
            ? situacion.facturasDelPeriodo + 1 >= esperadasPorMes
            : situacion.facturasDelPeriodo >= esperadasPorMes,
        },
        cliente: factura.cliente,
        noFactura: factura.noFactura,
        moneda: factura.moneda,
        totalPagar: factura.totalPagar,
      },
    });
  } catch (error: any) {
    return sendJson(res, 500, { success: false, error: `Error procesando PDF: ${error.message}` });
  }
  });
}

async function readJsonBodyLarge(req: AuthenticatedRequest, maxBytes: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Cuerpo muy grande."));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON invalido."));
      }
    });

    req.on("error", reject);
  });
}
