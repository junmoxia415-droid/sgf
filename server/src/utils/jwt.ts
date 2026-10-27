import jwt, { type Secret } from "jsonwebtoken";
import { JWT_CONFIG } from "../config/index.js";
import type { SessionUser } from "../models/types.js";

export function signToken(user: SessionUser): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    },
    JWT_CONFIG.secret as Secret,
    { expiresIn: JWT_CONFIG.expiresIn as any },
  );
}

export function verifyToken(token: string): SessionUser {
  const payload = jwt.verify(token, JWT_CONFIG.secret as Secret) as any;
  return {
    id: String(payload.sub),
    username: String(payload.username || ""),
    role: payload.role === "admin" ? "admin" : "usuario",
    name: String(payload.name || ""),
    active: true,
    createdAt: "",
  };
}

export function safeVerifyToken(token: string): SessionUser | null {
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}
