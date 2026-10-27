import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare function handleSearchServicios(req: AuthenticatedRequest, res: ServerResponse, url: URL): Promise<void>;
