import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare function handleGetLogs(req: AuthenticatedRequest, res: ServerResponse, url: URL): Promise<void>;
export declare function handleClearLogs(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
