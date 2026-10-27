import jwt from "jsonwebtoken";
import { JWT_CONFIG } from "../config/index.js";
export function signToken(user) {
    return jwt.sign({
        sub: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
    }, JWT_CONFIG.secret, { expiresIn: JWT_CONFIG.expiresIn });
}
export function verifyToken(token) {
    const payload = jwt.verify(token, JWT_CONFIG.secret);
    return {
        id: String(payload.sub),
        username: String(payload.username || ""),
        role: payload.role === "admin" ? "admin" : "usuario",
        name: String(payload.name || ""),
        active: true,
        createdAt: "",
    };
}
export function safeVerifyToken(token) {
    try {
        return verifyToken(token);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=jwt.js.map