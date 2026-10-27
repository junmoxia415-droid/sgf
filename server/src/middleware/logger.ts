import { randomUUID } from "node:crypto";
import { execute, getDbMode } from "../models/database.js";
import type { AuthenticatedRequest } from "./auth.js";
import { getRequestIp } from "./auth.js";

export async function auditLog(
  req: AuthenticatedRequest,
  accion: string,
  entidad: string,
  entidadId: string,
  nivel: "info" | "warn" | "error" = "info",
  detalles = "",
) {
  try {
    if (getDbMode() === "oracle") {
      await execute(
        `INSERT INTO SGF_LOGS (ID, USER_ID, ACCION, ENTIDAD, ENTIDAD_ID, LEVEL, DETALLES, IP_ADDRESS, CREATED_AT)
         VALUES (:id, :uid, :a, :e, :eid, :n, :d, :ip, SYSTIMESTAMP)`,
        {
          id: randomUUID(),
          uid: req.currentUser?.id || null,
          a: accion,
          e: entidad,
          eid: entidadId,
          n: nivel,
          d: detalles.slice(0, 4000),
          ip: getRequestIp(req),
        },
      );
      return;
    }

    if (getDbMode() === "mssql") {
      await execute(
        `INSERT INTO SGF_LOGS (ID, USER_ID, ACCION, ENTIDAD, ENTIDAD_ID, LEVEL, DETALLES, IP_ADDRESS, CREATED_AT)
         VALUES (:id, :uid, :a, :e, :eid, :n, :d, :ip, SYSUTCDATETIME())`,
        {
          id: randomUUID(),
          uid: req.currentUser?.id || null,
          a: accion,
          e: entidad,
          eid: entidadId,
          n: nivel,
          d: detalles.slice(0, 4000),
          ip: getRequestIp(req),
        },
      );
      return;
    }

    await execute(
      `INSERT INTO SGF_LOGS (ID, USER_ID, ACCION, ENTIDAD, ENTIDAD_ID, NIVEL, DETALLES, IP, CREADO)
       VALUES (:id, :uid, :a, :e, :eid, :n, :d, :ip, datetime('now'))`,
      {
        id: randomUUID(),
        uid: req.currentUser?.id || "anonimo",
        a: accion,
        e: entidad,
        eid: entidadId,
        n: nivel,
        d: detalles.slice(0, 4000),
        ip: getRequestIp(req),
      },
    );
  } catch (error: any) {
    console.error("[SGF] Audit error:", error.message);
  }
}
