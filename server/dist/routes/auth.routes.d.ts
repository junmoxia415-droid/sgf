import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare function handleLogin(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleLogout(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleMe(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
