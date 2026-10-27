export declare function getPool(): Promise<any>;
export declare function pingOracle(): Promise<{
    ok: boolean;
    message: string;
    connectString: string;
    latencyMs: number;
}>;
export declare function query<T = any>(sql: string, params?: Record<string, unknown>): Promise<T[]>;
export declare function execute(sql: string, params?: Record<string, unknown>, autoCommit?: boolean): Promise<number>;
export declare function transaction<T>(fn: (conn: any) => Promise<T>): Promise<T>;
export declare function closePool(): Promise<void>;
