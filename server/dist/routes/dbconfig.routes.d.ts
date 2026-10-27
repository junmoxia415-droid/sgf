import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare function handleDbConfig(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleDbTest(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleDbConnect(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleDbDisconnect(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
