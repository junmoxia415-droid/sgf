import type { ServerResponse } from "node:http";
import { query } from "../models/database.js";
import { sendJson } from "../middleware/auth.js";
import { clavePeriodo } from "../utils/facturas-periodo.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

/**
 * estadisticas.routes.ts - Estadisticas por meses, con seleccion de meses.
 *
 * Devuelve, para los meses pedidos (o los ultimos 3 si no se pide ninguno):
 *   - por mes: facturas, lineas, importe total, importe medio, lineas sin consumo
 *   - por linea: el importe de cada mes y cuantos meses ha estado a cero
 *   - por oficial: lo mismo, agrupado por la persona a cuyo cargo esta la linea
 *
 * Es la vista que sirve para ver de un vistazo el consumo de 3 meses y quien no
 * ha consumido nada. Las lineas sin consumo salen de SGF_SERVICIOS, cruzadas con
 * SGF_LINEAS_IMPORTADAS (el Excel que se importa antes que las facturas).
 *
 * GET /api/estadisticas/meses?periodos=2026-08,2026-09,2026-10&limite=12
 */

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * El periodo se guarda tal cual viene en la factura ("01/09/26 - 30/09/26") y
 * se unifica con la misma funcion que usa el importador. Antes se convertia a
 * "2026-09", que no coincidia con lo guardado y las estadisticas salian vacias.
 */
const normalizar = (valor: string) => clavePeriodo(valor) || String(valor || "").trim();

/** "2026-09" -> "septiembre de 2026" */
function nombreMes(clave: string): string {
  // Se acepta el formato normalizado (2026-09) y el de la factura
  // (01/09/26 - 30/09/26 / 2026-09-01 - 2026-09-30).
  const iso = clave.match(/(\d{4})-(\d{2})/);
  const latino = clave.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  let anio = "";
  let mes = 0;
  if (iso) {
    anio = iso[1];
    mes = Number(iso[2]);
  } else if (latino) {
    anio = latino[3].length === 2 ? `20${latino[3]}` : latino[3];
    mes = Number(latino[2]);
  } else {
    return clave;
  }
  const nombre = MESES_ES[mes - 1] ?? "";
  return nombre ? `${nombre} de ${anio}` : clave;
}

function redondear(valor: number): number {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function aNumero(valor: any): number {
  return Number(valor ?? 0) || 0;
}

export async function handleEstadisticasMeses(req: AuthenticatedRequest, res: ServerResponse, url: URL) {
  try {
    // ── Qué meses se quieren ────────────────────────────────────────────────
    const pedidos = (url.searchParams.get("periodos") || "")
      .split(",")
      .map((p) => normalizar(p))
      .filter(Boolean);

    // ── Todos los meses con facturas cargadas ───────────────────────────────
    const filasMeses = await query<any>(
      `SELECT PERIODO_CLAVE AS CLAVE, COUNT(*) AS FACTURAS, SUM(TOTAL_PAGAR) AS TOTAL
       FROM SGF_FACTURAS
       WHERE PERIODO_CLAVE IS NOT NULL AND PERIODO_CLAVE <> ''
       GROUP BY PERIODO_CLAVE
       ORDER BY PERIODO_CLAVE DESC`,
    );

    // Se normaliza para que "SEPTIEMBRE 2026" y "01/09/26 - 30/09/26" cuenten
    // como el mismo mes, vengan como vengan escritos en la factura.
    const disponibles = Array.from(
      new Set(filasMeses.map((f) => normalizar(String(f.CLAVE ?? f.clave ?? ""))).filter(Boolean)),
    );
    // Sin seleccion: los 3 ultimos meses (que es lo que se mira siempre).
    const seleccionados = (pedidos.length > 0 ? pedidos : disponibles.slice(0, 3))
      .map(normalizar)
      .filter((p, i, todos) => disponibles.includes(p) && todos.indexOf(p) === i);

    if (seleccionados.length === 0) {
      return sendJson(res, 200, {
        success: true,
        data: {
          mesesDisponibles: [],
          mesesSeleccionados: [],
          meses: [],
          lineas: [],
          oficiales: [],
          resumen: { facturas: 0, lineas: 0, importeTotal: 0, mesesSinConsumo: 0 },
          aviso: "Todavia no hay facturas cargadas. Importe primero el Excel y despues las facturas.",
        },
      });
    }

    // ── Datos por mes ───────────────────────────────────────────────────────
    // Cada periodo normalizado puede venir de varias grafias: se juntan todas.
    const equivalentes = new Map<string, string[]>();
    for (const fila of filasMeses) {
      const original = String(fila.CLAVE ?? fila.clave ?? "");
      const clave = normalizar(original);
      if (!clave) continue;
      equivalentes.set(clave, [...(equivalentes.get(clave) ?? []), original]);
    }
    const clavesOriginales = seleccionados.flatMap((p) => equivalentes.get(p) ?? [p]);
    const marcadores = clavesOriginales.map((_, i) => `:p${i}`).join(", ");
    const parametros: Record<string, any> = {};
    clavesOriginales.forEach((p, i) => (parametros[`p${i}`] = p));

    const datosMes = await query<any>(
      `SELECT f.PERIODO_CLAVE AS CLAVE,
              COUNT(*) AS FACTURAS,
              ROUND(SUM(f.TOTAL_PAGAR), 2) AS TOTAL
       FROM SGF_FACTURAS f
       WHERE f.PERIODO_CLAVE IN (${marcadores})
       GROUP BY f.PERIODO_CLAVE`,
      parametros,
    );
    const porClave = new Map<string, { facturas: number; total: number }>();
    for (const d of datosMes) {
      const clave = normalizar(String(d.CLAVE ?? d.clave));
      const previo = porClave.get(clave) ?? { facturas: 0, total: 0 };
      porClave.set(clave, {
        facturas: previo.facturas + aNumero(d.FACTURAS ?? d.facturas),
        total: previo.total + aNumero(d.TOTAL ?? d.total),
      });
    }

    // ── Servicios de esos meses (una fila por linea y mes) ──────────────────
    const servicios = await query<any>(
      `SELECT f.PERIODO_CLAVE AS CLAVE,
              s.NUMERO_SERVICIO AS NUMERO,
              s.IMPORTE AS IMPORTE,
              s.CONSUMO AS CONSUMO,
              s.CUOTA AS CUOTA
       FROM SGF_SERVICIOS s
       JOIN SGF_FACTURAS f ON f.ID = s.FACTURA_ID
       WHERE f.PERIODO_CLAVE IN (${marcadores})`,
      parametros,
    );

    // ── Datos del Excel, para poner nombre y unidad a cada linea ────────────
    const catalogo = new Map<string, { nombre: string; unidad: string; cargo: string; grado: string; provincia: string }>();
    try {
      const lineas = await query<any>(
        // Solo las columnas que crea el importador del Excel (ver excel-mapper).
        // Si faltara alguna, el catch de abajo deja las lineas sin nombre.
        `SELECT NUMERO, USUARIO_PUESTO, UNIDAD, CARGO, GRADO, PROVINCIA FROM SGF_LINEAS_IMPORTADAS`,
      );
      for (const l of lineas) {
        const numero = String(l.NUMERO ?? l.numero ?? "").replace(/\D/g, "");
        if (!numero) continue;
        // El Excel trae la persona en "Usuario/Puesto" (columna USUARIO_PUESTO).
        const nombre = String(l.USUARIO_PUESTO ?? l.usuario_puesto ?? "").trim();
        catalogo.set(numero, {
          nombre: nombre || "(sin asignar)",
          unidad: String(l.UNIDAD ?? l.unidad ?? ""),
          cargo: String(l.CARGO ?? l.cargo ?? ""),
          grado: String(l.GRADO ?? l.grado ?? ""),
          provincia: String(l.PROVINCIA ?? l.provincia ?? ""),
        });
      }
    } catch {
      // La tabla del Excel puede no existir todavia: se sigue sin nombres.
    }

    // ── Agregado por mes ────────────────────────────────────────────────────
    const acumulado = new Map<string, { lineas: number; sinConsumo: number; importe: number; importes: number[] }>();
    for (const p of seleccionados) acumulado.set(p, { lineas: 0, sinConsumo: 0, importe: 0, importes: [] });
    for (const s of servicios) {
      const clave = normalizar(String(s.CLAVE ?? s.clave));
      const acc = acumulado.get(clave);
      if (!acc) continue;
      const importe = aNumero(s.IMPORTE ?? s.importe);
      acc.lineas += 1;
      acc.importe += importe;
      acc.importes.push(importe);
      if (importe === 0) acc.sinConsumo += 1;
    }

    const meses = seleccionados.map((clave) => {
      const acc = acumulado.get(clave)!;
      const facturas = porClave.get(clave)?.facturas ?? 0;
      const total = porClave.get(clave)?.total ?? 0;
      return {
        periodo: clave,
        etiqueta: nombreMes(clave),
        facturas,
        lineas: acc.lineas,
        lineasSinConsumo: acc.sinConsumo,
        porcentajeSinConsumo: acc.lineas > 0 ? redondear((acc.sinConsumo / acc.lineas) * 100) : 0,
        importeTotal: redondear(acc.importe || total),
        importeMedio: acc.lineas > 0 ? redondear(acc.importe / acc.lineas) : 0,
        importeMaximo: acc.importes.length > 0 ? redondear(Math.max(...acc.importes)) : 0,
      };
    });

    // ── Por linea: el importe de cada mes y cuantos meses a cero ────────────
    const porLinea = new Map<string, { importes: Record<string, number>; mesesCero: number; total: number }>();
    for (const s of servicios) {
      const numero = String(s.NUMERO ?? s.numero ?? "");
      if (!numero) continue;
      const clave = normalizar(String(s.CLAVE ?? s.clave));
      const importe = aNumero(s.IMPORTE ?? s.importe);
      const actual = porLinea.get(numero) ?? { importes: {}, mesesCero: 0, total: 0 };
      actual.importes[clave] = redondear((actual.importes[clave] ?? 0) + importe);
      actual.total = redondear(actual.total + importe);
      porLinea.set(numero, actual);
    }

    const lineas = [...porLinea.entries()].map(([numero, datos]) => {
      const info = catalogo.get(numero);
      const mesesCero = seleccionados.filter((p) => (datos.importes[p] ?? 0) === 0).length;
      return {
        numero,
        nombre: info?.nombre ?? "(no esta en el Excel)",
        unidad: info?.unidad ?? "",
        cargo: info?.cargo ?? "",
        grado: info?.grado ?? "",
        provincia: info?.provincia ?? "",
        importes: seleccionados.map((p) => datos.importes[p] ?? 0),
        mesesCero,
        importeTotal: datos.total,
        importeMedio: redondear(datos.total / seleccionados.length),
        enExcel: Boolean(info),
      };
    });
    // Primero quien mas gasta; las lineas a cero quedan al final.
    lineas.sort((a, b) => b.importeTotal - a.importeTotal || a.numero.localeCompare(b.numero));

    // ── Por oficial ─────────────────────────────────────────────────────────
    const porOficial = new Map<string, { importes: Record<string, number>; lineas: number; mesesCero: number; unidad: string; grado: string }>();
    for (const linea of lineas) {
      const clave = linea.nombre || "(sin asignar)";
      const actual = porOficial.get(clave) ?? { importes: {}, lineas: 0, mesesCero: 0, unidad: linea.unidad, grado: linea.grado };
      actual.lineas += 1;
      if (linea.mesesCero === seleccionados.length) actual.mesesCero += 1;
      seleccionados.forEach((p, i) => {
        actual.importes[p] = redondear((actual.importes[p] ?? 0) + linea.importes[i]);
      });
      porOficial.set(clave, actual);
    }
    const oficiales = [...porOficial.entries()]
      .map(([nombre, d]) => ({
        oficial: nombre,
        unidad: d.unidad,
        grado: d.grado,
        lineas: d.lineas,
        importes: seleccionados.map((p) => d.importes[p] ?? 0),
        importeTotal: redondear(seleccionados.reduce((a, p) => a + (d.importes[p] ?? 0), 0)),
        lineasSiempreACero: d.mesesCero,
      }))
      .sort((a, b) => b.importeTotal - a.importeTotal);

    const totalImporte = meses.reduce((a, m) => a + m.importeTotal, 0);
    const totalLineas = meses.reduce((a, m) => a + m.lineas, 0);

    return sendJson(res, 200, {
      success: true,
      data: {
        mesesDisponibles: disponibles,
        mesesSeleccionados: seleccionados,
        meses,
        lineas,
        oficiales,
        resumen: {
          facturas: meses.reduce((a, m) => a + m.facturas, 0),
          lineas: totalLineas,
          importeTotal: redondear(totalImporte),
          importeMedioPorMes: seleccionados.length > 0 ? redondear(totalImporte / seleccionados.length) : 0,
          lineasSinConsumo: meses.reduce((a, m) => a + m.lineasSinConsumo, 0),
          lineasSinConsumoAlgunMes: lineas.filter((l) => l.mesesCero > 0).length,
          lineasSinConsumoLos3Meses: lineas.filter((l) => l.mesesCero === seleccionados.length).length,
        },
      },
    });
  } catch (error: any) {
    return sendJson(res, 503, { success: false, error: `No se pudieron calcular las estadisticas: ${error.message}` });
  }
}
