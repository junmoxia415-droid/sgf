/**
 * enriquecimiento.ts - Vincula los numeros de servicio de una factura con los
 * datos de la linea telefonica.
 *
 * Hasta ahora solo se consultaba PCELULAR.LINEA_TELEFONICA (Oracle), asi que en
 * SQLite / SQL Server, o en una instalacion donde el Excel es la unica fuente,
 * el resultado SIEMPRE era vacio: el Excel importado a SGF_LINEAS_IMPORTADAS
 * no se usaba para nada. Ahora:
 *
 *   1. Se intenta primero la fuente maestra (PCELULAR.* en Oracle).
 *   2. Lo que no aparezca alli (o si Oracle no esta disponible) se busca en
 *      SGF_LINEAS_IMPORTADAS, es decir, en el Excel que sube el usuario.
 *
 * Cada linea devuelta indica su origen en el campo FUENTE para que la interfaz
 * pueda distinguir los datos del sistema de los del Excel.
 */

import { isOracleLegacyTablesAvailable, query } from "../models/database.js";

export type FuenteLinea = "PCELULAR" | "EXCEL";

export interface LineaVinculada {
  NUMERO: string;
  NOMBRE?: string;
  APELL1?: string;
  APELL2?: string;
  NOMBRE_COMPLETO?: string;
  ORGANO?: string;
  UNIDAD?: string;
  PROVINCIA?: string;
  MUNICIPIO?: string;
  CARGO?: string;
  GRADO?: string;
  ESTADO?: string;
  MARCA?: string;
  MODELO?: string;
  IMEI?: string;
  IDENTID?: string;
  ACTUALIZADO?: string;
  FUENTE: FuenteLinea;
}

export interface ResultadoEnriquecimiento {
  fuente: FuenteLinea | "NINGUNA";
  total: number;
  encontradas: number;
  sinVincular: string[];
  lineas: LineaVinculada[];
}

const MAX_POR_DEFECTO = 200;

/** Deja solo digitos: el Excel a veces trae espacios, guiones o "+". */
export function normalizarNumeroLinea(valor: unknown): string {
  return String(valor ?? "").replace(/[^\d]/g, "");
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor).trim();
}

function unirNombre(...partes: Array<string | undefined>): string {
  return partes.map((p) => texto(p)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function mapOracle(row: any): LineaVinculada {
  const nombre = texto(row?.NOMBRE ?? row?.nombre);
  const apell1 = texto(row?.APELL1 ?? row?.apell1);
  const apell2 = texto(row?.APELL2 ?? row?.apell2);
  return {
    NUMERO: normalizarNumeroLinea(row?.NUMERO ?? row?.numero),
    NOMBRE: nombre,
    APELL1: apell1,
    APELL2: apell2,
    NOMBRE_COMPLETO: unirNombre(nombre, apell1, apell2),
    ORGANO: texto(row?.ORGANO ?? row?.organo),
    UNIDAD: texto(row?.UNIDAD ?? row?.unidad),
    IDENTID: texto(row?.IDENTID ?? row?.identid),
    FUENTE: "PCELULAR",
  };
}

function mapExcel(row: any): LineaVinculada {
  const completo = texto(row?.USUARIO_PUESTO ?? row?.usuario_puesto);
  return {
    NUMERO: normalizarNumeroLinea(row?.NUMERO ?? row?.numero),
    NOMBRE: completo,
    APELL1: "",
    APELL2: "",
    NOMBRE_COMPLETO: completo,
    ORGANO: texto(row?.ORGANO ?? row?.organo),
    UNIDAD: texto(row?.UNIDAD ?? row?.unidad),
    PROVINCIA: texto(row?.PROVINCIA ?? row?.provincia),
    MUNICIPIO: texto(row?.MUNICIPIO ?? row?.municipio),
    CARGO: texto(row?.CARGO ?? row?.cargo),
    GRADO: texto(row?.GRADO ?? row?.grado),
    ESTADO: texto(row?.ESTADO ?? row?.estado),
    MARCA: texto(row?.MARCA ?? row?.marca),
    MODELO: texto(row?.MODELO ?? row?.modelo),
    IMEI: texto(row?.IMEI ?? row?.imei),
    ACTUALIZADO: texto(row?.FECHA_ACTUALIZACION ?? row?.fecha_actualizacion),
    FUENTE: "EXCEL",
  };
}

function trocear<T>(lista: T[], tamano: number): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

async function buscarEnOracle(numeros: string[]): Promise<Map<string, LineaVinculada>> {
  const encontradas = new Map<string, LineaVinculada>();
  if (!isOracleLegacyTablesAvailable() || numeros.length === 0) return encontradas;

  for (const numero of numeros) {
    try {
      const rows = await query<any>(
        `SELECT l.NUMERO, l.IDENTID, p.NOMBRE, p.APELL1, p.APELL2, u.UNIDAD, o.ORGANO
         FROM PCELULAR.LINEA_TELEFONICA l
         LEFT JOIN PCELULAR.PERSONA p ON l.IDENTID = p.INDENTID
         LEFT JOIN PCELULAR.UNIDAD u ON l.COD_UNIDAD = u.COD_UNIDAD
         LEFT JOIN PCELULAR.ORGANO o ON u.COD_ORGANO = o.COD_ORGANO
         WHERE l.NUMERO = :n`,
        { n: numero },
      );
      if (rows.length > 0) encontradas.set(numero, mapOracle(rows[0]));
    } catch {
      // Si la tabla legacy no existe o falla, se continua con el Excel.
    }
  }
  return encontradas;
}

/**
 * Busca en SGF_LINEAS_IMPORTADAS (el Excel). Si hay varias filas para el mismo
 * numero (varias importaciones), se queda con la mas reciente.
 */
async function buscarEnExcel(numeros: string[]): Promise<Map<string, LineaVinculada>> {
  const encontradas = new Map<string, LineaVinculada>();
  if (numeros.length === 0) return encontradas;

  // 1) Coincidencia exacta (usa el indice de NUMERO).
  for (const grupo of trocear(numeros, 50)) {
    const placeholders = grupo.map((_, i) => `:n${i}`).join(", ");
    const params: Record<string, any> = {};
    grupo.forEach((numero, i) => { params[`n${i}`] = numero; });
    try {
      const rows = await query<any>(
        `SELECT * FROM SGF_LINEAS_IMPORTADAS WHERE NUMERO IN (${placeholders}) ORDER BY CREATED_AT DESC`,
        params,
      );
      for (const row of rows) {
        const numero = normalizarNumeroLinea(row?.NUMERO ?? row?.numero);
        if (numero && !encontradas.has(numero)) encontradas.set(numero, mapExcel(row));
      }
    } catch {
      // Tabla no disponible en este motor / instalacion: se omite esta fuente.
    }
  }

  // 2) Los que faltan, tolerando formatos raros en el Excel (espacios, guiones).
  const pendientes = numeros.filter((n) => !encontradas.has(n));
  for (const grupo of trocear(pendientes, 50)) {
    const placeholders = grupo.map((_, i) => `:n${i}`).join(", ");
    const params: Record<string, any> = {};
    grupo.forEach((numero, i) => { params[`n${i}`] = numero; });
    try {
      const rows = await query<any>(
        `SELECT * FROM SGF_LINEAS_IMPORTADAS
         WHERE REPLACE(REPLACE(REPLACE(REPLACE(NUMERO, ' ', ''), '-', ''), '+', ''), '.', '') IN (${placeholders})
         ORDER BY CREATED_AT DESC`,
        params,
      );
      for (const row of rows) {
        const numero = normalizarNumeroLinea(row?.NUMERO ?? row?.numero);
        if (numero && !encontradas.has(numero)) encontradas.set(numero, mapExcel(row));
      }
    } catch {
      // Motor sin REPLACE anidado o tabla ausente: se ignora.
    }
  }

  return encontradas;
}

/**
 * Devuelve los datos de las lineas indicadas, con su origen.
 * Oracle tiene prioridad; el Excel cubre lo que falte.
 */
export async function enriquecerLineasFactura(
  numeros: Array<string | undefined>,
  max = MAX_POR_DEFECTO,
): Promise<ResultadoEnriquecimiento> {
  const unicos: string[] = [];
  for (const bruto of numeros) {
    const numero = normalizarNumeroLinea(bruto);
    if (numero && !unicos.includes(numero)) unicos.push(numero);
    if (unicos.length >= max) break;
  }

  const vacio: ResultadoEnriquecimiento = { fuente: "NINGUNA", total: unicos.length, encontradas: 0, sinVincular: unicos, lineas: [] };
  if (unicos.length === 0) return vacio;

  const deOracle = await buscarEnOracle(unicos);
  const pendientes = unicos.filter((n) => !deOracle.has(n));
  const deExcel = pendientes.length > 0 ? await buscarEnExcel(pendientes) : new Map<string, LineaVinculada>();

  const lineas: LineaVinculada[] = [];
  const sinVincular: string[] = [];
  for (const numero of unicos) {
    const linea = deOracle.get(numero) || deExcel.get(numero);
    if (linea) lineas.push(linea);
    else sinVincular.push(numero);
  }

  const fuentes = new Set(lineas.map((l) => l.FUENTE));
  const fuente: ResultadoEnriquecimiento["fuente"] =
    fuentes.size === 0 ? "NINGUNA" : fuentes.size > 1 ? "PCELULAR" : (Array.from(fuentes)[0] as FuenteLinea);

  return { fuente, total: unicos.length, encontradas: lineas.length, sinVincular, lineas };
}

/**
 * Busqueda libre de lineas (para el buscador de la interfaz). Devuelve primero
 * las de Oracle y luego las del Excel, sin duplicar numeros.
 */
export async function buscarLineas(
  termino: string,
  limite = 50,
): Promise<{ lineas: LineaVinculada[]; fuentes: { pcelular: number; excel: number } }> {
  const limpio = texto(termino);
  const lineas: LineaVinculada[] = [];
  const vistos = new Set<string>();
  let pcelular = 0;
  let excel = 0;

  if (isOracleLegacyTablesAvailable() && limpio) {
    try {
      const rows = await query<any>(
        `SELECT l.NUMERO, l.IDENTID, p.NOMBRE, p.APELL1, p.APELL2, u.UNIDAD, o.ORGANO
         FROM PCELULAR.LINEA_TELEFONICA l
         LEFT JOIN PCELULAR.PERSONA p ON l.IDENTID = p.INDENTID
         LEFT JOIN PCELULAR.UNIDAD u ON l.COD_UNIDAD = u.COD_UNIDAD
         LEFT JOIN PCELULAR.ORGANO o ON u.COD_ORGANO = o.COD_ORGANO
         WHERE TO_CHAR(l.NUMERO) LIKE :q OR UPPER(p.NOMBRE) LIKE :q OR UPPER(p.APELL1) LIKE :q`,
        { q: `%${limpio.toUpperCase()}%` },
      );
      for (const row of rows.slice(0, limite)) {
        const linea = mapOracle(row);
        if (!linea.NUMERO || vistos.has(linea.NUMERO)) continue;
        vistos.add(linea.NUMERO);
        lineas.push(linea);
        pcelular += 1;
      }
    } catch {
      // sin fuente Oracle
    }
  }

  if (limpio) {
    try {
      const rows = await query<any>(
        `SELECT * FROM SGF_LINEAS_IMPORTADAS
         WHERE NUMERO LIKE :q OR UPPER(USUARIO_PUESTO) LIKE :q OR UPPER(UNIDAD) LIKE :q OR UPPER(ORGANO) LIKE :q
         ORDER BY CREATED_AT DESC`,
        { q: `%${limpio}%` },
      );
      for (const row of rows) {
        const linea = mapExcel(row);
        if (!linea.NUMERO || vistos.has(linea.NUMERO)) continue;
        vistos.add(linea.NUMERO);
        lineas.push(linea);
        excel += 1;
        if (lineas.length >= limite) break;
      }
    } catch {
      // sin tabla importada
    }
  }

  return { lineas: lineas.slice(0, limite), fuentes: { pcelular, excel } };
}
