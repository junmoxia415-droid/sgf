import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import initSqlJs from "sql.js";
import { execute, getDbMode, query } from "../models/database.js";
import { sendJson, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/logger.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../server-data");
const SQLITE_PATH = path.join(DATA_DIR, "sgf-data.db");

type SourceRow = Record<string, any>;

async function readSqliteDatabase(): Promise<{
  usuarios: SourceRow[];
  sesiones: SourceRow[];
  logs: SourceRow[];
  facturas: SourceRow[];
  servicios: SourceRow[];
}> {
  if (!fs.existsSync(SQLITE_PATH)) {
    throw new Error(`No existe la base SQLite local en ${SQLITE_PATH}`);
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(SQLITE_PATH));

  const collect = (table: string): SourceRow[] => {
    try {
      const stmt = db.prepare(`SELECT * FROM ${table}`);
      const rows: SourceRow[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as SourceRow);
      stmt.free();
      return rows;
    } catch (error: any) {
      // Tabla no existe en este SQLite, devolver vacio
      return [];
    }
  };

  return {
    usuarios: collect("SGF_USUARIOS"),
    sesiones: collect("SGF_SESIONES"),
    logs: collect("SGF_LOGS"),
    facturas: collect("SGF_FACTURAS"),
    servicios: collect("SGF_SERVICIOS"),
  };
}

function asBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return false;
}

export async function handleMigrateFromSqlite(req: AuthenticatedRequest, res: ServerResponse) {
  if (!requireAdmin(req, res)) return;

  const targetMode = getDbMode();
  if (targetMode === "sqlite") {
    return sendJson(res, 400, {
      success: false,
      error: "El motor activo ya es SQLite. Conectese primero a SQL Server u Oracle para poder migrar.",
    });
  }

  let source;
  try {
    source = await readSqliteDatabase();
  } catch (error: any) {
    return sendJson(res, 404, { success: false, error: error.message });
  }

  if (!fs.existsSync(SQLITE_PATH)) {
    return sendJson(res, 404, {
      success: false,
      error: `No se encontro la base SQLite en ${SQLITE_PATH}. El sistema nunca uso SQLite local, no hay datos que migrar.`,
    });
  }

  if (source.usuarios.length === 0 && source.facturas.length === 0) {
    return sendJson(res, 200, {
      success: true,
      message: "La base SQLite esta vacia. Nada que migrar.",
      data: { copied: { usuarios: 0, sesiones: 0, logs: 0, facturas: 0, servicios: 0 } },
    });
  }

  const copied = { usuarios: 0, sesiones: 0, logs: 0, facturas: 0, servicios: 0 };
  const errors: string[] = [];

  // 1) USUARIOS
  for (const u of source.usuarios) {
    try {
      if (targetMode === "oracle") {
        await execute(
          `INSERT INTO SGF_USUARIOS (ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE, CREATED_AT, UPDATED_AT)
           VALUES (:id, :u, :n, :r, :h, :a, NVL(:c, SYSTIMESTAMP), NVL(:up, SYSTIMESTAMP))`,
          {
            id: String(u.ID ?? u.id ?? ""),
            u: String(u.USERNAME ?? u.username ?? ""),
            n: String(u.NOMBRE ?? u.NAME ?? ""),
            r: String(u.ROL ?? u.ROLE ?? "usuario"),
            h: String(u.PASSWORD_HASH ?? ""),
            a: asBool(u.ACTIVO ?? u.ACTIVE) ? 1 : 0,
            c: u.CREADO ?? u.CREATED_AT ?? null,
            up: u.CREADO ?? u.CREATED_AT ?? null,
          },
        );
      } else {
        await execute(
          `INSERT INTO SGF_USUARIOS (ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE, CREATED_AT, UPDATED_AT)
           VALUES (:id, :u, :n, :r, :h, :a, ISNULL(:c, SYSUTCDATETIME()), ISNULL(:up, SYSUTCDATETIME()))`,
          {
            id: String(u.ID ?? u.id ?? ""),
            u: String(u.USERNAME ?? u.username ?? ""),
            n: String(u.NOMBRE ?? u.NAME ?? ""),
            r: String(u.ROL ?? u.ROLE ?? "usuario"),
            h: String(u.PASSWORD_HASH ?? ""),
            a: asBool(u.ACTIVO ?? u.ACTIVE),
            c: u.CREADO ?? u.CREATED_AT ?? null,
            up: u.CREADO ?? u.CREATED_AT ?? null,
          },
        );
      }
      copied.usuarios++;
    } catch (error: any) {
      if (String(error.message).toLowerCase().includes("unique")) continue; // ya existe
      errors.push(`usuario ${u.USERNAME}: ${error.message}`);
    }
  }

  // 2) SESIONES (no criticas, saltamos si fallan)
  for (const s of source.sesiones) {
    try {
      if (targetMode === "oracle") {
        await execute(
          `INSERT INTO SGF_SESIONES (ID, USER_ID, SESSION_TOKEN, MACHINE_ID, IP_ADDRESS, ACTIVE, CREATED_AT, EXPIRES_AT)
           VALUES (:id, :uid, :t, :m, :ip, :a, NVL(:c, SYSTIMESTAMP), NVL(:e, SYSTIMESTAMP + INTERVAL '8' HOUR))`,
          {
            id: String(s.ID ?? s.id ?? ""),
            uid: String(s.USER_ID ?? s.user_id ?? ""),
            t: String(s.TOKEN ?? s.SESSION_TOKEN ?? ""),
            m: String(s.MAQUINA ?? s.MACHINE_ID ?? ""),
            ip: String(s.IP ?? s.IP_ADDRESS ?? ""),
            a: asBool(s.ACTIVO ?? s.ACTIVE) ? 1 : 0,
            c: s.CREADO ?? s.CREATED_AT ?? null,
            e: s.EXPIRA ?? s.EXPIRES_AT ?? null,
          },
        );
      } else {
        await execute(
          `INSERT INTO SGF_SESIONES (ID, USER_ID, SESSION_TOKEN, MACHINE_ID, IP_ADDRESS, ACTIVE, CREATED_AT, EXPIRES_AT)
           VALUES (:id, :uid, :t, :m, :ip, :a, ISNULL(:c, SYSUTCDATETIME()), ISNULL(:e, DATEADD(HOUR, 8, SYSUTCDATETIME())))`,
          {
            id: String(s.ID ?? s.id ?? ""),
            uid: String(s.USER_ID ?? s.user_id ?? ""),
            t: String(s.TOKEN ?? s.SESSION_TOKEN ?? ""),
            m: String(s.MAQUINA ?? s.MACHINE_ID ?? ""),
            ip: String(s.IP ?? s.IP_ADDRESS ?? ""),
            a: asBool(s.ACTIVO ?? s.ACTIVE),
            c: s.CREADO ?? s.CREATED_AT ?? null,
            e: s.EXPIRA ?? s.EXPIRES_AT ?? null,
          },
        );
      }
      copied.sesiones++;
    } catch (error: any) {
      if (String(error.message).toLowerCase().includes("unique")) continue;
      errors.push(`sesion ${s.ID}: ${error.message}`);
    }
  }

  // 3) FACTURAS
  for (const f of source.facturas) {
    try {
      const now = targetMode === "oracle" ? "SYSTIMESTAMP" : "SYSUTCDATETIME()";
      await execute(
        `INSERT INTO SGF_FACTURAS (
          ID, CLIENTE, CUENTA, NUMERO_CLIENTE, NUMERO_CUENTA, NO_FACTURA,
          FECHA_EMISION, FECHA_VENCIMIENTO, PERIODO_CONSUMO, CODIGO_PAGO,
          MONEDA, NIT, CUOTA, CONSUMO, COMISION, IMPUESTO, TOTAL, TOTAL_PAGAR,
          ESTADO, PARSER, OCR_CONFIDENCE, OCR_DURATION, ARCHIVO, TEXTO_OCR,
          USER_ID, CREATED_AT, UPDATED_AT
        ) VALUES (
          :id, :cliente, :cuenta, :nc, :ncu, :nf,
          :fe, :fv, :pc, :cp,
          :mon, :nit, :cuo, :con, :cmi, :imp, :tot, :tp,
          :est, :par, :ocr, :dur, :arc, :txt,
          :uid, ${now}, ${now}
        )`,
        {
          id: String(f.ID ?? f.id ?? ""),
          cliente: String(f.CLIENTE ?? ""),
          cuenta: String(f.CUENTA ?? ""),
          nc: String(f.NUMERO_CLIENTE ?? ""),
          ncu: String(f.NUMERO_CUENTA ?? ""),
          nf: String(f.NO_FACTURA ?? ""),
          fe: String(f.FECHA_EMISION ?? ""),
          fv: String(f.FECHA_VENCIMIENTO ?? ""),
          pc: String(f.PERIODO_CONSUMO ?? ""),
          cp: String(f.CODIGO_PAGO ?? ""),
          mon: String(f.MONEDA ?? "CUP"),
          nit: String(f.NIT ?? ""),
          cuo: Number(f.CUOTA ?? 0),
          con: Number(f.CONSUMO ?? 0),
          cmi: Number(f.COMISION ?? 0),
          imp: Number(f.IMPUESTO ?? 0),
          tot: Number(f.TOTAL ?? 0),
          tp: Number(f.TOTAL_PAGAR ?? 0),
          est: String(f.ESTADO ?? "pendiente"),
          par: String(f.PARSER ?? "migrado-sqlite"),
          ocr: Number(f.OCR_CONFIDENCE ?? 0),
          dur: Number(f.OCR_DURATION ?? 0),
          arc: String(f.ARCHIVO ?? ""),
          txt: String(f.TEXTO_OCR ?? ""),
          uid: String(f.USER_ID ?? ""),
        },
      );
      copied.facturas++;
    } catch (error: any) {
      errors.push(`factura ${f.NO_FACTURA}: ${error.message}`);
    }
  }

  // 4) SERVICIOS
  for (const sv of source.servicios) {
    try {
      await execute(
        `INSERT INTO SGF_SERVICIOS (ID, FACTURA_ID, NUMERO_SERVICIO, CUOTA, CONSUMO, COMISION, IMPUESTO, IMPORTE)
         VALUES (:id, :fid, :num, :cuo, :con, :cmi, :imp, :imp2)`,
        {
          id: String(sv.ID ?? ""),
          fid: String(sv.FACTURA_ID ?? ""),
          num: String(sv.NUMERO_SERVICIO ?? ""),
          cuo: Number(sv.CUOTA ?? 0),
          con: Number(sv.CONSUMO ?? 0),
          cmi: Number(sv.COMISION ?? 0),
          imp: Number(sv.IMPUESTO ?? 0),
          imp2: Number(sv.IMPORTE ?? 0),
        },
      );
      copied.servicios++;
    } catch (error: any) {
      errors.push(`servicio ${sv.ID}: ${error.message}`);
    }
  }

  // 5) LOGS
  for (const l of source.logs) {
    try {
      const now = targetMode === "oracle" ? "SYSTIMESTAMP" : "SYSUTCDATETIME()";
      await execute(
        `INSERT INTO SGF_LOGS (ID, USER_ID, ACCION, ENTIDAD, ENTIDAD_ID, LEVEL, DETALLES, IP_ADDRESS, CREATED_AT)
         VALUES (:id, :uid, :a, :e, :eid, :n, :d, :ip, ${now})`,
        {
          id: String(l.ID ?? ""),
          uid: String(l.USER_ID ?? ""),
          a: String(l.ACCION ?? ""),
          e: String(l.ENTIDAD ?? ""),
          eid: String(l.ENTIDAD_ID ?? ""),
          n: String(l.NIVEL ?? l.LEVEL ?? "info"),
          d: String(l.DETALLES ?? ""),
          ip: String(l.IP ?? l.IP_ADDRESS ?? ""),
        },
      );
      copied.logs++;
    } catch (error: any) {
      errors.push(`log ${l.ID}: ${error.message}`);
    }
  }

  await auditLog(req, "migrar_sqlite", "sistema", targetMode, "warn",
    `Migracion SQLite -> ${targetMode}: usuarios=${copied.usuarios}, sesiones=${copied.sesiones}, facturas=${copied.facturas}, servicios=${copied.servicios}, logs=${copied.logs}, errores=${errors.length}`);

  return sendJson(res, 200, {
    success: errors.length === 0,
    message: errors.length === 0
      ? `Migracion completa. ${copied.usuarios} usuarios, ${copied.facturas} facturas, ${copied.servicios} servicios, ${copied.logs} logs copiados.`
      : `Migracion completada con ${errors.length} errores. Los primeros: ${errors.slice(0, 5).join(" | ")}`,
    data: { copied, errorCount: errors.length, firstErrors: errors.slice(0, 10) },
  });
}

export async function handleMigrateStatus(req: AuthenticatedRequest, res: ServerResponse) {
  if (!requireAdmin(req, res)) return;

  const sqliteExists = fs.existsSync(SQLITE_PATH);
  let sqliteInfo: Record<string, number> | null = null;
  if (sqliteExists) {
    try {
      const SQL = await initSqlJs();
      const db = new SQL.Database(fs.readFileSync(SQLITE_PATH));
      const collect = (table: string): number => {
        try {
          const stmt = db.prepare(`SELECT COUNT(*) AS C FROM ${table}`);
          let count = 0;
          if (stmt.step()) count = Number((stmt.getAsObject() as any).C ?? 0);
          stmt.free();
          return count;
        } catch {
          return 0;
        }
      };
      sqliteInfo = {
        usuarios: collect("SGF_USUARIOS"),
        sesiones: collect("SGF_SESIONES"),
        facturas: collect("SGF_FACTURAS"),
        servicios: collect("SGF_SERVICIOS"),
        logs: collect("SGF_LOGS"),
      };
    } catch (error: any) {
      sqliteInfo = { error: error.message } as any;
    }
  }

  return sendJson(res, 200, {
    success: true,
    data: {
      currentMode: getDbMode(),
      sqlitePath: SQLITE_PATH,
      sqliteExists,
      sqliteInfo,
    },
  });
}
