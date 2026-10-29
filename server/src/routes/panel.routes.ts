import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJsonBody, sendJson } from "../middleware/auth.js";
import { safeVerifyToken } from "../utils/jwt.js";
import { esConsolaLocal, esPeticionLocal, tokenConsolaConfigurado } from "../middleware/local.js";
import { esInstalacionNueva } from "../middleware/auth.js";
import { getDbMode, pingDb, query, flushParaCopia } from "../models/database.js";

/**
 * Panel de control de la consola de escritorio (app Flutter).
 *
 * Solo responde a peticiones de ESTE equipo (loopback) y, salvo el diagnostico
 * basico, exige el token de consola. Devuelve todo lo que la aplicacion necesita
 * para pintar el panel sin hablar con la base de datos directamente.
 */

const INICIO = Date.now();

/**
 * Las rutas del panel exigen el token de consola cuando el servidor se ha
 * arrancado desde la aplicacion. Si el servidor se arranco a mano (sin token
 * configurado), basta con ser una peticion de este equipo.
 */
function guardiaPanel(req: IncomingMessage, res: ServerResponse): boolean {
  if (!esPeticionLocal(req)) {
    sendJson(res, 403, { success: false, error: "El panel solo responde en este equipo." });
    return false;
  }
  if (tokenConsolaConfigurado() && !esConsolaLocal(req)) {
    sendJson(res, 403, { success: false, error: "Falta el token de la consola local." });
    return false;
  }
  return true;
}

/** ¿La petición trae una sesión de administrador válida? */
async function esAdministrador(req: IncomingMessage): Promise<boolean> {
  try {
    const cabecera = String(req.headers.authorization || "");
    if (!cabecera.startsWith("Bearer ")) return false;
    const usuario = safeVerifyToken(cabecera.slice(7));
    return Boolean(usuario && usuario.role === "admin");
  } catch {
    return false;
  }
}

function carpetas() {
  const datos = process.env.SGF_DATA_DIR ? path.resolve(process.env.SGF_DATA_DIR) : "";
  const env = process.env.SGF_ENV_FILE ? path.resolve(process.env.SGF_ENV_FILE) : "";
  return { datos, env };
}

function tamanoCarpeta(dir: string): { bytes: number; archivos: number } {
  let bytes = 0;
  let archivos = 0;
  try {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        const sub = tamanoCarpeta(completo);
        bytes += sub.bytes;
        archivos += sub.archivos;
      } else if (entrada.isFile()) {
        bytes += fs.statSync(completo).size;
        archivos += 1;
      }
    }
  } catch {
    // carpeta inexistente o sin permisos
  }
  return { bytes, archivos };
}

export async function handlePanelEstado(req: IncomingMessage, res: ServerResponse) {
  if (!guardiaPanel(req, res)) return;

  const ping = await pingDb();
  const { datos, env } = carpetas();
  const disco = tamanoCarpeta(datos);

  let usuarios = 0;
  let facturas = 0;
  let servicios = 0;
  let lineasExcel = 0;
  try {
    const [u] = await query<any>("SELECT COUNT(*) AS CNT FROM SGF_USUARIOS");
    const [f] = await query<any>("SELECT COUNT(*) AS CNT FROM SGF_FACTURAS");
    const [s] = await query<any>("SELECT COUNT(*) AS CNT FROM SGF_SERVICIOS");
    usuarios = Number(u?.CNT ?? u?.cnt ?? 0);
    facturas = Number(f?.CNT ?? f?.cnt ?? 0);
    servicios = Number(s?.CNT ?? s?.cnt ?? 0);
  } catch {
    // tablas aun sin crear
  }
  try {
    const [l] = await query<any>("SELECT COUNT(*) AS CNT FROM SGF_LINEAS_IMPORTADAS");
    lineasExcel = Number(l?.CNT ?? l?.cnt ?? 0);
  } catch {
    lineasExcel = 0;
  }

  let ultimaCopia: string | null = null;
  try {
    const copias = fs
      .readdirSync(datos)
      .filter((f) => f.startsWith("copia-") && f.endsWith(".db"))
      .map((f) => ({ f, t: fs.statSync(path.join(datos, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    ultimaCopia = copias[0]?.f ?? null;
  } catch {
    ultimaCopia = null;
  }

  return sendJson(res, 200, {
    success: true,
    data: {
      version: "4.0.0",
      pid: process.pid,
      uptimeSegundos: Math.round((Date.now() - INICIO) / 1000),
      puerto: Number(process.env.PORT) || 3000,
      modoBd: getDbMode(),
      bd: ping,
      consolaHabilitada: tokenConsolaConfigurado(),
      contadores: { usuarios, facturas, servicios, lineasExcel },
      disco: { carpetaDatos: datos, archivoEnv: env, bytes: disco.bytes, archivos: disco.archivos },
      ultimaCopia,
      equipo: { nombre: os.hostname(), plataforma: `${os.platform()} ${os.release()}` },
      memoriaMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  });
}

/** Copia de seguridad de la base SQLite (solo en modo sqlite y solo en este equipo). */
export async function handlePanelCopia(req: IncomingMessage, res: ServerResponse) {
  if (!guardiaPanel(req, res)) return;
  if (getDbMode() !== "sqlite") {
    return sendJson(res, 400, {
      success: false,
      error: "La copia automatica solo esta disponible en modo SQLite. En Oracle/SQL Server use las herramientas del servidor.",
    });
  }

  const { datos } = carpetas();
  if (!datos) return sendJson(res, 400, { success: false, error: "No se ha definido la carpeta de datos." });

  const origen = path.join(datos, "sgf-data.db");
  if (!fs.existsSync(origen)) {
    return sendJson(res, 404, { success: false, error: "Todavia no existe la base de datos." });
  }

  const marca = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const destino = path.join(datos, `copia-${marca}.db`);
  try {
    // Solo se copia después de persistir correctamente la versión en memoria.
    if (!flushParaCopia()) throw new Error("La base está ocupada o no se pudo guardar; reintente la copia.");
    fs.copyFileSync(origen, destino);

    // Se conservan las 10 copias mas recientes.
    const copias = fs
      .readdirSync(datos)
      .filter((f) => f.startsWith("copia-") && f.endsWith(".db"))
      .map((f) => ({ f, t: fs.statSync(path.join(datos, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const vieja of copias.slice(10)) {
      try {
        fs.unlinkSync(path.join(datos, vieja.f));
      } catch {
        // ignora
      }
    }

    return sendJson(res, 200, {
      success: true,
      message: `Copia creada: ${path.basename(destino)}`,
      data: { archivo: path.basename(destino), bytes: fs.statSync(destino).size },
    });
  } catch (error: any) {
    return sendJson(res, 500, { success: false, error: `No se pudo crear la copia: ${error.message}` });
  }
}

/** Datos para el asistente de primera vez: ¿ya hay algo configurado? */
export async function handlePanelBienvenida(req: IncomingMessage, res: ServerResponse) {
  if (!guardiaPanel(req, res)) return;
  const { datos, env } = carpetas();
  const dbFile = datos ? path.join(datos, "sgf-data.db") : "";
  const existeBd = dbFile ? fs.existsSync(dbFile) : false;

  let usuarios = 0;
  try {
    const [u] = await query<any>("SELECT COUNT(*) AS CNT FROM SGF_USUARIOS");
    usuarios = Number(u?.CNT ?? u?.cnt ?? 0);
  } catch {
    usuarios = 0;
  }

  return sendJson(res, 200, {
    success: true,
    data: {
      modoBd: getDbMode(),
      existeBd,
      archivoBd: dbFile,
      archivoEnv: env,
      hayEnv: Boolean(env && fs.existsSync(env)),
      usuarios,
      // Pista para el asistente de primera vez: no hay base de datos o solo
      // existe el administrador por defecto (nadie ha configurado nada aun).
      primeraVez: !existeBd || usuarios === 0 || (await esInstalacionNueva()),
    },
  });
}

/**
 * Ajustes de facturación: cuántas facturas por mes se esperan y cómo va cada mes.
 *
 * GET  /api/panel/periodos           → configuración + últimos meses con su avance
 * POST /api/panel/periodos {facturasPorMes} → guarda la preferencia en el .env
 *
 * Lo normal son 2 facturas por mes (primera y segunda quincena), pero se puede
 * poner 1, 3, 4, 6… sin tocar código.
 */
export async function handlePanelPeriodos(req: IncomingMessage, res: ServerResponse) {
  if (!guardiaPanel(req, res)) return;
  // Cambiar la configuración requiere ser administrador: o bien la app instalada
  // (que trae el token de consola) o bien una sesión de administrador real.
  // Así no lo puede cambiar cualquiera desde una pestaña del navegador.
  if (req.method === "POST" && !esConsolaLocal(req) && !(await esAdministrador(req))) {
    return sendJson(res, 403, {
      success: false,
      error: "Solo un administrador puede cambiar el número de facturas por mes.",
    });
  }
  const { env } = carpetas();

  const leerPreferencia = (): number => {
    const deEntorno = Number(process.env.FACTURAS_POR_MES);
    if (Number.isFinite(deEntorno) && deEntorno >= 1 && deEntorno <= 50) return Math.floor(deEntorno);
    try {
      if (env && fs.existsSync(env)) {
        const linea = fs.readFileSync(env, "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("FACTURAS_POR_MES="));
        if (linea) {
          const n = Number(linea.split("=")[1]?.trim());
          if (Number.isFinite(n) && n >= 1 && n <= 50) return Math.floor(n);
        }
      }
    } catch {
      // si no se puede leer el .env se usa el valor por defecto
    }
    return 2;
  };

  if (req.method === "POST") {
    const cuerpo: any = await readJsonBody(req).catch(() => null);
    const n = Number(cuerpo?.facturasPorMes);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      return sendJson(res, 400, {
        success: false,
        error: "El número de facturas por mes debe estar entre 1 y 50.",
      });
    }
    try {
      let lineas: string[] = [];
      if (env && fs.existsSync(env)) lineas = fs.readFileSync(env, "utf8").split(/\r?\n/);
      const indice = lineas.findIndex((l) => l.trim().startsWith("FACTURAS_POR_MES="));
      if (indice >= 0) lineas[indice] = `FACTURAS_POR_MES=${Math.floor(n)}`;
      else lineas.push(`FACTURAS_POR_MES=${Math.floor(n)}`);
      if (env) fs.writeFileSync(env, lineas.join("\n"));
      process.env.FACTURAS_POR_MES = String(Math.floor(n));
      return sendJson(res, 200, {
        success: true,
        message: `Listo: se esperan ${Math.floor(n)} factura(s) por mes. Se aplica desde ya.`,
        data: { facturasPorMes: Math.floor(n), guardadoEn: env || "(solo en memoria)" },
      });
    } catch (error: any) {
      return sendJson(res, 500, {
        success: false,
        error: `No se pudo guardar la preferencia: ${error.message}`,
      });
    }
  }

  // GET: preferencia + situación de los últimos meses
  const facturasPorMes = leerPreferencia();
  let meses: Array<{ periodo: string; facturas: number; esperadas: number; completa: boolean }> = [];
  try {
    const filas = await query<any>(
      `SELECT PERIODO_CLAVE, COUNT(*) AS CUANTAS FROM SGF_FACTURAS
       WHERE PERIODO_CLAVE IS NOT NULL AND PERIODO_CLAVE <> ''
       GROUP BY PERIODO_CLAVE ORDER BY PERIODO_CLAVE DESC LIMIT 12`,
    );
    meses = filas.map((f) => {
      const cuantas = Number(f?.CUANTAS ?? f?.cuantas ?? 0);
      return {
        periodo: String(f?.PERIODO_CLAVE ?? f?.periodo_clave ?? ""),
        facturas: cuantas,
        esperadas: facturasPorMes,
        completa: cuantas >= facturasPorMes,
      };
    });
  } catch {
    meses = [];
  }

  return sendJson(res, 200, {
    success: true,
    data: { facturasPorMes, meses },
  });
}

/** Marca de vida para que la app sepa que el servidor responde y con que identidad. */
export async function handlePanelPing(req: IncomingMessage, res: ServerResponse) {
  if (!esPeticionLocal(req)) {
    return sendJson(res, 403, { success: false, error: "Solo en este equipo." });
  }
  return sendJson(res, 200, {
    success: true,
    data: { servicio: "sgf-consola", consolaHabilitada: tokenConsolaConfigurado(), pid: process.pid },
  });
}
