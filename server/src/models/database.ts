import initSqlJs, { type Database as SqlJsDb } from "sql.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// La aplicacion de escritorio pasa SGF_DATA_DIR para guardar la base de datos en
// una carpeta de usuario escribible (p. ej. %LOCALAPPDATA%\SGF\datos), en lugar
// de una subcarpeta de la instalacion (que puede ser de solo lectura).
export const DATA_DIR = process.env.SGF_DATA_DIR
  ? path.resolve(process.env.SGF_DATA_DIR)
  : path.resolve(__dirname, "../../../server-data");
const DB_PATH = path.join(DATA_DIR, "sgf-data.db");

type DbMode = "mssql" | "oracle" | "sqlite";

let db: SqlJsDb | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let batchDepth = 0;
let oraclePool: any = null;
let mssqlPool: any = null;
let mssqlDriver: any = null;
let mode: DbMode = "sqlite";

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Guarda la BD SQLite en disco de forma ATOMICA: se escribe un fichero
 * temporal en el mismo directorio y se renombra encima del original.
 * Un corte de luz a mitad de escritura deja intacta la version anterior.
 */
function saveDisk(): boolean {
  if (!db) return false;
  if (activeTransactions > 0) { scheduleSave(); return false; }
  const tmpPath = `${DB_PATH}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, Buffer.from(db.export()));
    fs.renameSync(tmpPath, DB_PATH);
    return true;
  } catch (error: any) {
    console.error("[SGF] Error guardando SQLite:", error.message);
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    return false;
  }
}

function scheduleSave(delayMs = 1000) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDisk, delayMs);
}

/**
 * Ejecuta las escrituras pendientes AHORA, sin esperar al temporizador.
 * Se llama al terminar una importacion masiva y al cerrar el servidor.
 */
export function flushDisk(): boolean {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  return saveDisk();
}

/** Evita copiar una base a medio importar o dentro de una transacción. */
export function flushParaCopia(): boolean {
  if (batchDepth > 0 || activeTransactions > 0) return false;
  return flushDisk();
}

/**
 * Ejecuta un bloque de escrituras manteniendo los datos solo en memoria y
 * guardando en disco UNA sola vez al final. Sin esto, una importacion de N
 * filas dejaba el guardado pendiente (1 s) y un corte perdia todo el lote;
 * ademas db.export() se disparaba en cada fila en modo normal.
 */
export async function conGuardadoFinal<T>(fn: () => Promise<T>): Promise<T> {
  if (mode !== "sqlite") return fn();
  batchDepth += 1;
  try {
    return await fn();
  } finally {
    batchDepth -= 1;
    flushDisk();
  }
}

const SQLITE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS PCELULAR_CARGARARCH (NUMERO TEXT, CUOTA TEXT, CONSUMO TEXT, COMISION TEXT, IMPUESTO TEXT, IMPORTE TEXT, TIRA TEXT, FECHA_PARTE TEXT)`,
  `CREATE TABLE IF NOT EXISTS PCELULAR_PRESUPUESTO (NUMERO INTEGER, FECHA TEXT, CONSUMO REAL, CUOTA REAL, COMISION REAL, IMPUESTO REAL, IMPORTE REAL)`,
  `CREATE TABLE IF NOT EXISTS PCELULAR_LINEA_TELEFONICA (NUMERO INTEGER PRIMARY KEY, FECHAACTUALIZACION TEXT, PIN TEXT, PUK TEXT, ASIGNACIONVOZ INTEGER, ASIGNACIONSMS INTEGER, INTERNET INTEGER, PUBLICO INTEGER, ESTADO INTEGER, MMS INTEGER, IDENTID TEXT, COD_MUNICIPIO TEXT, COD_UNIDAD TEXT, COD_CARGO TEXT)`,
  `CREATE TABLE IF NOT EXISTS PCELULAR_PERSONA (INDENTID TEXT PRIMARY KEY, COD_CARGO TEXT, COD_GRADO TEXT, NOMBRE TEXT, NOMBRE2 TEXT, APELL1 TEXT, APELL2 TEXT, COD_UNIDAD TEXT)`,
  `CREATE TABLE IF NOT EXISTS PCELULAR_PROVINCIA (COD_PROVINCIA TEXT PRIMARY KEY, PROVINCIA_D TEXT)`,
  `CREATE TABLE IF NOT EXISTS PCELULAR_MUNICIPIO (COD_MUNICIPIO TEXT PRIMARY KEY, NOMBRE_M TEXT, COD_PROVINCIA TEXT)`,
  `CREATE TABLE IF NOT EXISTS PCELULAR_ORGANO (COD_ORGANO TEXT PRIMARY KEY, ORGANO TEXT)`,
  `CREATE TABLE IF NOT EXISTS PCELULAR_UNIDAD (COD_UNIDAD TEXT PRIMARY KEY, UNIDAD TEXT, COD_ORGANO TEXT)`,
  `CREATE TABLE IF NOT EXISTS PCELULAR_CARGO (COD_CARGO TEXT PRIMARY KEY, CARGO TEXT, COD_UNIDAD TEXT)`,
  `CREATE TABLE IF NOT EXISTS PCELULAR_GRADO (COD_GRADO TEXT PRIMARY KEY, GRADO_D TEXT)`,
  `CREATE TABLE IF NOT EXISTS PCELULAR_TELEFONO_ASIGNADO (IMEI TEXT, TARGETASD INTEGER, ESTUCHE INTEGER, MARCA TEXT, MODELO TEXT, NUMERO INTEGER PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS SGF_USUARIOS (ID TEXT PRIMARY KEY, USERNAME TEXT UNIQUE, NOMBRE TEXT, ROL TEXT DEFAULT 'usuario', PASSWORD_HASH TEXT, ACTIVO INTEGER DEFAULT 1, CREADO TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS SGF_SESIONES (ID TEXT PRIMARY KEY, USER_ID TEXT, TOKEN TEXT UNIQUE, MAQUINA TEXT, IP TEXT, ACTIVO INTEGER DEFAULT 1, CREADO TEXT DEFAULT (datetime('now')), EXPIRA TEXT)`,
  `CREATE TABLE IF NOT EXISTS SGF_LOGS (ID TEXT PRIMARY KEY, USER_ID TEXT, ACCION TEXT, ENTIDAD TEXT, ENTIDAD_ID TEXT, NIVEL TEXT DEFAULT 'info', DETALLES TEXT, IP TEXT, CREADO TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS SGF_FACTURAS (
      ID TEXT PRIMARY KEY,
      CLIENTE TEXT NOT NULL,
      CUENTA TEXT,
      NUMERO_CLIENTE TEXT,
      NUMERO_CUENTA TEXT,
      NO_FACTURA TEXT,
      FECHA_EMISION TEXT,
      FECHA_VENCIMIENTO TEXT,
      PERIODO_CONSUMO TEXT,
      PERIODO_CLAVE TEXT,
      PERIODO_PARTE INTEGER,
      CODIGO_PAGO TEXT,
      MONEDA TEXT DEFAULT 'CUP',
      NIT TEXT,
      CUOTA REAL DEFAULT 0,
      CONSUMO REAL DEFAULT 0,
      COMISION REAL DEFAULT 0,
      IMPUESTO REAL DEFAULT 0,
      TOTAL REAL DEFAULT 0,
      TOTAL_PAGAR REAL DEFAULT 0,
      ESTADO TEXT DEFAULT 'pendiente',
      PARSER TEXT,
      OCR_CONFIDENCE REAL DEFAULT 0,
      OCR_DURATION INTEGER DEFAULT 0,
      ARCHIVO TEXT,
      TEXTO_OCR TEXT,
      USER_ID TEXT NOT NULL,
      CREATED_AT TEXT DEFAULT (datetime('now')),
      UPDATED_AT TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS SGF_SERVICIOS (
      ID TEXT PRIMARY KEY,
      FACTURA_ID TEXT NOT NULL,
      NUMERO_SERVICIO TEXT NOT NULL,
      CUOTA REAL DEFAULT 0,
      CONSUMO REAL DEFAULT 0,
      COMISION REAL DEFAULT 0,
      IMPUESTO REAL DEFAULT 0,
      IMPORTE REAL DEFAULT 0
    )`,
  `CREATE TABLE IF NOT EXISTS SGF_LINEAS_IMPORTADAS (
      ID TEXT PRIMARY KEY,
      NUMERO TEXT,
      ASIGNACION_VOZ TEXT,
      ASIGNACION_SMS TEXT,
      TIPO_TELEFONO TEXT,
      ESTRUCTURA TEXT,
      PROVINCIA TEXT,
      MUNICIPIO TEXT,
      ORGANO TEXT,
      UNIDAD TEXT,
      UBICACION TEXT,
      CARGO TEXT,
      USUARIO_PUESTO TEXT,
      GRADO TEXT,
      ESTADO TEXT,
      MARCA TEXT,
      MODELO TEXT,
      TARJETA_SD TEXT,
      PUBLICO TEXT,
      ESTUCHE TEXT,
      PIN TEXT,
      PUK TEXT,
      IMEI TEXT,
      MMS TEXT,
      INTERNET TEXT,
      FECHA_ACTUALIZACION TEXT,
      USER_ID TEXT,
      CREATED_AT TEXT DEFAULT (datetime('now'))
    )`,
];


const ORACLE_SCHEMA_TABLES = [
  `CREATE TABLE SGF_USUARIOS (ID VARCHAR2(36) PRIMARY KEY, USERNAME VARCHAR2(50) NOT NULL UNIQUE, NAME VARCHAR2(200) NOT NULL, ROLE VARCHAR2(20) DEFAULT 'usuario' NOT NULL, PASSWORD_HASH VARCHAR2(255) NOT NULL, ACTIVE NUMBER(1) DEFAULT 1 NOT NULL, CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)`,
  `CREATE TABLE SGF_FACTURAS (ID VARCHAR2(36) PRIMARY KEY, CLIENTE VARCHAR2(500) NOT NULL, CUENTA VARCHAR2(500), NUMERO_CLIENTE VARCHAR2(50), NUMERO_CUENTA VARCHAR2(50), NO_FACTURA VARCHAR2(50), FECHA_EMISION VARCHAR2(30), FECHA_VENCIMIENTO VARCHAR2(30), PERIODO_CONSUMO VARCHAR2(60), PERIODO_CLAVE VARCHAR2(20), PERIODO_PARTE NUMBER(3), CODIGO_PAGO VARCHAR2(30), MONEDA VARCHAR2(10) DEFAULT 'CUP', NIT VARCHAR2(30), CUOTA NUMBER(18,4) DEFAULT 0, CONSUMO NUMBER(18,4) DEFAULT 0, COMISION NUMBER(18,4) DEFAULT 0, IMPUESTO NUMBER(18,4) DEFAULT 0, TOTAL NUMBER(18,4) DEFAULT 0, TOTAL_PAGAR NUMBER(18,4) DEFAULT 0, ESTADO VARCHAR2(20) DEFAULT 'pendiente', PARSER VARCHAR2(80), OCR_CONFIDENCE NUMBER(5,2) DEFAULT 0, OCR_DURATION NUMBER(10) DEFAULT 0, ARCHIVO VARCHAR2(500), TEXTO_OCR CLOB, USER_ID VARCHAR2(36) NOT NULL, CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)`,
  `CREATE TABLE SGF_SERVICIOS (ID VARCHAR2(36) PRIMARY KEY, FACTURA_ID VARCHAR2(36) NOT NULL, NUMERO_SERVICIO VARCHAR2(50) NOT NULL, CUOTA NUMBER(18,4) DEFAULT 0, CONSUMO NUMBER(18,4) DEFAULT 0, COMISION NUMBER(18,4) DEFAULT 0, IMPUESTO NUMBER(18,4) DEFAULT 0, IMPORTE NUMBER(18,4) DEFAULT 0)`,
  `CREATE TABLE SGF_LOGS (ID VARCHAR2(36) PRIMARY KEY, USER_ID VARCHAR2(36), ACCION VARCHAR2(100) NOT NULL, ENTIDAD VARCHAR2(100), ENTIDAD_ID VARCHAR2(36), LEVEL VARCHAR2(10) DEFAULT 'info', DETALLES VARCHAR2(4000), IP_ADDRESS VARCHAR2(50), CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)`,
  `CREATE TABLE SGF_SESIONES (ID VARCHAR2(36) PRIMARY KEY, USER_ID VARCHAR2(36) NOT NULL, SESSION_TOKEN VARCHAR2(512) NOT NULL UNIQUE, MACHINE_ID VARCHAR2(200), IP_ADDRESS VARCHAR2(50), ACTIVE NUMBER(1) DEFAULT 1, CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, EXPIRES_AT TIMESTAMP NOT NULL, ENDED_AT TIMESTAMP)`,
  `CREATE TABLE SGF_LINEAS_IMPORTADAS (ID VARCHAR2(36) PRIMARY KEY, NUMERO VARCHAR2(50), ASIGNACION_VOZ VARCHAR2(50), ASIGNACION_SMS VARCHAR2(50), TIPO_TELEFONO VARCHAR2(100), ESTRUCTURA VARCHAR2(200), PROVINCIA VARCHAR2(100), MUNICIPIO VARCHAR2(100), ORGANO VARCHAR2(100), UNIDAD VARCHAR2(100), UBICACION VARCHAR2(200), CARGO VARCHAR2(100), USUARIO_PUESTO VARCHAR2(200), GRADO VARCHAR2(100), ESTADO VARCHAR2(50), MARCA VARCHAR2(100), MODELO VARCHAR2(100), TARJETA_SD VARCHAR2(20), PUBLICO VARCHAR2(20), ESTUCHE VARCHAR2(20), PIN VARCHAR2(20), PUK VARCHAR2(50), IMEI VARCHAR2(100), MMS VARCHAR2(20), INTERNET VARCHAR2(20), FECHA_ACTUALIZACION VARCHAR2(50), USER_ID VARCHAR2(36), CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)`
];

const ORACLE_SCHEMA_INDEXES = [
  `CREATE INDEX IDX_FACTURAS_USER_ID ON SGF_FACTURAS(USER_ID)`,
  `CREATE INDEX IDX_FACTURAS_ESTADO ON SGF_FACTURAS(ESTADO)`,
  `CREATE INDEX IDX_FACTURAS_NO_FACTURA ON SGF_FACTURAS(NO_FACTURA)`,
  `CREATE INDEX IDX_FACTURAS_PERIODO ON SGF_FACTURAS(PERIODO_CLAVE)`,
  `CREATE INDEX IDX_FACTURAS_CREATED_AT ON SGF_FACTURAS(CREATED_AT)`,
  `CREATE INDEX IDX_SERVICIOS_FACTURA_ID ON SGF_SERVICIOS(FACTURA_ID)`,
  `CREATE INDEX IDX_LOGS_USER_ID ON SGF_LOGS(USER_ID)`,
  `CREATE INDEX IDX_LOGS_CREATED_AT ON SGF_LOGS(CREATED_AT)`,
  `CREATE INDEX IDX_SESIONES_USER_ID ON SGF_SESIONES(USER_ID)`,
  `CREATE INDEX IDX_SESIONES_TOKEN ON SGF_SESIONES(SESSION_TOKEN)`,
  `CREATE INDEX IDX_LINEAS_NUMERO ON SGF_LINEAS_IMPORTADAS(NUMERO)`,
  `CREATE INDEX IDX_LINEAS_IMEI ON SGF_LINEAS_IMPORTADAS(IMEI)`
];

const MSSQL_SCHEMA_TABLES = [
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SGF_USUARIOS' AND xtype='U') CREATE TABLE SGF_USUARIOS (ID NVARCHAR(36) PRIMARY KEY, USERNAME NVARCHAR(50) NOT NULL UNIQUE, NAME NVARCHAR(200) NOT NULL, ROLE NVARCHAR(20) NOT NULL DEFAULT 'usuario', PASSWORD_HASH NVARCHAR(255) NOT NULL, ACTIVE BIT NOT NULL DEFAULT 1, CREATED_AT DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), UPDATED_AT DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SGF_FACTURAS' AND xtype='U') CREATE TABLE SGF_FACTURAS (ID NVARCHAR(36) PRIMARY KEY, CLIENTE NVARCHAR(500) NOT NULL, CUENTA NVARCHAR(500) NULL, NUMERO_CLIENTE NVARCHAR(50) NULL, NUMERO_CUENTA NVARCHAR(50) NULL, NO_FACTURA NVARCHAR(50) NULL, FECHA_EMISION NVARCHAR(30) NULL, FECHA_VENCIMIENTO NVARCHAR(30) NULL, PERIODO_CONSUMO NVARCHAR(60) NULL, PERIODO_CLAVE NVARCHAR(20) NULL, PERIODO_PARTE INT NULL, CODIGO_PAGO NVARCHAR(30) NULL, MONEDA NVARCHAR(10) NOT NULL DEFAULT 'CUP', NIT NVARCHAR(30) NULL, CUOTA DECIMAL(18,4) NOT NULL DEFAULT 0, CONSUMO DECIMAL(18,4) NOT NULL DEFAULT 0, COMISION DECIMAL(18,4) NOT NULL DEFAULT 0, IMPUESTO DECIMAL(18,4) NOT NULL DEFAULT 0, TOTAL DECIMAL(18,4) NOT NULL DEFAULT 0, TOTAL_PAGAR DECIMAL(18,4) NOT NULL DEFAULT 0, ESTADO NVARCHAR(20) NOT NULL DEFAULT 'pendiente', PARSER NVARCHAR(80) NULL, OCR_CONFIDENCE DECIMAL(5,2) NOT NULL DEFAULT 0, OCR_DURATION INT NOT NULL DEFAULT 0, ARCHIVO NVARCHAR(500) NULL, TEXTO_OCR NVARCHAR(MAX) NULL, USER_ID NVARCHAR(36) NOT NULL, CREATED_AT DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), UPDATED_AT DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SGF_SERVICIOS' AND xtype='U') CREATE TABLE SGF_SERVICIOS (ID NVARCHAR(36) PRIMARY KEY, FACTURA_ID NVARCHAR(36) NOT NULL, NUMERO_SERVICIO NVARCHAR(50) NOT NULL, CUOTA DECIMAL(18,4) NOT NULL DEFAULT 0, CONSUMO DECIMAL(18,4) NOT NULL DEFAULT 0, COMISION DECIMAL(18,4) NOT NULL DEFAULT 0, IMPUESTO DECIMAL(18,4) NOT NULL DEFAULT 0, IMPORTE DECIMAL(18,4) NOT NULL DEFAULT 0)`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SGF_LOGS' AND xtype='U') CREATE TABLE SGF_LOGS (ID NVARCHAR(36) PRIMARY KEY, USER_ID NVARCHAR(36) NULL, ACCION NVARCHAR(100) NOT NULL, ENTIDAD NVARCHAR(100) NULL, ENTIDAD_ID NVARCHAR(36) NULL, LEVEL NVARCHAR(10) NOT NULL DEFAULT 'info', DETALLES NVARCHAR(MAX) NULL, IP_ADDRESS NVARCHAR(50) NULL, CREATED_AT DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SGF_SESIONES' AND xtype='U') CREATE TABLE SGF_SESIONES (ID NVARCHAR(36) PRIMARY KEY, USER_ID NVARCHAR(36) NOT NULL, SESSION_TOKEN NVARCHAR(512) NOT NULL UNIQUE, MACHINE_ID NVARCHAR(200) NULL, IP_ADDRESS NVARCHAR(50) NULL, ACTIVE BIT NOT NULL DEFAULT 1, CREATED_AT DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), EXPIRES_AT DATETIME2 NOT NULL, ENDED_AT DATETIME2 NULL)`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SGF_LINEAS_IMPORTADAS' AND xtype='U') CREATE TABLE SGF_LINEAS_IMPORTADAS (ID NVARCHAR(36) PRIMARY KEY, NUMERO NVARCHAR(50) NULL, ASIGNACION_VOZ NVARCHAR(50) NULL, ASIGNACION_SMS NVARCHAR(50) NULL, TIPO_TELEFONO NVARCHAR(100) NULL, ESTRUCTURA NVARCHAR(200) NULL, PROVINCIA NVARCHAR(100) NULL, MUNICIPIO NVARCHAR(100) NULL, ORGANO NVARCHAR(100) NULL, UNIDAD NVARCHAR(100) NULL, UBICACION NVARCHAR(200) NULL, CARGO NVARCHAR(100) NULL, USUARIO_PUESTO NVARCHAR(200) NULL, GRADO NVARCHAR(100) NULL, ESTADO NVARCHAR(50) NULL, MARCA NVARCHAR(100) NULL, MODELO NVARCHAR(100) NULL, TARJETA_SD NVARCHAR(20) NULL, PUBLICO NVARCHAR(20) NULL, ESTUCHE NVARCHAR(20) NULL, PIN NVARCHAR(20) NULL, PUK NVARCHAR(50) NULL, IMEI NVARCHAR(100) NULL, MMS NVARCHAR(20) NULL, INTERNET NVARCHAR(20) NULL, FECHA_ACTUALIZACION NVARCHAR(50) NULL, USER_ID NVARCHAR(36) NULL, CREATED_AT DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())`
];

const MSSQL_SCHEMA_INDEXES = [
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_FACTURAS_USER_ID') CREATE INDEX IDX_FACTURAS_USER_ID ON SGF_FACTURAS(USER_ID)`,
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_FACTURAS_ESTADO') CREATE INDEX IDX_FACTURAS_ESTADO ON SGF_FACTURAS(ESTADO)`,
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_FACTURAS_NO_FACTURA') CREATE INDEX IDX_FACTURAS_NO_FACTURA ON SGF_FACTURAS(NO_FACTURA)`,
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_FACTURAS_CREATED_AT') CREATE INDEX IDX_FACTURAS_CREATED_AT ON SGF_FACTURAS(CREATED_AT)`,
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_SERVICIOS_FACTURA_ID') CREATE INDEX IDX_SERVICIOS_FACTURA_ID ON SGF_SERVICIOS(FACTURA_ID)`,
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_LOGS_USER_ID') CREATE INDEX IDX_LOGS_USER_ID ON SGF_LOGS(USER_ID)`,
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_LOGS_CREATED_AT') CREATE INDEX IDX_LOGS_CREATED_AT ON SGF_LOGS(CREATED_AT)`,
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_SESIONES_USER_ID') CREATE INDEX IDX_SESIONES_USER_ID ON SGF_SESIONES(USER_ID)`,
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_SESIONES_TOKEN') CREATE INDEX IDX_SESIONES_TOKEN ON SGF_SESIONES(SESSION_TOKEN)`,
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_LINEAS_NUMERO') CREATE INDEX IDX_LINEAS_NUMERO ON SGF_LINEAS_IMPORTADAS(NUMERO)`,
  `IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IDX_LINEAS_IMEI') CREATE INDEX IDX_LINEAS_IMEI ON SGF_LINEAS_IMPORTADAS(IMEI)`,
];

type OracleRuntimeConfig = {
  user: string;
  password: string;
  host: string;
  port: string | number;
  service: string;
};

type MssqlRuntimeConfig = {
  user: string;
  password: string;
  server: string;
  port: string | number;
  database: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};

const SQLITE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_cargararch_numero ON PCELULAR_CARGARARCH(NUMERO)`,
  `CREATE INDEX IF NOT EXISTS idx_sesiones_token ON SGF_SESIONES(TOKEN)`,
  `CREATE INDEX IF NOT EXISTS idx_sesiones_user ON SGF_SESIONES(USER_ID)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_creado ON SGF_LOGS(CREADO)`,
  `CREATE INDEX IF NOT EXISTS idx_facturas_no_factura ON SGF_FACTURAS(NO_FACTURA)`,
  `CREATE INDEX IF NOT EXISTS idx_servicios_factura_id ON SGF_SERVICIOS(FACTURA_ID)`,
  `CREATE INDEX IF NOT EXISTS idx_lineas_numero ON SGF_LINEAS_IMPORTADAS(NUMERO)`,
  `CREATE INDEX IF NOT EXISTS idx_lineas_imei ON SGF_LINEAS_IMPORTADAS(IMEI)`,
];

function paramNames(sql: string): string[] {
  const names: string[] = [];
  const re = /:(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) names.push(match[1]);
  return names;
}

/**
 * Convierte SQL "abstracto" (con placeholders :name, funciones Oracle como
 * SYSTIMESTAMP o NVL) al dialecto de cada motor. Solo se aplica cuando NO
 * estamos en Oracle.
 */
function toSqlite(sql: string) {
  let out = sql;
  out = out.replace(/PCELULAR\.CARGARARCH/gi, "PCELULAR_CARGARARCH");
  out = out.replace(/PCELULAR\.LINEA_TELEFONICA/gi, "PCELULAR_LINEA_TELEFONICA");
  out = out.replace(/PCELULAR\.PERSONA/gi, "PCELULAR_PERSONA");
  out = out.replace(/PCELULAR\.UNIDAD/gi, "PCELULAR_UNIDAD");
  out = out.replace(/PCELULAR\.ORGANO/gi, "PCELULAR_ORGANO");
  out = out.replace(/PCELULAR\./gi, "PCELULAR_");
  out = out.replace(/SYSTIMESTAMP/gi, "datetime('now')");
  out = out.replace(/SYSUTCDATETIME\(\)/gi, "datetime('now')");
  out = out.replace(/GETDATE\(\)/gi, "datetime('now')");
  out = out.replace(/GETUTCDATE\(\)/gi, "datetime('now')");
  out = out.replace(/SYSDATE/gi, "datetime('now')");
  out = out.replace(/FROM DUAL/gi, "");
  out = out.replace(/ISNULL\s*\(/gi, "IFNULL(");
  out = out.replace(/NVL\s*\(/gi, "IFNULL(");
  out = out.replace(/TO_CHAR\s*\(\s*([^,]+?)\s*,\s*'[^']*'\s*\)/gi, "$1");
  out = out.replace(/OFFSET\s*:(\w+)\s+ROWS\s+FETCH\s+NEXT\s*:(\w+)\s+ROWS\s+ONLY/gi, "LIMIT :$2 OFFSET :$1");
  out = out.replace(/DATEADD\s*\(\s*HOUR\s*,\s*8\s*,\s*GETDATE\(\)\s*\)/gi, "datetime('now','+8 hours')");
  out = out.replace(/INTERVAL\s*'(\d+)'\s*HOUR/gi, "'+$1 hours'");
  out = out.replace(/:(\w+)/g, "?");
  return out.trim();
}

/**
 * Convierte SQL "abstracto" a T-SQL de SQL Server. Las funciones se
 * sustituyen a sus equivalentes. Los placeholders :name se mantienen
 * porque mssql los acepta directamente (los convierte a @name).
 */
function toMssql(sql: string) {
  let out = sql;
  out = out.replace(/PCELULAR\.CARGARARCH/gi, "PCELULAR_CARGARARCH");
  out = out.replace(/PCELULAR\.LINEA_TELEFONICA/gi, "PCELULAR_LINEA_TELEFONICA");
  out = out.replace(/PCELULAR\.PERSONA/gi, "PCELULAR_PERSONA");
  out = out.replace(/PCELULAR\.UNIDAD/gi, "PCELULAR_UNIDAD");
  out = out.replace(/PCELULAR\.ORGANO/gi, "PCELULAR_ORGANO");
  out = out.replace(/PCELULAR\./gi, "PCELULAR_");
  out = out.replace(/SYSTIMESTAMP/gi, "SYSUTCDATETIME()");
  out = out.replace(/GETDATE\(\)/gi, "SYSUTCDATETIME()");
  out = out.replace(/SYSDATE/gi, "SYSUTCDATETIME()");
  out = out.replace(/NVL\s*\(/gi, "ISNULL(");
  out = out.replace(/TO_CHAR\s*\(\s*([^,]+?)\s*,\s*'[^']*'\s*\)/gi, "CONVERT(VARCHAR(20), $1, 103)");
  out = out.replace(/INTERVAL\s*'(\d+)'\s*HOUR/gi, "$1 HOUR");
  out = out.replace(/\s+FROM\s+DUAL/gi, "");
  out = out.replace(/LIMIT\s+:(\w+)\s+OFFSET\s+:(\w+)/gi, "OFFSET @$2 ROWS FETCH NEXT @$1 ROWS ONLY");
  out = out.replace(/:(\w+)/g, "@$1");
  return out;
}

async function sqliteQuery(sql: string, params: Record<string, any> = {}) {
  if (!db) throw new Error("BD no inicializada");
  const converted = toSqlite(sql);
  const values = paramNames(sql).map((key) => params[key]);
  const stmt = db.prepare(converted);
  stmt.bind(values);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function sqliteExecute(sql: string, params: Record<string, any> = {}) {
  if (!db) throw new Error("BD no inicializada");
  const converted = toSqlite(sql);
  const values = paramNames(sql).map((key) => params[key]);
  db.run(converted, values);
  const affected = db.getRowsModified();
  // Dentro de conGuardadoFinal() el guardado se hace una sola vez al final.
  if (batchDepth === 0) scheduleSave();
  return affected;
}

/**
 * Ejecuta una query en SQL Server usando mssql. Los placeholders :name
 * se convierten a @name (que es el formato nativo de T-SQL).
 */
async function mssqlQuery(sql: string, params: Record<string, any> = {}) {
  if (!mssqlPool) throw new Error("Pool SQL Server no inicializado");
  const request = mssqlPool.request();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) {
      request.input(k, null);
    } else if (typeof v === "number") {
      request.input(k, mssqlDriver.Decimal(18, 4), v);
    } else if (typeof v === "boolean") {
      request.input(k, mssqlDriver.Bit, v);
    } else {
      request.input(k, mssqlDriver.NVarChar(mssqlDriver.MAX), String(v));
    }
  }
  const converted = toMssql(sql);
  const result = await request.query(converted);
  return (result.recordset || []) as any[];
}

async function mssqlExecute(sql: string, params: Record<string, any> = {}) {
  if (!mssqlPool) throw new Error("Pool SQL Server no inicializado");
  const request = mssqlPool.request();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) {
      request.input(k, null);
    } else if (typeof v === "number") {
      request.input(k, mssqlDriver.Decimal(18, 4), v);
    } else if (typeof v === "boolean") {
      request.input(k, mssqlDriver.Bit, v);
    } else {
      request.input(k, mssqlDriver.NVarChar(mssqlDriver.MAX), String(v));
    }
  }
  const converted = toMssql(sql);
  const result = await request.query(converted);
  return result.rowsAffected?.[0] ?? 0;
}

/**
 * Helpers de expresiones comunes por motor. Se usan en las rutas
 * para no tener ifs (mode === "oracle") repetidos en cada query.
 */
export function nowExpr() {
  if (mode === "oracle") return "SYSTIMESTAMP";
  if (mode === "mssql") return "SYSUTCDATETIME()";
  return "datetime('now')";
}

export function expireExpr(horas: number) {
  if (mode === "oracle") return `SYSTIMESTAMP + INTERVAL '${horas}' HOUR`;
  if (mode === "mssql") return `DATEADD(HOUR, ${horas}, SYSUTCDATETIME())`;
  return `datetime('now','+${horas} hours')`;
}

export function paginationExpr(offsetAlias: string, limitAlias: string) {
  if (mode === "oracle") return `OFFSET :${offsetAlias} ROWS FETCH NEXT :${limitAlias} ROWS ONLY`;
  if (mode === "mssql") return `OFFSET @${offsetAlias} ROWS FETCH NEXT @${limitAlias} ROWS ONLY`;
  return `LIMIT :${limitAlias} OFFSET :${offsetAlias}`;
}

export function nullableCoalesce(...args: string[]) {
  if (mode === "oracle") return `NVL(${args.join(", ")})`;
  if (mode === "mssql") return `ISNULL(${args.join(", ")})`;
  return `IFNULL(${args.join(", ")})`;
}

/**
 * Crea el administrador inicial. Se ejecuta en cada arranque, pero SOLO actua
 * la primera vez que la instalacion no tiene ningun administrador valido.
 *
 * Antes, si el usuario ya existia, se REESCRIBIA en cada arranque su
 * contrasena, su nombre, su rol y se le volvia a poner ACTIVO=1. Eso permitia:
 *   - que cualquiera que leyera el .env entrase como administrador para siempre;
 *   - que un administrador degradado o desactivado a proposito "resucitara" al
 *     reiniciar el servidor;
 *   - que la contrasena cambiada desde la aplicacion se perdiera al reiniciar.
 *
 * Ahora:
 *   - si ya hay algun administrador activo, no se toca NADA;
 *   - si el usuario por defecto existe pero esta desactivado o degradado, se
 *     respeta esa decision (no se resucita);
 *   - si se ha perdido el acceso (no queda ningun administrador activo), se
 *     recupera usando DEFAULT_ADMIN_PASSWORD, que es el mecanismo previsto de
 *     emergencia, y se avisa por consola;
 *   - una contrasena ya establecida JAMAS se sobrescribe automaticamente.
 */
/**
 * ANTES: al arrancar se creaba un administrador de fabrica ("yolexis" o "admin")
 * con una contrasena por defecto. Eso significaba que toda instalacion nueva
 * tenia un usuario conocido por cualquiera que leyera el codigo, y que el
 * asistente de primera vez no podia crear la cuenta que el usuario queria.
 *
 * AHORA: la base arranca SIN usuarios. La primera vez que se abre la aplicacion,
 * el asistente pide nombre, usuario y contrasena, y crea la cuenta de
 * administrador (POST /api/setup/admin, que solo funciona si no hay ningun
 * usuario). Este registro solo se escribe por consola para saber el estado.
 */
async function registrarEstadoDeUsuarios() {
  try {
    const filas: any[] = await query<any>(`SELECT COUNT(*) AS CNT FROM SGF_USUARIOS`);
    const cuantos = Number(filas?.[0]?.CNT ?? filas?.[0]?.cnt ?? 0);
    if (cuantos === 0) {
      console.log("[SGF] Base de datos sin usuarios: la cuenta de administrador se crea en el asistente de primera vez.");
    } else {
      console.log(`[SGF] Usuarios en la base: ${cuantos}.`);
    }
  } catch {
    // Tabla recien creada: nada que informar.
  }
}



async function initSqlite() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log("[SGF] SQLite cargado:", DB_PATH);
  } else {
    db = new SQL.Database();
    console.log("[SGF] SQLite creado:", DB_PATH);
  }

  for (const sql of SQLITE_SCHEMA) db.run(sql);
  // Migración aditiva: nunca borra usuarios ni datos anteriores.
  const columnasUsuarios = db.exec(`PRAGMA table_info(SGF_USUARIOS)`);
  if (!columnasUsuarios[0]?.values?.some((fila: any) => String(fila[1]).toUpperCase() === 'PERMISOS')) {
    db.run(`ALTER TABLE SGF_USUARIOS ADD COLUMN PERMISOS TEXT DEFAULT '[]'`);
  }


  // Columnas nuevas para "facturas por mes". En una base ya creada no existen,
  // asi que se añaden aqui (CREATE TABLE IF NOT EXISTS no las añade).
  for (const [columna, tipo] of [["PERIODO_CLAVE", "TEXT"], ["PERIODO_PARTE", "INTEGER"]] as Array<[string, string]>) {
    const info = db.exec(`PRAGMA table_info(SGF_FACTURAS)`);
    const existe = info[0]?.values?.some((fila: any) => String(fila[1]).toUpperCase() === columna);
    if (!existe) {
      db.run(`ALTER TABLE SGF_FACTURAS ADD COLUMN ${columna} ${tipo}`);
      console.log(`[SGF] Columna añadida: SGF_FACTURAS.${columna}`);
    }
  }

  for (const sql of SQLITE_INDEXES) db.run(sql);
  mode = "sqlite";
  await registrarEstadoDeUsuarios();
  saveDisk();
  return { mode: "sqlite" as const, ok: true };
}




async function ensureOracleSchema(pool: any) {
  const conn = await pool.getConnection();
  try {
    for (const sql of ORACLE_SCHEMA_TABLES) {
      try {
        await conn.execute(sql);
      } catch (error: any) {
        if (!String(error?.message || '').includes('ORA-00955')) throw error;
      }
    }
    try { await conn.execute(`ALTER TABLE SGF_USUARIOS ADD (PERMISOS VARCHAR2(1000) DEFAULT '[]')`); }
    catch (error: any) { if (!String(error?.message || '').includes('ORA-01430')) throw error; }
    for (const sql of ORACLE_SCHEMA_INDEXES) {
      try {
        await conn.execute(sql);
      } catch (error: any) {
        if (!String(error?.message || '').includes('ORA-00955')) throw error;
      }
    }
    // MIGRACION: ampliar SESSION_TOKEN de 255 a 512 si existe
    try {
      await conn.execute(`ALTER TABLE SGF_SESIONES MODIFY SESSION_TOKEN VARCHAR2(512)`);
      await conn.commit();
    } catch (e: any) {
      // Si ya es 512 o no existe, ORA-01442 etc - ignorar
      if (!String(e?.message || '').includes('ORA-01442') && !String(e?.message || '').includes('ORA-00942')) {
        try { await conn.rollback(); } catch {}
      }
    }
    await conn.commit();
  } finally {
    await conn.close();
  }
}

async function ensureMssqlSchema(pool: any) {
  // sql.js-style: cada sentencia IF NOT EXISTS se ejecuta y solo falla
  // si la condicion no es cierta. Como IF NOT EXISTS usa un SELECT que
  // no devuelve nada cuando es verdadero, no hay filas que consumir.
  for (const sql of MSSQL_SCHEMA_TABLES) {
    await pool.request().query(sql);
  }
  await pool.request().query(`IF COL_LENGTH('SGF_USUARIOS', 'PERMISOS') IS NULL ALTER TABLE SGF_USUARIOS ADD PERMISOS NVARCHAR(1000) DEFAULT '[]'`);
  for (const sql of MSSQL_SCHEMA_INDEXES) {
    await pool.request().query(sql);
  }
  // MIGRACION: ampliar SESSION_TOKEN de 255 a 512 si la tabla ya existe con 255 (fix para JWT largos)
  try {
    await pool.request().query(`
      IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'SGF_SESIONES' AND COLUMN_NAME = 'SESSION_TOKEN' AND CHARACTER_MAXIMUM_LENGTH < 512 AND CHARACTER_MAXIMUM_LENGTH != -1
      )
      BEGIN
        ALTER TABLE SGF_SESIONES ALTER COLUMN SESSION_TOKEN NVARCHAR(512) NOT NULL
      END
    `);
  } catch (e) {
    // Si falla (permisos, etc), ignorar - el proximo intento de login mostrara el error original
    console.warn("[SGF] No se pudo ampliar SGF_SESIONES.SESSION_TOKEN a 512:", (e as any)?.message || e);
  }
}

export async function connectOracleRuntime(config?: Partial<OracleRuntimeConfig>) {
  const driver = await import('oracledb');
  const nextConfig = {
    user: String(config?.user || process.env.ORACLE_USER || 'pcelular'),
    password: String(config?.password || process.env.ORACLE_PASSWORD || 'pcelular'),
    host: String(config?.host || process.env.ORACLE_HOST || '25'),
    port: String(config?.port || process.env.ORACLE_PORT || '1521'),
    service: String(config?.service || process.env.ORACLE_SERVICE || 'PCELULAR'),
  };

  const connectTimeoutMs = Number(process.env.ORACLE_CONNECT_TIMEOUT_MS || 5000);
  let nextPool: any;
  try {
    nextPool = await Promise.race([
      driver.default.createPool({
        user: nextConfig.user,
        password: nextConfig.password,
        connectString: `${nextConfig.host}:${nextConfig.port}/${nextConfig.service}`,
        poolMin: 2,
        poolMax: 8,
        poolIncrement: 1,
        poolTimeout: 30,
        connectTimeout: connectTimeoutMs / 1000,
      }),
      new Promise<never>((_, reject) => setTimeout(
        () => reject(new Error(`Timeout conectando a Oracle despues de ${connectTimeoutMs}ms`)),
        connectTimeoutMs + 1000,
      )),
    ]);
  } catch (error) {
    throw error;
  }

  try {
    const conn = await nextPool.getConnection();
    try {
      await conn.execute('SELECT 1 FROM DUAL');
    } finally {
      await conn.close();
    }
    await ensureOracleSchema(nextPool);
  } catch (error) {
    try { await nextPool.close(5); } catch {}
    throw error;
  }

  if (oraclePool) {
    try { await oraclePool.close(5); } catch {}
  }

  oraclePool = nextPool;
  process.env.ORACLE_USER = nextConfig.user;
  process.env.ORACLE_PASSWORD = nextConfig.password;
  process.env.ORACLE_HOST = nextConfig.host;
  process.env.ORACLE_PORT = String(nextConfig.port);
  process.env.ORACLE_SERVICE = nextConfig.service;
  mode = 'oracle';
  await registrarEstadoDeUsuarios();
  return { ok: true, config: nextConfig };
}

export async function connectMssqlRuntime(config?: Partial<MssqlRuntimeConfig>) {
  if (!mssqlDriver) {
    mssqlDriver = (await import('mssql')).default;
  }

  // Soportar formato SERVIDOR\\INSTANCIA (ej: G108106146\\SQLEXPRESS)
  let serverRaw = String(config?.server || process.env.MSSQL_SERVER || 'localhost');
  let instanceName: string | undefined;
  if (serverRaw.includes("\\")) {
    const idx = serverRaw.indexOf("\\");
    instanceName = serverRaw.slice(idx + 1).trim();
    serverRaw = serverRaw.slice(0, idx).trim();
  }
  const server = serverRaw;
  const port = Number(config?.port || process.env.MSSQL_PORT || 1433);
  const database = String(config?.database || process.env.MSSQL_DATABASE || 'sgf');
  const user = String(config?.user || process.env.MSSQL_USER || 'sa');
  const password = String(config?.password || process.env.MSSQL_PASSWORD || '');
  const encrypt = config?.encrypt !== undefined
    ? Boolean(config.encrypt)
    : String(process.env.MSSQL_ENCRYPT || 'false').toLowerCase() === 'true';
  const trustServerCertificate = config?.trustServerCertificate !== undefined
    ? Boolean(config.trustServerCertificate)
    : String(process.env.MSSQL_TRUST_CERT || 'true').toLowerCase() !== 'false';

  const nextConfig: any = {
    user, password, server, port, database,
    options: { encrypt, trustServerCertificate, instanceName: instanceName || undefined },
    pool: {
      max: Number(process.env.MSSQL_POOL_MAX || 10),
      min: Number(process.env.MSSQL_POOL_MIN || 0),
      idleTimeoutMillis: Number(process.env.MSSQL_POOL_IDLE_MS || 30000),
    },
  };
  // Si hay instancia pero tambien puerto, tedious puede quejarse; si puerto es 1433 (default)
  // y hay instancia, dejamos que el driver resuelva por Browser. Si usuario especificó puerto diferente,
  // lo respetamos.
  if (instanceName && port === 1433 && !config?.port && !process.env.MSSQL_PORT) {
    // Dejar port undefined para que use el browser
    delete nextConfig.port;
  }

  const connectTimeoutMs = Number(process.env.MSSQL_CONNECT_TIMEOUT_MS || 5000);
  let nextPool: any;
  try {
    nextPool = await Promise.race([
      new mssqlDriver.ConnectionPool(nextConfig).connect(),
      new Promise<never>((_, reject) => setTimeout(
        () => reject(new Error(`Timeout conectando a SQL Server despues de ${connectTimeoutMs}ms`)),
        connectTimeoutMs + 1000,
      )),
    ]);
  } catch (error) {
    throw error;
  }

  try {
    await ensureMssqlSchema(nextPool);
  } catch (error) {
    try { await nextPool.close(); } catch {}
    throw error;
  }

  if (mssqlPool) {
    try { await mssqlPool.close(); } catch {}
  }

  mssqlPool = nextPool;
  process.env.MSSQL_SERVER = server;
  process.env.MSSQL_PORT = String(port);
  process.env.MSSQL_DATABASE = database;
  process.env.MSSQL_USER = user;
  process.env.MSSQL_PASSWORD = password;
  process.env.MSSQL_ENCRYPT = String(encrypt);
  process.env.MSSQL_TRUST_CERT = String(trustServerCertificate);
  mode = 'mssql';
  await registrarEstadoDeUsuarios();
  return { ok: true, config: { server, port, database, user } };
}

export async function initDatabase() {
  ensureDir();

  // Respetar DB_TYPE del .env si esta presente.
  const dbType = String(process.env.DB_TYPE || '').trim().toLowerCase();

  if (dbType === 'mssql') {
    try {
      await connectMssqlRuntime();
      console.log(`[SGF] SQL Server conectado: ${process.env.MSSQL_SERVER}/${process.env.MSSQL_DATABASE}`);
      return { mode: "mssql" as const, ok: true };
    } catch (error: any) {
      console.log("[SGF] SQL Server no disponible:", error?.message || "sin detalle");
      mssqlPool = null;
    }
  } else if (dbType === 'oracle') {
    try {
      await connectOracleRuntime();
      console.log(`[SGF] Oracle PCELULAR conectado`);
      return { mode: "oracle" as const, ok: true };
    } catch (error: any) {
      console.log("[SGF] Oracle no disponible:", error?.message || "sin detalle");
      oraclePool = null;
    }
  } else if (dbType === 'sqlite') {
    return initSqlite();
  } else {
    // Sin DB_TYPE definido: intentar Oracle primero (compatibilidad con
    // despliegues anteriores), despues SQL Server, y por ultimo SQLite
    // como fallback de emergencia.
    try {
      await connectOracleRuntime();
      console.log("[SGF] Oracle PCELULAR conectado");
      return { mode: "oracle" as const, ok: true };
    } catch (error: any) {
      console.log("[SGF] Oracle no disponible:", error?.message || "sin detalle");
      oraclePool = null;
    }

    try {
      await connectMssqlRuntime();
      console.log(`[SGF] SQL Server conectado: ${process.env.MSSQL_SERVER}/${process.env.MSSQL_DATABASE}`);
      return { mode: "mssql" as const, ok: true };
    } catch (error: any) {
      console.log("[SGF] SQL Server no disponible:", error?.message || "sin detalle");
      mssqlPool = null;
    }
  }

  return initSqlite();
}

export function getDbMode(): DbMode {
  return mode;
}

export function isEnterprise(): boolean {
  return mode === "oracle" || mode === "mssql";
}

export function isOracleLegacyTablesAvailable(): boolean {
  // Solo intentamos tocar el esquema PCELULAR.* en Oracle, donde sabemos
  // que existe. En SQL Server y en SQLite esas tablas no existen y
  // cualquier intento de INSERT fallaria.
  return mode === "oracle";
}

export async function query<T = any>(sql: string, params: Record<string, any> = {}): Promise<T[]> {
  const context = transactionContext.getStore();
  if (context) return (await context.all(sql, params)) as T[];
  if (mode === "oracle" && oraclePool) {
    const oracledb = await import("oracledb");
    const conn = await oraclePool.getConnection();
    try {
      const result = await conn.execute(sql, params, { outFormat: oracledb.default.OUT_FORMAT_OBJECT });
      return (result.rows || []) as T[];
    } finally {
      await conn.close();
    }
  }
  if (mode === "mssql" && mssqlPool) {
    return (await mssqlQuery(sql, params)) as T[];
  }
  return conTurnoSqlite(async () => (await sqliteQuery(sql, params)) as T[]);
}

export async function execute(sql: string, params: Record<string, any> = {}): Promise<number> {
  const context = transactionContext.getStore();
  if (context) return context.run(sql, params);
  if (mode === "oracle" && oraclePool) {
    const conn = await oraclePool.getConnection();
    try {
      const result = await conn.execute(sql, params, { autoCommit: true });
      return result.rowsAffected || 0;
    } finally {
      await conn.close();
    }
  }
  if (mode === "mssql" && mssqlPool) {
    return mssqlExecute(sql, params);
  }
  return conTurnoSqlite(() => sqliteExecute(sql, params));
}

// ─────────────────────────────────────────────────────────────────────────────
// Transacciones reales.
//
// Antes: transaction() abria BEGIN y le pasaba la conexion al callback, pero las
// rutas llamaban a execute()/query() globales, que usan el pool con autocommit.
// El ROLLBACK no deshacia NADA. Ahora, dentro del callback se usan
//   await db.run(sql, params)     -> escritura ligada a la transaccion
//   await db.all(sql, params)     -> lectura ligada a la transaccion
// que si forman parte de la transaccion; execute()/query() siguen funcionando
// y, mientras haya una transaccion abierta en esta ejecucion, se enrutan por
// ella (ver txContext mas arriba).
// ─────────────────────────────────────────────────────────────────────────────

// El contexto pertenece a cada petición asíncrona; una transacción de otro
// cliente no debe heredarla. SQLite usa una sola conexión, por lo que también
// se serializan las operaciones ajenas mientras una transacción esté abierta.
const transactionContext = new AsyncLocalStorage<DbRunner>();
let activeTransactions = 0;
let turnoSqlite: Promise<void> = Promise.resolve();
async function conTurnoSqlite<T>(fn: () => Promise<T>): Promise<T> {
  const anterior = turnoSqlite;
  let liberar!: () => void;
  turnoSqlite = new Promise<void>(resolve => { liberar = resolve; });
  await anterior;
  try { return await fn(); } finally { liberar(); }
}

export interface DbRunner {
  run: (sql: string, params?: Record<string, any>) => Promise<number>;
  all: (sql: string, params?: Record<string, any>) => Promise<any[]>;
}

export async function transaction<T>(fn: (db: DbRunner) => Promise<T>): Promise<T> {
  const actual = transactionContext.getStore();
  if (actual) return fn(actual);

  if (mode === "oracle" && oraclePool) {
    const conn = await oraclePool.getConnection();
    const runner: DbRunner = {
      run: async (sql, params = {}) => {
        const result = await conn.execute(sql, params, { autoCommit: false });
        return result.rowsAffected || 0;
      },
      all: async (sql, params = {}) => {
        const oracledb = await import("oracledb");
        const result = await conn.execute(sql, params, {
          outFormat: oracledb.default.OUT_FORMAT_OBJECT,
          autoCommit: false,
        });
        return result.rows || [];
      },
    };
    activeTransactions++;
    try {
      const value = await transactionContext.run(runner, () => fn(runner));
      await conn.commit();
      return value;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      activeTransactions--;
      await conn.close();
    }
  }

  if (mode === "mssql" && mssqlPool) {
    if (!mssqlDriver) mssqlDriver = (await import('mssql')).default;
    const tx = new mssqlDriver.Transaction(mssqlPool);
    await tx.begin();
    const runner: DbRunner = {
      run: async (sql, params = {}) => {
        const request = tx.request();
        for (const [k, v] of Object.entries(params)) request.input(k, v);
        const result = await request.query(toMssql(sql));
        return result.rowsAffected?.reduce((a: number, b: number) => a + b, 0) || 0;
      },
      all: async (sql, params = {}) => {
        const request = tx.request();
        for (const [k, v] of Object.entries(params)) request.input(k, v);
        const result = await request.query(toMssql(sql));
        return result.recordset || [];
      },
    };
    activeTransactions++;
    try {
      const value = await transactionContext.run(runner, () => fn(runner));
      await tx.commit();
      return value;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      activeTransactions--;
    }
  }

  return conTurnoSqlite(async () => {
  if (!db) throw new Error("BD no inicializada");
  const runner: DbRunner = {
    run: async (sql, params = {}) => sqliteExecute(sql, params),
    all: async (sql, params = {}) => sqliteQuery(sql, params),
  };
  db.run("BEGIN TRANSACTION");
  activeTransactions++;
  try {
    const value = await transactionContext.run(runner, () => fn(runner));
    db.run("COMMIT");
    scheduleSave();
    return value;
  } catch (error) {
    try {
      db.run("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    activeTransactions--;
  }
  });
}

export async function pingDb() {
  if (mode === "oracle" && oraclePool) {
    const started = Date.now();
    try {
      const conn = await oraclePool.getConnection();
      try {
        await conn.execute("SELECT 1 FROM DUAL");
      } finally {
        await conn.close();
      }
      return { ok: true, msg: "Oracle PCELULAR OK", ms: Date.now() - started };
    } catch (error: any) {
      return { ok: false, msg: error.message, ms: Date.now() - started };
    }
  }

  if (mode === "mssql" && mssqlPool) {
    const started = Date.now();
    try {
      await mssqlPool.request().query("SELECT 1 AS ok");
      return { ok: true, msg: `SQL Server ${process.env.MSSQL_SERVER || ''} OK`, ms: Date.now() - started };
    } catch (error: any) {
      return { ok: false, msg: error.message, ms: Date.now() - started };
    }
  }

  return { ok: true, msg: `SQLite (${DB_PATH})`, ms: 0 };
}

export async function closeDb() {
  if (oraclePool) {
    try {
      await oraclePool.close(5);
    } catch {
      // ignore
    }
    oraclePool = null;
  }

  if (mssqlPool) {
    try {
      await mssqlPool.close();
    } catch {
      // ignore
    }
    mssqlPool = null;
  }

  if (db) {
    // Si falla la escritura, no cerrar silenciosamente la base en memoria:
    // quien llama debe recibir el error y puede intentar guardarla de nuevo.
    if (!flushDisk()) throw new Error('No se pudieron guardar los últimos cambios de SQLite. Compruebe el espacio y los permisos antes de continuar.');
    db.close();
    db = null;
  }

  if (saveTimer) clearTimeout(saveTimer);
}

// Helpers de traduccion SQL expuestos para tests y para scripts
// externos que quieran validar la conversion a T-SQL o SQLite sin
// inicializar el pool.

const TIPOS_COLUMNA_PERMITIDOS = /^(TEXT|INTEGER|REAL|NUMERIC(\(\d+(,\s*\d+)?\))?|VARCHAR2?\(\d+\)|NVARCHAR\(\d+|MAX\)|NVARCHAR\(\d+\)|NUMBER(\(\d+(,\s*\d+)?\))?|DECIMAL\(\d+(,\s*\d+)?\)|INT|DATETIME2?|CLOB|TIMESTAMP)$/i;

/**
 * Tablas en las que el importador puede añadir columnas nuevas.
 *
 * Antes bastaba con que el nombre pasara el filtro de caracteres, así que un
 * encabezado de Excel podía acabar creando columnas en SGF_USUARIOS o
 * SGF_SESIONES (por ejemplo `EMAIL`, `ACTIVO` o `PASSWORD_HASH`) y desde ahí
 * alterar el comportamiento del sistema. Ahora solo se tocan las tablas de datos.
 */
export const TABLAS_CON_COLUMNAS_AMPLIABLES = [
  "SGF_LINEAS_IMPORTADAS",
  "SGF_FACTURAS",
  "SGF_SERVICIOS",
  "PCELULAR_LINEA_TELEFONICA",
  "PCELULAR_PERSONA",
  "PCELULAR_TELEFONO_ASIGNADO",
  "PCELULAR_PROVINCIA",
  "PCELULAR_MUNICIPIO",
  "PCELULAR_ORGANO",
  "PCELULAR_UNIDAD",
  "PCELULAR_CARGO",
  "PCELULAR_GRADO",
];

/**
 * Columnas con significado de seguridad: una importación no puede crearlas ni
 * escribirlas. Ojo: ID y USER_ID NO están aquí porque el propio importador las
 * necesita para sus filas (en las tablas PCELULAR_* las crea él).
 */
const COLUMNAS_RESERVADAS = new Set([
  "ACTIVO", "ACTIVE", "ROL", "ROLE", "PASSWORD_HASH",
  "TOKEN", "SESSION_TOKEN", "EXPIRA", "EXPIRES_AT",
]);

export async function ensureColumnExists(table: string, column: string, type: string) {
  const upperTable = table.toUpperCase();
  const upperCol = column.toUpperCase();
  // El nombre de tabla/columna llega influido por el Excel del usuario: se
  // valida antes de interpolarlo en ALTER TABLE (inyeccion SQL por encabezado).
  if (!/^[A-Z][A-Z0-9_]*$/.test(upperTable) || !/^[A-Z][A-Z0-9_]*$/.test(upperCol)) {
    throw new Error(`Identificador SQL no valido: ${table}.${column}`);
  }
  if (!TABLAS_CON_COLUMNAS_AMPLIABLES.includes(upperTable)) {
    throw new Error(`No se pueden añadir columnas a la tabla ${upperTable} desde una importación.`);
  }
  if (COLUMNAS_RESERVADAS.has(upperCol)) {
    throw new Error(`La columna ${upperCol} es del sistema y no se puede modificar desde una importación.`);
  }
  if (!TIPOS_COLUMNA_PERMITIDOS.test(String(type).trim())) {
    throw new Error(`Tipo de columna no permitido: ${type}`);
  }
  try {
    if (mode === "sqlite" && db) {
      const info = db.exec(`PRAGMA table_info(${table})`);
      // sql.js exec returns array of result sets
      const hasCol = info[0]?.values?.some((row: any) => String(row[1]).toUpperCase() === upperCol);
      if (!hasCol) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        scheduleSave();
        console.log(`[SGF] Columna añadida SQLite: ${table}.${column} ${type}`);
      }
      return;
    }
    if (mode === "mssql" && mssqlPool) {
      const res = await mssqlPool.request().query(`SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${upperTable}' AND COLUMN_NAME='${upperCol}'`);
      if (!res.recordset || res.recordset.length === 0) {
        await mssqlPool.request().query(`ALTER TABLE ${table} ADD ${column} ${type}`);
        console.log(`[SGF] Columna añadida MSSQL: ${table}.${column} ${type}`);
      }
      return;
    }
    if (mode === "oracle" && oraclePool) {
      const conn = await oraclePool.getConnection();
      try {
        const result = await conn.execute(`SELECT COUNT(*) AS CNT FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :t AND COLUMN_NAME = :c`, { t: upperTable, c: upperCol }, { outFormat: (await import('oracledb')).default.OUT_FORMAT_OBJECT });
        const cnt = Number((result.rows as any)?.[0]?.CNT || 0);
        if (cnt === 0) {
          await conn.execute(`ALTER TABLE ${table} ADD ${column} ${type}`);
          await conn.commit();
          console.log(`[SGF] Columna añadida Oracle: ${table}.${column} ${type}`);
        }
      } finally {
        await conn.close();
      }
    }
  } catch (e: any) {
    console.warn(`[SGF] No se pudo asegurar columna ${table}.${column}: ${e.message}`);
  }
}

export { toMssql, toSqlite };
