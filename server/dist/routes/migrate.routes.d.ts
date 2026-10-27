import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare function handleMigrateFromSqlite(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleMigrateStatus(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
