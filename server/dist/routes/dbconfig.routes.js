import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, connectMssqlRuntime, connectOracleRuntime, getDbMode, initDatabase, } from "../models/database.js";
import { sendJson, readJsonBody } from "../middleware/auth.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "../../.env");
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
const ENV_KEYS_ORDER = [
    "DB_TYPE",
    "PORT",
    "HOST",
    "ORACLE_USER",
    "ORACLE_PASSWORD",
    "ORACLE_HOST",
    "ORACLE_PORT",
    "ORACLE_SERVICE",
    "ORACLE_POOL_MIN",
    "ORACLE_POOL_MAX",
    "ORACLE_POOL_INCREMENT",
    "ORACLE_POOL_TIMEOUT",
    "MSSQL_USER",
    "MSSQL_PASSWORD",
    "MSSQL_SERVER",
    "MSSQL_PORT",
    "MSSQL_DATABASE",
    "MSSQL_ENCRYPT",
    "MSSQL_TRUST_CERT",
    "MSSQL_POOL_MIN",
    "MSSQL_POOL_MAX",
    "MSSQL_POOL_IDLE_MS",
    "JWT_SECRET",
    "JWT_EXPIRES_IN",
    "REQUEST_TIMEOUT_MS",
    "MAX_FILE_SIZE_MB",
    "LOGIN_RATE_PER_MIN",
    "LOGIN_RATE_PER_15MIN",
    "TRUST_PROXY",
];
function readEnvMap() {
    const map = new Map();
    if (!fs.existsSync(ENV_PATH))
        return map;
    const text = fs.readFileSync(ENV_PATH, "utf8");
    for (const line of text.split(/\r?\n/)) {
        if (!line.includes("=") || line.trimStart().startsWith("#"))
            continue;
        const idx = line.indexOf("=");
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1);
        map.set(key, value);
    }
    return map;
}
function saveEnvConfig(values) {
    const map = readEnvMap();
    for (const [k, v] of Object.entries(values)) {
        if (v !== undefined)
            map.set(k, v);
    }
    // Garantizar defaults razonables
    if (!map.get("DB_TYPE"))
        map.set("DB_TYPE", "");
    if (!map.get("PORT"))
        map.set("PORT", "3000");
    if (!map.get("HOST"))
        map.set("HOST", "0.0.0.0");
    if (!map.get("JWT_SECRET"))
        map.set("JWT_SECRET", "sgf-jwt-secret-cambiar-en-produccion");
    if (!map.get("JWT_EXPIRES_IN"))
        map.set("JWT_EXPIRES_IN", "8h");
    if (!map.get("REQUEST_TIMEOUT_MS"))
        map.set("REQUEST_TIMEOUT_MS", "30000");
    if (!map.get("MAX_FILE_SIZE_MB"))
        map.set("MAX_FILE_SIZE_MB", "10");
    if (!map.get("LOGIN_RATE_PER_MIN"))
        map.set("LOGIN_RATE_PER_MIN", "30");
    if (!map.get("LOGIN_RATE_PER_15MIN"))
        map.set("LOGIN_RATE_PER_15MIN", "200");
    if (!map.get("ORACLE_POOL_MIN"))
        map.set("ORACLE_POOL_MIN", "2");
    if (!map.get("ORACLE_POOL_MAX"))
        map.set("ORACLE_POOL_MAX", "20");
    if (!map.get("ORACLE_POOL_INCREMENT"))
        map.set("ORACLE_POOL_INCREMENT", "2");
    if (!map.get("ORACLE_POOL_TIMEOUT"))
        map.set("ORACLE_POOL_TIMEOUT", "60");
    if (!map.get("MSSQL_POOL_MIN"))
        map.set("MSSQL_POOL_MIN", "0");
    if (!map.get("MSSQL_POOL_MAX"))
        map.set("MSSQL_POOL_MAX", "10");
    if (!map.get("MSSQL_POOL_IDLE_MS"))
        map.set("MSSQL_POOL_IDLE_MS", "30000");
    const content = ENV_KEYS_ORDER.map((k) => `${k}=${map.get(k) ?? ""}`).join("\n") + "\n";
    fs.writeFileSync(ENV_PATH, content, "utf8");
}
async function testOracle(config) {
    try {
        const oracledb = await import("oracledb");
        const conn = await oracledb.default.getConnection({
            user: config.user,
            password: config.password,
            connectString: `${config.host}:${config.port}/${config.service}`,
        });
        const tables = await conn.execute(`SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = 'PCELULAR' AND TABLE_NAME IN ('CARGARARCH','LINEA_TELEFONICA','PERSONA','PRESUPUESTO','UNIDAD','ORGANO','CARGO','GRADO','PROVINCIA','MUNICIPIO') ORDER BY TABLE_NAME`, [], { outFormat: oracledb.default.OUT_FORMAT_OBJECT });
        await conn.close();
        return {
            success: true,
            message: "Conexion Oracle valida.",
            data: {
                type: "oracle",
                host: config.host,
                port: config.port,
                service: config.service,
                user: config.user,
                latencyMs: 0,
                tables: (tables.rows || []).map((row) => row.TABLE_NAME),
            },
        };
    }
    catch (error) {
        return {
            success: false,
            message: `Error de conexion: ${error.message}`,
            data: {
                type: "oracle",
                host: config.host,
                port: config.port,
                service: config.service,
                user: config.user,
                latencyMs: 0,
                tables: [],
            },
        };
    }
}
async function testMssql(config) {
    try {
        const mssql = await import("mssql");
        // Soportar instancias tipo SERVIDOR\SQLEXPRESS - tedious necesita instanceName separado
        let serverName = config.server;
        let instanceName;
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
            },
        }).connect();
        const started = Date.now();
        const result = await pool.request().query("SELECT 1 AS ok");
        const latency = Date.now() - started;
        const tables = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE 'SGF[_]%' ORDER BY TABLE_NAME");
        await pool.close();
        return {
            success: true,
            message: "Conexion SQL Server valida.",
            data: {
                type: "mssql",
                server: config.server,
                port: config.port,
                database: config.database,
                user: config.user,
                latencyMs: latency,
                tables: (tables.recordset || []).map((row) => row.TABLE_NAME),
            },
        };
    }
    catch (error) {
        return {
            success: false,
            message: `Error de conexion: ${error.message}`,
            data: {
                type: "mssql",
                server: config.server,
                port: config.port,
                database: config.database,
                user: config.user,
                latencyMs: 0,
                tables: [],
            },
        };
    }
}
export async function handleDbConfig(req, res) {
    return sendJson(res, 200, { success: true, data: { config: currentConfig(), mode: getDbMode() } });
}
export async function handleDbTest(req, res) {
    let body;
    try {
        body = await readJsonBody(req);
    }
    catch {
        return sendJson(res, 400, { success: false, error: "JSON invalido." });
    }
    const type = (String(body.type || "oracle").toLowerCase());
    if (type === "mssql") {
        const config = {
            type: "mssql",
            server: String(body.server || process.env.MSSQL_SERVER || "localhost").trim(),
            port: String(body.port || process.env.MSSQL_PORT || "1433").trim(),
            database: String(body.database || process.env.MSSQL_DATABASE || "sgf").trim(),
            user: String(body.user || process.env.MSSQL_USER || "sa").trim(),
            password: String(body.password || process.env.MSSQL_PASSWORD || "").trim(),
            encrypt: body.encrypt !== undefined ? Boolean(body.encrypt) : undefined,
            trustServerCertificate: body.trustServerCertificate !== undefined ? Boolean(body.trustServerCertificate) : undefined,
        };
        return sendJson(res, 200, await testMssql(config));
    }
    // default: oracle
    const config = {
        type: "oracle",
        host: String(body.host || process.env.ORACLE_HOST || "25").trim(),
        port: String(body.port || process.env.ORACLE_PORT || "1521").trim(),
        service: String(body.service || process.env.ORACLE_SERVICE || "PCELULAR").trim(),
        user: String(body.user || process.env.ORACLE_USER || "pcelular").trim(),
        password: String(body.password || process.env.ORACLE_PASSWORD || "pcelular").trim(),
    };
    return sendJson(res, 200, await testOracle(config));
}
export async function handleDbConnect(req, res) {
    // Permitir desde login sin sesion: si hay usuario logueado, debe ser admin, si no hay sesion, permitir (flujo de login)
    if (req.currentUser && req.currentUser.role !== 'admin') {
        return sendJson(res, 403, { success: false, error: "Se requiere rol de administrador." });
    }
    let body;
    try {
        body = await readJsonBody(req);
    }
    catch {
        return sendJson(res, 400, { success: false, error: "JSON invalido." });
    }
    const type = (String(body.type || "oracle").toLowerCase());
    try {
        if (type === "mssql") {
            const payload = {
                type: "mssql",
                server: String(body.server || process.env.MSSQL_SERVER || "localhost").trim(),
                port: String(body.port || process.env.MSSQL_PORT || "1433").trim(),
                database: String(body.database || process.env.MSSQL_DATABASE || "sgf").trim(),
                user: String(body.user || process.env.MSSQL_USER || "sa").trim(),
                password: String(body.password || process.env.MSSQL_PASSWORD || "").trim(),
                encrypt: body.encrypt !== undefined ? Boolean(body.encrypt) : undefined,
                trustServerCertificate: body.trustServerCertificate !== undefined ? Boolean(body.trustServerCertificate) : undefined,
            };
            saveEnvConfig({
                DB_TYPE: "mssql",
                MSSQL_SERVER: payload.server,
                MSSQL_PORT: payload.port,
                MSSQL_DATABASE: payload.database,
                MSSQL_USER: payload.user,
                MSSQL_PASSWORD: payload.password,
                MSSQL_ENCRYPT: String(payload.encrypt ?? false),
                MSSQL_TRUST_CERT: String(payload.trustServerCertificate ?? true),
            });
            await connectMssqlRuntime(payload);
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
        const payload = {
            type: "oracle",
            host: String(body.host || process.env.ORACLE_HOST || "25").trim(),
            port: String(body.port || process.env.ORACLE_PORT || "1521").trim(),
            service: String(body.service || process.env.ORACLE_SERVICE || "PCELULAR").trim(),
            user: String(body.user || process.env.ORACLE_USER || "pcelular").trim(),
            password: String(body.password || process.env.ORACLE_PASSWORD || "pcelular").trim(),
        };
        saveEnvConfig({
            DB_TYPE: "oracle",
            ORACLE_HOST: payload.host,
            ORACLE_PORT: payload.port,
            ORACLE_SERVICE: payload.service,
            ORACLE_USER: payload.user,
            ORACLE_PASSWORD: payload.password,
        });
        await connectOracleRuntime(payload);
        return sendJson(res, 200, {
            success: true,
            message: `Conectado a Oracle ${payload.host}:${payload.port}/${payload.service}. Debe iniciar sesion nuevamente.`,
            data: {
                connected: true,
                mode: getDbMode(),
                config: currentConfig(),
            },
        });
    }
    catch (error) {
        return sendJson(res, 500, {
            success: false,
            error: `No se pudo conectar (${type}): ${error.message}`,
        });
    }
}
export async function handleDbDisconnect(req, res) {
    // Permitir desconectar desde login o desde panel admin
    if (req.currentUser && req.currentUser.role !== 'admin') {
        return sendJson(res, 403, { success: false, error: "Se requiere rol de administrador." });
    }
    try {
        // Guardar DB_TYPE = sqlite
        saveEnvConfig({
            DB_TYPE: "sqlite",
        });
        process.env.DB_TYPE = "sqlite";
        // Cerrar pools actuales
        try {
            await closeDb();
        }
        catch { }
        // Reiniciar en modo sqlite
        const result = await initDatabase();
        return sendJson(res, 200, {
            success: true,
            message: "Desconectado de BD enterprise, ahora en SQLite local.",
            data: { mode: result.mode, config: currentConfig() },
        });
    }
    catch (error) {
        return sendJson(res, 500, { success: false, error: `No se pudo desconectar: ${error.message}` });
    }
}
//# sourceMappingURL=dbconfig.routes.js.map