export declare const APP_CONFIG: {
    name: string;
    fullName: string;
    version: string;
    description: string;
};
export declare const SERVER_CONFIG: {
    port: number;
    host: string;
    requestTimeoutMs: number;
    maxFileSizeMb: number;
};
export declare const JWT_CONFIG: {
    secret: string;
    expiresIn: string;
};
export declare const SECURITY_CONFIG: {
    loginRatePerMin: number;
    loginRatePer15Min: number;
    trustProxy: string;
};
export declare const DB_TYPE_CONFIG: {
    /**
     * Tipo de BD a usar al arrancar. Opciones:
     *   - "sqlite"  -> BD local (archivo .db en server-data/)
     *   - "oracle"  -> Oracle PCELULAR (requiere host, user, password, service)
     *   - "mssql"   -> Microsoft SQL Server (requiere server, database, user, password)
     * Si esta vacio, se intenta Oracle -> SQL Server -> SQLite en ese orden.
     */
    type: string;
};
export declare const ORACLE_CONFIG: {
    user: string;
    password: string;
    host: string;
    port: number;
    service: string;
    readonly connectString: string;
    pool: {
        min: number;
        max: number;
        increment: number;
        timeout: number;
    };
};
export declare const MSSQL_CONFIG: {
    user: string;
    password: string;
    server: string;
    port: number;
    database: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
    pool: {
        min: number;
        max: number;
        idleTimeoutMs: number;
    };
};
