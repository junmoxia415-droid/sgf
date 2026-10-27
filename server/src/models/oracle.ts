import { ORACLE_CONFIG } from "../config/index.js";

let pool: any = null;
let oracledb: any = null;

async function getDriver() {
  if (!oracledb) {
    oracledb = await import("oracledb");
  }
  return oracledb;
}

export async function getPool() {
  if (pool) return pool;
  const driver = await getDriver();
  pool = await driver.createPool({
    user: ORACLE_CONFIG.user,
    password: ORACLE_CONFIG.password,
    connectString: ORACLE_CONFIG.connectString,
    poolMin: ORACLE_CONFIG.pool.min,
    poolMax: ORACLE_CONFIG.pool.max,
    poolIncrement: ORACLE_CONFIG.pool.increment,
    poolTimeout: ORACLE_CONFIG.pool.timeout,
  });
  console.log(`[SGF] Pool Oracle creado: ${ORACLE_CONFIG.connectString}`);
  return pool;
}

export async function pingOracle() {
  const started = Date.now();
  try {
    const p = await getPool();
    const conn = await p.getConnection();
    try { await conn.execute("SELECT 1 FROM DUAL"); } finally { await conn.close(); }
    return { ok: true, message: "Conexion Oracle exitosa.", connectString: ORACLE_CONFIG.connectString, latencyMs: Date.now() - started };
  } catch (err: any) {
    return { ok: false, message: `Error: ${err.message}`, connectString: ORACLE_CONFIG.connectString, latencyMs: Date.now() - started };
  }
}

export async function query<T = any>(sql: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    const result = await conn.execute(sql, params, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return (result.rows || []) as T[];
  } finally { await conn.close(); }
}

export async function execute(sql: string, params: Record<string, unknown> = {}, autoCommit = true): Promise<number> {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    const result = await conn.execute(sql, params, { autoCommit });
    return result.rowsAffected || 0;
  } finally { await conn.close(); }
}

export async function transaction<T>(fn: (conn: any) => Promise<T>): Promise<T> {
  const p = await getPool();
  const conn = await p.getConnection();
  try { const result = await fn(conn); await conn.commit(); return result; }
  catch (err) { await conn.rollback(); throw err; }
  finally { await conn.close(); }
}

export async function closePool() {
  if (pool) { try { await pool.close(5); } catch {} pool = null; }
}
