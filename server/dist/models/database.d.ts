type DbMode = "mssql" | "oracle" | "sqlite";
/**
 * Ejecuta las escrituras pendientes AHORA, sin esperar al temporizador.
 * Se llama al terminar una importacion masiva y al cerrar el servidor.
 */
export declare function flushDisk(): void;
/**
 * Ejecuta un bloque de escrituras manteniendo los datos solo en memoria y
 * guardando en disco UNA sola vez al final. Sin esto, una importacion de N
 * filas dejaba el guardado pendiente (1 s) y un corte perdia todo el lote;
 * ademas db.export() se disparaba en cada fila en modo normal.
 */
export declare function conGuardadoFinal<T>(fn: () => Promise<T>): Promise<T>;
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
/**
 * Convierte SQL "abstracto" (con placeholders :name, funciones Oracle como
 * SYSTIMESTAMP o NVL) al dialecto de cada motor. Solo se aplica cuando NO
 * estamos en Oracle.
 */
declare function toSqlite(sql: string): string;
/**
 * Convierte SQL "abstracto" a T-SQL de SQL Server. Las funciones se
 * sustituyen a sus equivalentes. Los placeholders :name se mantienen
 * porque mssql los acepta directamente (los convierte a @name).
 */
declare function toMssql(sql: string): string;
/**
 * Helpers de expresiones comunes por motor. Se usan en las rutas
 * para no tener ifs (mode === "oracle") repetidos en cada query.
 */
export declare function nowExpr(): "datetime('now')" | "SYSUTCDATETIME()" | "SYSTIMESTAMP";
export declare function expireExpr(horas: number): string;
export declare function paginationExpr(offsetAlias: string, limitAlias: string): string;
export declare function nullableCoalesce(...args: string[]): string;
export declare function connectOracleRuntime(config?: Partial<OracleRuntimeConfig>): Promise<{
    ok: boolean;
    config: {
        user: string;
        password: string;
        host: string;
        port: string;
        service: string;
    };
}>;
export declare function connectMssqlRuntime(config?: Partial<MssqlRuntimeConfig>): Promise<{
    ok: boolean;
    config: {
        server: string;
        port: number;
        database: string;
        user: string;
    };
}>;
export declare function initDatabase(): Promise<{
    mode: "sqlite";
    ok: boolean;
} | {
    mode: "mssql";
    ok: boolean;
} | {
    mode: "oracle";
    ok: boolean;
}>;
export declare function getDbMode(): DbMode;
export declare function isEnterprise(): boolean;
export declare function isOracleLegacyTablesAvailable(): boolean;
export declare function query<T = any>(sql: string, params?: Record<string, any>): Promise<T[]>;
export declare function execute(sql: string, params?: Record<string, any>): Promise<number>;
export interface DbRunner {
    run: (sql: string, params?: Record<string, any>) => Promise<number>;
    all: (sql: string, params?: Record<string, any>) => Promise<any[]>;
}
export declare function transaction<T>(fn: (db: DbRunner) => Promise<T>): Promise<T>;
export declare function pingDb(): Promise<{
    ok: boolean;
    msg: any;
    ms: number;
}>;
export declare function closeDb(): Promise<void>;
export declare function ensureColumnExists(table: string, column: string, type: string): Promise<void>;
export { toMssql, toSqlite };
