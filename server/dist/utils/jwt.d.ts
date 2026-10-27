import type { SessionUser } from "../models/types.js";
export declare function signToken(user: SessionUser): string;
export declare function verifyToken(token: string): SessionUser;
export declare function safeVerifyToken(token: string): SessionUser | null;
