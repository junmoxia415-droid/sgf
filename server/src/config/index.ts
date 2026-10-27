import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const APP_CONFIG = {
  name: "SGF", fullName: "Sistema de Gestion de Facturas",
  version: "4.0.0", description: "Facturas ETECSA - Cliente/Servidor Centralizado",
};

export const SERVER_CONFIG = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || "0.0.0.0",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS) || 30000,
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 10,
};

export const JWT_CONFIG = {
  // En produccion JWT_SECRET SIEMPRE debe venir del .env.
  // El valor por defecto es solo un marcador para que el servidor
  // arranque en un entorno de desarrollo fresco. Forzamos a que sea
  // cambiado emitiendo una advertencia en consola si se usa el default.
  secret: process.env.JWT_SECRET || "sgf-jwt-secret-cambiar-en-produccion",
  expiresIn: process.env.JWT_EXPIRES_IN || "8h",
};

if (JWT_CONFIG.secret === "sgf-jwt-secret-cambiar-en-produccion") {
  console.warn(
    "[SGF] ADVERTENCIA: JWT_SECRET esta usando el valor por defecto. " +
    "Defina uno propio en server/.env antes de desplegar.",
  );
}

export const SECURITY_CONFIG = {
  loginRatePerMin: Number(process.env.LOGIN_RATE_PER_MIN) || 5,
  loginRatePer15Min: Number(process.env.LOGIN_RATE_PER_15MIN) || 30,
  trustProxy: String(process.env.TRUST_PROXY || "").trim(),
};

export const DB_TYPE_CONFIG = {
  /**
   * Tipo de BD a usar al arrancar. Opciones:
   *   - "sqlite"  -> BD local (archivo .db en server-data/)
   *   - "oracle"  -> Oracle PCELULAR (requiere host, user, password, service)
   *   - "mssql"   -> Microsoft SQL Server (requiere server, database, user, password)
   * Si esta vacio, se intenta Oracle -> SQL Server -> SQLite en ese orden.
   */
  type: String(process.env.DB_TYPE || "").trim().toLowerCase(),
};

export const ORACLE_CONFIG = {
  user: process.env.ORACLE_USER || "pcelular",
  password: process.env.ORACLE_PASSWORD || "pcelular",
  host: process.env.ORACLE_HOST || "25",
  port: Number(process.env.ORACLE_PORT) || 1521,
  service: process.env.ORACLE_SERVICE || "PCELULAR",
  get connectString() {
    return `${this.host}:${this.port}/${this.service}`;
  },
  pool: {
    min: Number(process.env.ORACLE_POOL_MIN) || 2,
    max: Number(process.env.ORACLE_POOL_MAX) || 20,
    increment: Number(process.env.ORACLE_POOL_INCREMENT) || 2,
    timeout: Number(process.env.ORACLE_POOL_TIMEOUT) || 60,
  },
};

export const MSSQL_CONFIG = {
  user: process.env.MSSQL_USER || "sa",
  password: process.env.MSSQL_PASSWORD || "",
  server: process.env.MSSQL_SERVER || "localhost",
  port: Number(process.env.MSSQL_PORT) || 1433,
  database: process.env.MSSQL_DATABASE || "sgf",
  encrypt: String(process.env.MSSQL_ENCRYPT || "false").toLowerCase() === "true",
  trustServerCertificate: String(process.env.MSSQL_TRUST_CERT || "true").toLowerCase() !== "false",
  pool: {
    min: Number(process.env.MSSQL_POOL_MIN) || 0,
    max: Number(process.env.MSSQL_POOL_MAX) || 10,
    idleTimeoutMs: Number(process.env.MSSQL_POOL_IDLE_MS) || 30000,
  },
};
