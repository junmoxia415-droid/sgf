import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getPool, execute, closePool } from "../models/oracle.js";
const TABLES = [
    `CREATE TABLE SGF_USUARIOS (ID VARCHAR2(36) PRIMARY KEY, USERNAME VARCHAR2(50) NOT NULL UNIQUE, NAME VARCHAR2(200) NOT NULL, ROLE VARCHAR2(20) DEFAULT 'usuario' NOT NULL, PASSWORD_HASH VARCHAR2(255) NOT NULL, ACTIVE NUMBER(1) DEFAULT 1 NOT NULL, CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)`,
    `CREATE TABLE SGF_FACTURAS (ID VARCHAR2(36) PRIMARY KEY, CLIENTE VARCHAR2(500) NOT NULL, CUENTA VARCHAR2(500), NUMERO_CLIENTE VARCHAR2(50), NUMERO_CUENTA VARCHAR2(50), NO_FACTURA VARCHAR2(50), FECHA_EMISION VARCHAR2(30), FECHA_VENCIMIENTO VARCHAR2(30), PERIODO_CONSUMO VARCHAR2(60), CODIGO_PAGO VARCHAR2(30), MONEDA VARCHAR2(10) DEFAULT 'CUP', NIT VARCHAR2(30), CUOTA NUMBER(18,4) DEFAULT 0, CONSUMO NUMBER(18,4) DEFAULT 0, COMISION NUMBER(18,4) DEFAULT 0, IMPUESTO NUMBER(18,4) DEFAULT 0, TOTAL NUMBER(18,4) DEFAULT 0, TOTAL_PAGAR NUMBER(18,4) DEFAULT 0, ESTADO VARCHAR2(20) DEFAULT 'pendiente', PARSER VARCHAR2(50), OCR_CONFIDENCE NUMBER(5,2) DEFAULT 0, OCR_DURATION NUMBER(10) DEFAULT 0, ARCHIVO VARCHAR2(500), TEXTO_OCR CLOB, USER_ID VARCHAR2(36) NOT NULL, CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)`,
    `CREATE TABLE SGF_SERVICIOS (ID VARCHAR2(36) PRIMARY KEY, FACTURA_ID VARCHAR2(36) NOT NULL, NUMERO_SERVICIO VARCHAR2(50) NOT NULL, CUOTA NUMBER(18,4) DEFAULT 0, CONSUMO NUMBER(18,4) DEFAULT 0, COMISION NUMBER(18,4) DEFAULT 0, IMPUESTO NUMBER(18,4) DEFAULT 0, IMPORTE NUMBER(18,4) DEFAULT 0)`,
    `CREATE TABLE SGF_LOGS (ID VARCHAR2(36) PRIMARY KEY, USER_ID VARCHAR2(36), ACCION VARCHAR2(100) NOT NULL, ENTIDAD VARCHAR2(100), ENTIDAD_ID VARCHAR2(36), LEVEL VARCHAR2(10) DEFAULT 'info', DETALLES VARCHAR2(4000), IP_ADDRESS VARCHAR2(50), CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)`,
    `CREATE TABLE SGF_SESIONES (ID VARCHAR2(36) PRIMARY KEY, USER_ID VARCHAR2(36) NOT NULL, SESSION_TOKEN VARCHAR2(255) NOT NULL UNIQUE, MACHINE_ID VARCHAR2(200), IP_ADDRESS VARCHAR2(50), ACTIVE NUMBER(1) DEFAULT 1, CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, EXPIRES_AT TIMESTAMP NOT NULL, ENDED_AT TIMESTAMP)`,
];
const INDEXES = [
    `CREATE INDEX IDX_FACTURAS_USER_ID ON SGF_FACTURAS(USER_ID)`,
    `CREATE INDEX IDX_FACTURAS_ESTADO ON SGF_FACTURAS(ESTADO)`,
    `CREATE INDEX IDX_FACTURAS_NO_FACTURA ON SGF_FACTURAS(NO_FACTURA)`,
    `CREATE INDEX IDX_FACTURAS_CREATED_AT ON SGF_FACTURAS(CREATED_AT)`,
    `CREATE INDEX IDX_SERVICIOS_FACTURA_ID ON SGF_SERVICIOS(FACTURA_ID)`,
    `CREATE INDEX IDX_LOGS_USER_ID ON SGF_LOGS(USER_ID)`,
    `CREATE INDEX IDX_LOGS_CREATED_AT ON SGF_LOGS(CREATED_AT)`,
    `CREATE INDEX IDX_SESIONES_USER_ID ON SGF_SESIONES(USER_ID)`,
    `CREATE INDEX IDX_SESIONES_TOKEN ON SGF_SESIONES(SESSION_TOKEN)`,
];
async function main() {
    console.log("[SGF] Inicializando base de datos Oracle...");
    await getPool();
    console.log("[SGF] Pool creado.");
    for (const sql of TABLES) {
        try {
            await execute(sql);
            const name = sql.match(/CREATE TABLE (\w+)/)?.[1] || "?";
            console.log(`  [OK] Tabla ${name}`);
        }
        catch (err) {
            if (err.message?.includes("ORA-00955") || err.message?.includes("already exists"))
                console.log(`  [SKIP] Tabla ya existe`);
            else
                console.error(`  [FAIL] ${err.message}`);
        }
    }
    for (const sql of INDEXES) {
        try {
            await execute(sql);
            const name = sql.match(/CREATE INDEX (\w+)/)?.[1] || "?";
            console.log(`  [OK] Indice ${name}`);
        }
        catch (err) {
            if (err.message?.includes("ORA-00955") || err.message?.includes("already exists"))
                console.log(`  [SKIP] Indice ya existe`);
            else
                console.error(`  [FAIL] ${err.message}`);
        }
    }
    const adminId = randomUUID();
    const adminHash = await bcrypt.hash("123", 12);
    try {
        await execute("INSERT INTO SGF_USUARIOS (ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE, CREATED_AT, UPDATED_AT) VALUES (:id, 'yolexis', 'Administrador SGF', 'admin', :hash, 1, SYSTIMESTAMP, SYSTIMESTAMP)", { id: adminId, hash: adminHash });
        console.log("  [OK] Usuario admin: yolexis / 123");
    }
    catch (err) {
        if (err.message?.includes("ORA-00001") || err.message?.includes("unique"))
            console.log("  [SKIP] Admin ya existe");
        else
            console.error(`  [FAIL] ${err.message}`);
    }
    console.log("\n[SGF] Inicializacion completada.");
    await closePool();
    process.exit(0);
}
main().catch((err) => { console.error("[SGF] Error fatal:", err); process.exit(1); });
//# sourceMappingURL=init-db.js.map