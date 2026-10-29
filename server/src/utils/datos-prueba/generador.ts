/**
 * generador.js - Crea un juego de datos INVENTADO para probar SGF.
 *
 * No usa ningun dato real: nombres, telefonos, importes e IMEI se generan con
 * una semilla fija, asi que el resultado es siempre el mismo y reproducible.
 *
 * Proposito:
 *   - Probabilidad de consumo 0 (lineas sin uso) repartida en los 3 meses.
 *   - 3 periodos consecutivos para poder ver la evolucion mes a mes.
 *   - Excel con las lineas telefonicas y los oficiales a cargo.
 *   - Facturas PDF con la misma estructura que las de ETECSA, pero con datos
 *     inventados, en versiones cortas y largas (1, 2, 4, 12, 40, 120 servicios).
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Generador pseudoaleatorio con semilla: mismos datos en cada ejecucion.
// ---------------------------------------------------------------------------
let semilla = 20261029;
function azar(): number {
  semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
  return semilla / 0x7fffffff;
}
const entero = (min: number, max: number): number => Math.floor(azar() * (max - min + 1)) + min;
const elegir = <T,>(lista: readonly T[]): T => lista[entero(0, lista.length - 1)];

/** Importe con formato cubano: 1,234.56 */
export function fmt(v: number): string {
  return Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Catalogos inventados
// ---------------------------------------------------------------------------
const NOMBRES = ["Ana", "Luis", "Marta", "Jorge", "Yanet", "Raul", "Caridad", "Osvaldo", "Mayelin", "Ernesto",
  "Dunia", "Alberto", "Gretel", "Reinaldo", "Marisol", "Ivan", "Odalis", "Yoel", "Lazara", "Damian",
  "Liudmila", "Eduardo", "Bárbara", "Rene", "Yusimi", "Alejandro", "Teresa", "Osmany", "Damaris", "Fidel"];
const APELLIDOS = ["Pérez", "Rodríguez", "González", "Hernández", "Martínez", "Sánchez", "Torres", "Ramírez",
  "Castillo", "Morales", "Vázquez", "Rojas", "Suárez", "Delgado", "Cabrera", "Iglesias", "Acosta", "Fuentes",
  "Miranda", "Núñez", "Pineda", "Esquivel", "Caballero", "Ledesma", "Zamora", "Betancourt", "Villalba", "Alfonso"];
const PROVINCIAS = ["VILLA CLARA", "CIENFUEGOS", "SANCTI SPIRITUS", "MATANZAS", "CAMAGÜEY", "HOLGUÍN"];
const MUNICIPIOS = ["Santa Clara", "Ranchuelo", "Sagua la Grande", "Cienfuegos", "Trinidad", "Ciego de Ávila"];
const ORGANOS = ["MININT", "MINFAR", "MINCIN", "MINAGRI", "MINSAP"];
const UNIDADES = ["Depto. Operativo", "Seccion Economica", "Dpto. Tecnico", "Grupo Informatica",
  "Seccion Personal", "Tropa Guardia", "Dpto. Contabilidad", "Grupo Custodia"];
const CARGOS = ["Jefe de Dpto.", "Especialista", "Oficial Operativo", "Tecnico A", "Analista",
  "Jefe de Seccion", "Instructor", "Secretaria Docente", "Oficial de Turno"];
const GRADOS = ["Capitan", "Teniente", "Subteniente", "Sargento", "Mayor", "Teniente Coronel",
  "Oficial", "Sin grado"];
const MARCAS = ["Nokia", "Samsung", "ZTE", "Huawei", "Tecno", "Alcatel"];
const MODELOS = ["105", "A13", "Blade A5", "Y6p", "Spark 8", "1S"];

// Prefijos moviles inventados (no se corresponden con un abonado real).
const PREFIJOS = ["52", "53", "54", "55", "56"];

// ---------------------------------------------------------------------------
// 1) Lineas telefonicas + oficiales
// ---------------------------------------------------------------------------
export interface LineaTelefonica {
  numero: string;
  oficial: string;
  provincia: string;
  municipio: string;
  organo: string;
  unidad: string;
  cargo: string;
  grado: string;
  tipoTelefono: string;
  asignacionVoz: string;
  asignacionSms: string;
  imei: string;
  marca: string;
  modelo: string;
  tarjetaSd: string;
  publico: string;
  estuche: string;
  pin: string;
  puk: string;
  mms: string;
  internet: string;
  estado: string;
  inactiva?: boolean;
}

export interface Oficial {
  nombre: string;
  ci: string;
  provincia: string;
  municipio: string;
  organo: string;
  unidad: string;
  cargo: string;
  grado: string;
}

export function generarLineas(cantidad = 120): { lineas: LineaTelefonica[]; oficiales: Oficial[] } {
  const usados = new Set<string>();
  const lineas: LineaTelefonica[] = [];

  // Plantel de oficiales: menos personas que lineas, porque un oficial suele
  // tener a su cargo varias lineas (una personal y otras de la unidad).
  const plantel = new Map<string, Oficial>();
  const cuantosOficiales = Math.max(8, Math.round(cantidad / 2.6));
  while (plantel.size < cuantosOficiales) {
    const nombreCompleto = `${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`;
    if (plantel.has(nombreCompleto)) continue;
    plantel.set(nombreCompleto, {
      nombre: nombreCompleto,
      ci: String(entero(70000000000, 99000000000)),
      provincia: elegir(PROVINCIAS),
      municipio: elegir(MUNICIPIOS),
      organo: elegir(ORGANOS),
      unidad: elegir(UNIDADES),
      cargo: elegir(CARGOS),
      grado: elegir(GRADOS),
    });
  }
  const oficiales = plantel;

  for (let i = 0; i < cantidad; i += 1) {
    let numero: string;
    do {
      numero = `${elegir(PREFIJOS)}${String(entero(100000, 999999))}`;
    } while (usados.has(numero));
    usados.add(numero);

    const clave = elegir([...plantel.keys()]);
    const nombreCompleto = clave;
    const oficial = plantel.get(clave)!;
    lineas.push({
      numero,
      oficial: nombreCompleto,
      provincia: oficial.provincia,
      municipio: oficial.municipio,
      organo: oficial.organo,
      unidad: oficial.unidad,
      cargo: oficial.cargo,
      grado: oficial.grado,
      tipoTelefono: azar() > 0.75 ? "Fijo" : "Movil",
      asignacionVoz: azar() > 0.05 ? "S" : "N",
      asignacionSms: azar() > 0.08 ? "S" : "N",
      imei: String(entero(350000000000000, 359999999999999)),
      marca: elegir(MARCAS),
      modelo: elegir(MODELOS),
      tarjetaSd: azar() > 0.6 ? "Si" : "No",
      publico: azar() > 0.7 ? "Si" : "No",
      estuche: azar() > 0.8 ? "Si" : "No",
      pin: String(entero(1000, 9999)),
      puk: String(entero(10000000, 99999999)),
      mms: azar() > 0.9 ? "Si" : "No",
      internet: azar() > 0.3 ? "Si" : "No",
      estado: azar() > 0.04 ? "Activo" : "Baja",
      // Las lineas de baja no consumen nada en todo el trimestre: son los ceros
      // que interesa ver en las estadisticas.
      inactiva: azar() < 0.06,
    });
  }

  return { lineas, oficiales: [...plantel.values()] };
}

// ---------------------------------------------------------------------------
// 2) Consumo de 3 meses, con ceros
// ---------------------------------------------------------------------------
/**
 * Genera el consumo de una linea en un mes.
 * - ~12 % de las lineas no consumen nada ese mes (importe 0, consumo 0).
 * - El resto tiene cuota mensual fija + consumo variable + comision (15 %).
 */
export function consumoDeLinea(linea: LineaTelefonica, mes: string, indiceMes: number) {
  const cuotaBase = linea.tipoTelefono === "Fijo" ? 245 : 210;

  // Linea de baja: cero todo el trimestre.
  if (linea.inactiva) {
    return { cuota: 0, consumo: 0, comision: 0, impuesto: 0, importe: 0, cero: true };
  }

  // Un 12 % de ceros exactos; otro 8 % con consumo casi nulo (1-5 CUP).
  const dado = azar();
  if (dado < 0.12) {
    return { cuota: 0, consumo: 0, comision: 0, impuesto: 0, importe: 0, cero: true };
  }

  const factorMes = [1.0, 0.86, 1.18][indiceMes % 3];
  let consumo;
  if (dado < 0.2) {
    consumo = entero(1, 500) / 100; // 0.01 - 5.00
  } else if (dado < 0.75) {
    consumo = entero(15000, 40000) / 100; // 150 - 400
  } else {
    consumo = entero(40000, 90000) / 100; // 400 - 900
  }
  consumo = Math.round(consumo * factorMes * 100) / 100;

  // Algunas lineas solo tienen consumo y no cuota (lineas prepago).
  const cuota = azar() > 0.85 ? 0 : cuotaBase;
  const bruto = Math.round((cuota + consumo) * 100) / 100;
  const comision = Math.round(bruto * 0.15 * 100) / 100;
  // El importe del servicio es el bruto; el descuento comercial se resta despues
  // en el total de la factura (asi lo hace la factura real).
  const importe = Math.round((bruto + comision) * 100) / 100;

  return { cuota, consumo, comision, impuesto: 0, importe, cero: importe === 0 };
}
