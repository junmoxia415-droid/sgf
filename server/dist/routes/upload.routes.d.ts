import type { ServerResponse } from "node:http";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare function handleUploadFactura(req: AuthenticatedRequest, res: ServerResponse): Promise<void>;
