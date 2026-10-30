import fs from "node:fs";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activarYGuardarBase, ErrorBaseActivaSinGuardar } from "../utils/seleccion-base.js";
import type { ServerResponse } from "node:http";
import {
  closeDb,
  connectMssqlRuntime,
  connectOracleRuntime,
  getDbMode,
  initDatabase,
} from "../models/database.js";
import {
  consumirTokenInstalacion,
  denegarConfigBd,
  evaluarAccesoConfigBd,
  hayUsuariosRegistrados,
  sendJson,
  readJsonBody,
} from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = process.env.SGF_ENV_FILE ? path.resolve(process.env.SGF_ENV_FILE) : path.resolve(__dirname, "../../.env");

type DbType = "oracle" | "mssql" | "sqlite";

type OracleConnectPayload = {
  type: "oracle";
  host: string;
  port: string;
  service: string;
  user: string;
  password: string;
};

type MssqlConnectPayload = {
  type: "mssql";
  server: string;
  port: string;
  database: string;
  user: string;
  password: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};

type TestPayload = OracleConnectPayload | MssqlConnectPayload;

function currentConfig() {
  return {
    dbType: String(process.env.DB_TYPE || getDbMode()).toLowerCase() || "sqlite",
    oracleUser: process.env.ORACLE_USER || "pcelular",
    oracleHost: process.env.ORACLE_HOST || "25",
    oraclePort: process.env.ORACLE_PORT || "1521",
    oracleService: process.env.ORACLE_SERVICE || "PCELULAR",
    mssqlUser: process.env.MSSQL_USER || "sa",
    mssqlServer: process.env.MSSQL_SERVER || "localhost",
    mssqlPort: process.env.MSSQL_PORT || "1433",
    mssqlDatabase: process.env.MSSQL_DATABASE || "sgf",
    mssqlEncrypt: String(process.env.MSSQL_ENCRYPT || "false").toLowerCase() === "true",
    mssqlTrustCert: String(process.env.MSSQL_TRUST_CERT || "true").toLowerCase() !== "false",
    httpPort: process.env.PORT || "3000",
    dbMode: getDbMode(),
  };
}

/** Prepara la configuración en el mismo directorio sin modificar la actual. */
function prepararEnvConfig(values: Record<string, string>) {
  const source = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const keys = new Set(Object.keys(values));
  const preserved = source.split(/\r?\n/).filter(line => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    return !match || !keys.has(match[1]);
  }).join("\n").replace(/\n+$/, "");
  const lines = Object.entries(values).map(([key,value]) => {
    if (/[\r\n]/.test(value)) throw new Error("La configuración no puede contener saltos de línea.");
    const options = [`'${value}'`, `"${value}"`, value];
    const encoded = options.find(candidate => dotenv.parse(`${key}=${candidate}`)[key] === value);
    if (encoded === undefined) throw new Error(`No se puede guardar el valor de ${key}; contiene caracteres incompatibles.`);
    return `${key}=${encoded}`;
  });
  const content = (preserved ? preserved + "\n" : "") + lines.join("\n") + "\n";
  fs.mkdirSync(path.dirname(ENV_PATH), {recursive:true});
  const staged = `${ENV_PATH}.tmp-${randomUUID()}`;
  fs.writeFileSync(staged, content, {encoding:"utf8", mode:0o600, flag:"wx"});
  return {
    commit() { fs.renameSync(staged, ENV_PATH); },
    limpiar() { try { fs.unlinkSync(staged); } catch {} },
  };
}

async function testOracle(config: OracleConnectPayload) {
  try {
    const oracledb = await import("oracledb");
    const conn = await oracledb.default.getConnection({
      user: config.user,
      password: config.password,
      connectString: `${config.host}:${config.port}/${config.service}`,
    });

    const tables = await conn.execute(
      `SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = 'PCELULAR' AND TABLE_NAME IN ('CARGARARCH','LINEA_TELEFONICA','PERSONA','PRESUPUESTO','UNIDAD','ORGANO','CARGO','GRADO','PROVINCIA','MUNICIPIO') ORDER BY TABLE_NAME`,
      [],
      { outFormat: oracledb.default.OUT_FORMAT_OBJECT },
    );

    await conn.close();
    return {
      success: true,
      message: "Conexion Oracle valida.",
      data: {
        type: "oracle" as const,
        host: config.host,
        port: config.port,
        service: config.service,
        user: config.user,
        latencyMs: 0,
        tables: (tables.rows || []).map((row: any) => row.TABLE_NAME),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error de conexion: ${error.message}`,
      data: {
        type: "oracle" as const,
        host: config.host,
        port: config.port,
        service: config.service,
        user: config.user,
        latencyMs: 0,
        tables: [] as string[],
      },
    };
  }
}

async function testMssql(config: MssqlConnectPayload) {
  try {
    const mssql = await import("mssql");
    // Soportar instancias tipo SERVIDOR\SQLEXPRESS - tedious necesita instanceName separado
    let serverName = config.server;
    let instanceName: string | undefined;
    if (serverName.includes("\\")) {
      const idx = serverName.indexOf("\\");
      instanceName = serverName.slice(idx + 1).trim();
      serverName = serverName.slice(0, idx).trim();
    }
    const pool = await new mssql.default.ConnectionPool({
      user: config.user,
      password: config.password,
      server: serverName,
      port: Number(config.port) || 1433,
      database: config.database,
      options: {
        encrypt: config.encrypt ?? false,
        trustServerCertificate: config.trustServerCertificate ?? true,
        instanceName: instanceName || undefined,
      } as any,
    }).connect();
    const started = Date.now();
    const result = await pool.request().query("SELECT 1 AS ok");
    const latency = Date.now() - started;
    const tables = await pool.request().query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE 'SGF[_]%' ORDER BY TABLE_NAME",
    );
    await pool.close();
    return {
      success: true,
      message: "Conexion SQL Server valida.",
      data: {
        type: "mssql" as const,
        server: config.server,
        port: config.port,
        database: config.database,
        user: config.user,
        latencyMs: latency,
        tables: (tables.recordset || []).map((row: any) => row.TABLE_NAME),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error de conexion: ${error.message}`,
      data: {
        type: "mssql" as const,
        server: config.server,
        port: config.port,
        database: config.database,
        user: config.user,
        latencyMs: 0,
        tables: [] as string[],
      },
    };
  }
}

export async function handleDbConfig(req: AuthenticatedRequest, res: ServerResponse) {
  // Antes respondia a CUALQUIERA con el host, puerto y usuario de Oracle/MSSQL.
  const acceso = await evaluarAccesoConfigBd(req, { installToken: String(req.headers["x-install-token"] || "") });
  if (!acceso.permitido) return denegarConfigBd(res, acceso);
  return sendJson(res, 200, { success: true, data: { config: currentConfig(), mode: getDbMode() } });
}

export async function handleDbTest(req: AuthenticatedRequest, res: ServerResponse) {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { success: false, error: "JSON invalido." });
  }

  // Esta ruta hacia que el SERVIDOR se conectase a cualquier host:puerto que le
  // pidiera un anonimo (sonda de la red interna / SSRF). Ahora exige admin o el
  // flujo de instalacion.
  const acceso = await evaluarAccesoConfigBd(req, body);
  if (!acceso.permitido) return denegarConfigBd(res, acceso);

  const type = (String(body.type || "oracle").toLowerCase()) as DbType;

  if (type === "mssql") {
    const config: MssqlConnectPayload = {
      type: "mssql",
      server: String(body.server || process.env.MSSQL_SERVER || "localhost").trim(),
      port: String(body.port || process.env.MSSQL_PORT || "1433").trim(),
      database: String(body.database || process.env.MSSQL_DATABASE || "sgf").trim(),
      user: String(body.user || process.env.MSSQL_USER || "sa").trim(),
      password: String(body.password ?? process.env.MSSQL_PASSWORD ?? ""),
      encrypt: body.encrypt !== undefined ? Boolean(body.encrypt) : undefined,
      trustServerCertificate: body.trustServerCertificate !== undefined ? Boolean(body.trustServerCertificate) : undefined,
    };
    return sendJson(res, 200, await testMssql(config));
  }

  // default: oracle
  const config: OracleConnectPayload = {
    type: "oracle",
    host: String(body.host || process.env.ORACLE_HOST || "25").trim(),
    port: String(body.port || process.env.ORACLE_PORT || "1521").trim(),
    service: String(body.service || process.env.ORACLE_SERVICE || "PCELULAR").trim(),
    user: String(body.user || process.env.ORACLE_USER || "pcelular").trim(),
    password: String(body.password ?? process.env.ORACLE_PASSWORD ?? "pcelular"),
  };
  return sendJson(res, 200, await testOracle(config));
}

export async function handleDbConnect(req: AuthenticatedRequest, res: ServerResponse) {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { success: false, error: "JSON invalido." });
  }

  // Escribe server/.env y cambia la BD en caliente: solo admin o instalacion.
  const acceso = await evaluarAccesoConfigBd(req, body);
  if (!acceso.permitido) return denegarConfigBd(res, acceso);
  if (await hayUsuariosRegistrados() && body.confirmarCambio !== true) {
    return sendJson(res, 409, {success:false, error:"Confirme el cambio de base: las cuentas y los datos son independientes y no se migrarán automáticamente."});
  }

  const type = (String(body.type || "oracle").toLowerCase()) as DbType;
  if (type !== "oracle" && type !== "mssql") return sendJson(res, 400, {success:false,error:"Seleccione Oracle o SQL Server."});

  try {
    if (type === "mssql") {
      const payload: MssqlConnectPayload = {
        type: "mssql",
        server: String(body.server || process.env.MSSQL_SERVER || "localhost").trim(),
        port: String(body.port || process.env.MSSQL_PORT || "1433").trim(),
        database: String(body.database || process.env.MSSQL_DATABASE || "sgf").trim(),
        user: String(body.user || process.env.MSSQL_USER || "sa").trim(),
        password: String(body.password ?? process.env.MSSQL_PASSWORD ?? ""),
        encrypt: body.encrypt !== undefined ? Boolean(body.encrypt) : undefined,
        trustServerCertificate: body.trustServerCertificate !== undefined ? Boolean(body.trustServerCertificate) : undefined,
      };
      const configPendiente = prepararEnvConfig({
        DB_TYPE: "mssql",
        MSSQL_SERVER: payload.server,
        MSSQL_PORT: payload.port,
        MSSQL_DATABASE: payload.database,
        MSSQL_USER: payload.user,
        MSSQL_PASSWORD: payload.password,
        MSSQL_ENCRYPT: String(payload.encrypt ?? false),
        MSSQL_TRUST_CERT: String(payload.trustServerCertificate ?? true),
      });
      try { await activarYGuardarBase(() => connectMssqlRuntime(payload), () => configPendiente.commit()); process.env.DB_TYPE = "mssql"; }
      finally { configPendiente.limpiar(); }
      return sendJson(res, 200, {
        success: true,
        message: `Conectado a SQL Server ${payload.server}/${payload.database}. Debe iniciar sesion nuevamente.`,
        data: {
          connected: true,
          mode: getDbMode(),
          config: currentConfig(),
        },
      });
    }

    // default: oracle
    const payload: OracleConnectPayload = {
      type: "oracle",
      host: String(body.host || process.env.ORACLE_HOST || "25").trim(),
      port: String(body.port || process.env.ORACLE_PORT || "1521").trim(),
      service: String(body.service || process.env.ORACLE_SERVICE || "PCELULAR").trim(),
      user: String(body.user || process.env.ORACLE_USER || "pcelular").trim(),
      password: String(body.password ?? process.env.ORACLE_PASSWORD ?? "pcelular"),
    };
    const configPendiente = prepararEnvConfig({
      DB_TYPE: "oracle",
      ORACLE_HOST: payload.host,
      ORACLE_PORT: payload.port,
      ORACLE_SERVICE: payload.service,
      ORACLE_USER: payload.user,
      ORACLE_PASSWORD: payload.password,
    });
    try { await activarYGuardarBase(() => connectOracleRuntime(payload), () => configPendiente.commit()); process.env.DB_TYPE = "oracle"; }
    finally { configPendiente.limpiar(); }
    return sendJson(res, 200, {
      success: true,
      message: `Conectado a Oracle ${payload.host}:${payload.port}/${payload.service}. Debe iniciar sesion nuevamente.`,
      data: {
        connected: true,
        mode: getDbMode(),
        config: currentConfig(),
      },
    });
  } catch (error: any) {
    if (error instanceof ErrorBaseActivaSinGuardar) {
      return sendJson(res, 500, {
        success: false,
        error: 'La conexión cambió temporalmente, pero no se pudo guardar la configuración. Deje de trabajar y reinicie el servidor para volver a la configuración anterior; revise permisos y espacio. No se migraron ni borraron los datos.',
        data: { modoActual: getDbMode(), configuracionGuardada: false, requiereReinicio: true },
      });
    }
    return sendJson(res, 500, {
      success: false,
      error: `No se pudo conectar (${type}): ${error.message}`,
    });
  }
}

export async function handleDbDisconnect(req: AuthenticatedRequest, res: ServerResponse) {
  let body: any = {};
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }

  // Antes un anonimo podia dejar la instalacion en SQLite (y "perder" Oracle).
  const acceso = await evaluarAccesoConfigBd(req, body);
  if (!acceso.permitido) return denegarConfigBd(res, acceso);
  if (await hayUsuariosRegistrados() && body.confirmarCambio !== true) {
    return sendJson(res, 409, {success:false, error:"Confirme el cambio de base: las cuentas y los datos son independientes y no se migrarán automáticamente."});
  }
  let faseCierre: 'no_iniciado' | 'en_curso' | 'completado' = 'no_iniciado';
  try {
    const configPendiente = prepararEnvConfig({ DB_TYPE: "sqlite" });
    const anterior = process.env.DB_TYPE;
    let result;
    try {
      process.env.DB_TYPE = "sqlite";
      // Se conservan los archivos de cada base. No se migran ni se borran.
      faseCierre = 'en_curso';
      await closeDb();
      faseCierre = 'completado';
      result = await initDatabase();
      configPendiente.commit();
    } catch (error) {
      if (anterior === undefined) delete process.env.DB_TYPE; else process.env.DB_TYPE = anterior;
      throw error;
    } finally { configPendiente.limpiar(); }
    return sendJson(res, 200, {
      success: true,
      message: "Desconectado de BD enterprise, ahora en SQLite local.",
      data: { mode: result.mode, config: currentConfig() },
    });
  } catch (error: any) {
    if (faseCierre === 'en_curso') return sendJson(res, 500, {
      success: false,
      error: 'No se confirmó el guardado antes del cambio. Podría haber cambios solo en memoria: no cierre ni reinicie el servidor. Revise espacio y permisos y vuelva a intentar el guardado.',
      data: { guardadoNoConfirmado: true },
    });
    if (faseCierre === 'completado') return sendJson(res, 500, {
      success: false,
      error: 'El cambio a SQLite no se completó y la conexión anterior se cerró. Deje de trabajar y reinicie el servidor; no se han migrado ni borrado las bases.',
      data: { requiereReinicio: true },
    });
    return sendJson(res, 500, { success: false, error: `No se pudo desconectar: ${error.message}` });
  }
}

