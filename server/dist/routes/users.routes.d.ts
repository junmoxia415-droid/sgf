import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare function handleGetUsers(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleCreateUser(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
export declare function handleUpdateUser(req: AuthenticatedRequest, res: ServerResponse, userId: string): Promise<void>;
export declare function handleDeleteUser(req: AuthenticatedRequest, res: ServerResponse, userId: string): Promise<void>;
