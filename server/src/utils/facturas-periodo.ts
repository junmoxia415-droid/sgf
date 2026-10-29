/**
 * Facturas por mes.
 *
 * En el negocio real cada mes se facturan los mismos números de servicio, y a
 * veces en VARIAS facturas dentro del mismo mes (dos habitualmente: la primera y
 * la segunda quincena; pero puede haber una, tres, cuatro o más).
 *
 * El número de facturas por mes es configurable (`FACTURAS_POR_MES`, por defecto
 * 2) y sirve para:
 *   - aceptar sin rechistar hasta esa cantidad de facturas del mismo periodo;
 *   - avisar (sin bloquear) cuando se llega a la cantidad esperada o se supera,
 *     que es justo lo que hace falta para no cargar dos veces la misma;
 *   - etiquetar cada factura con su parte (`PERIODO_PARTE`): primera, segunda…
 *
 * Nota: el esquema del sistema original no se toca; las dos columnas nuevas se
 * añaden solo si faltan (ver ensureColumnExists en database.ts).
 */
import { query, execute, getDbMode, ensureColumnExists } from "../models/database.js";

/** Cabecera del periodo: "AAAA-MM" a partir del texto que trae la factura. */
export function clavePeriodo(periodo: string | null | undefined): string {
  const texto = String(periodo ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!texto) return "";

  const meses: Record<string, string> = {
    ENERO: "01", FEBRERO: "02", MARZO: "03", ABRIL: "04", MAYO: "05", JUNIO: "06",
    JULIO: "07", AGOSTO: "08", SEPTIEMBRE: "09", SETIEMBRE: "09", OCTUBRE: "10",
    NOVIEMBRE: "11", DICIEMBRE: "12",
    ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
    JUL: "07", AGO: "08", SEP: "09", SEPT: "09", OCT: "10", NOV: "11", DIC: "12",
  };

  const conNombre = texto.match(/([A-ZÁÉÍÓÚ]{3,})[\s\/-]*(?:DEL\s+)?(\d{4})/);
  if (conNombre && meses[conNombre[1]]) return `${conNombre[2]}-${meses[conNombre[1]]}`;

  const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const latino = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (latino) return `${latino[3]}-${latino[2].padStart(2, "0")}`;

  const mesAnio = texto.match(/^(\d{1,2})[\s\/-](\d{4})$/);
  if (mesAnio) return `${mesAnio[2]}-${mesAnio[1].padStart(2, "0")}`;
  const anioMes = texto.match(/^(\d{4})[\s\/-](\d{1,2})$/);
  if (anioMes) return `${anioMes[1]}-${anioMes[2].padStart(2, "0")}`;

  return texto;
}

/** Cuántas facturas por mes se esperan (configurable, 2 por defecto). */
export function facturasPorMesConfiguradas(): number {
  const n = Number(process.env.FACTURAS_POR_MES);
  if (!Number.isFinite(n) || n < 1 || n > 50) return 2;
  return Math.floor(n);
}

/**
 * Qué parte del mes es esta factura (1 = primera, 2 = segunda…).
 *
 * - Si la factura lo dice en el texto ("PRIMERA QUINCENA", "PARTE 2 DE 3",
 *   "SEGUNDA QUINCENA") se usa eso.
 * - Si no lo dice, se cuenta cuántas facturas de ese periodo tiene ya el usuario y
 *   esta pasa a ser la siguiente.
 *
 * Devuelve también las repetidas: una misma factura subida dos veces acabaría
 * contando como "segunda parte" si no se mira el número de factura.
 */
export async function calcularParteDelPeriodo(
  periodo: string,
  noFactura: string,
  userId: string,
): Promise<{ parte: number; yaExiste: boolean; facturasDelPeriodo: number }> {
  const clave = clavePeriodo(periodo);

  let yaExiste = false;
  let delPeriodo: any[] = [];
  if (clave && userId) {
    const filas = await query<any>(
      `SELECT ID, NO_FACTURA, PERIODO_CLAVE FROM SGF_FACTURAS WHERE PERIODO_CLAVE = :p AND USER_ID = :u`,
      { p: clave, u: userId },
    );
    delPeriodo = filas;
    yaExiste = noFactura
      ? filas.some((f) => String(f?.NO_FACTURA ?? f?.no_factura ?? "") === noFactura)
      : false;
  }

  // "PRIMERA QUINCENA" / "PARTE 2 DE 3" / "SEGUNDA QUINCENA"
  const ordinales: Record<string, number> = {
    PRIMERA: 1, PRIMER: 1, SEGUNDA: 2, SEGUNDO: 2, TERCERA: 3, TERCER: 3,
    CUARTA: 4, QUINTA: 5, SEXTA: 6,
  };
  let parte = 0;
  const texto = String(periodo ?? "").toUpperCase();
  const conParte = texto.match(/PARTE\s+(\d+)\s*(?:DE\s*(\d+))?/);
  if (conParte) {
    parte = Number(conParte[1]);
  } else {
    const conQuincena = texto.match(/(PRIMERA|PRIMER|SEGUNDA|SEGUNDO|TERCERA|TERCER|CUARTA|QUINTA|SEXTA)\s+QUINCENA/);
    if (conQuincena) parte = ordinales[conQuincena[1]] || 0;
  }
  if (!parte || !Number.isFinite(parte)) {
    parte = yaExiste ? 1 : delPeriodo.length + 1;
  }

  return { parte, yaExiste, facturasDelPeriodo: delPeriodo.length };
}

/** Crea las dos columnas nuevas si la base es antigua. Se llama en cada arranque. */
export async function asegurarColumnasPeriodo(): Promise<void> {
  const tablas: Array<[string, string, string]> = [
    ["SGF_FACTURAS", "PERIODO_CLAVE", "TEXT"],
    ["SGF_FACTURAS", "PERIODO_PARTE", "INTEGER"],
  ];
  for (const [tabla, columna, tipo] of tablas) {
    try {
      if (getDbMode() === "oracle") {
        // En Oracle el tipo cambia; se deja como NUMBER para la parte.
        await ensureColumnExists(tabla, columna, columna === "PERIODO_PARTE" ? "NUMBER(3)" : "VARCHAR2(20)");
      } else if (getDbMode() === "mssql") {
        await ensureColumnExists(tabla, columna, columna === "PERIODO_PARTE" ? "INT" : "NVARCHAR(20)");
      } else {
        await ensureColumnExists(tabla, columna, tipo);
      }
    } catch {
      // si la columna ya existe no se hace nada
    }
  }
}

/** Rellena PERIODO_CLAVE/PERIODO_PARTE en las facturas antiguas que no lo tengan. */
export async function rellenarPeriodosAntiguos(): Promise<number> {
  const filas = await query<any>(
    `SELECT ID, PERIODO_CONSUMO, PERIODO_CLAVE FROM SGF_FACTURAS WHERE PERIODO_CLAVE IS NULL OR PERIODO_CLAVE = ''`,
  );
  let actualizadas = 0;
  for (const fila of filas) {
    const id = String(fila?.ID ?? fila?.id ?? "");
    const clave = clavePeriodo(String(fila?.PERIODO_CONSUMO ?? fila?.periodo_consumo ?? ""));
    if (!id || !clave) continue;
    await execute(`UPDATE SGF_FACTURAS SET PERIODO_CLAVE = :p WHERE ID = :id`, { p: clave, id });
    actualizadas++;
  }
  return actualizadas;
}
