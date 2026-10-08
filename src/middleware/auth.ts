import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import db from "../db/database.ts";

const JWT_SECRET = process.env.JWT_SECRET || "dev_only_insecure_fallback_secret";

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
  level: string;
  name: string;
  status: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  userId?: string;
  username?: string;
  userRole?: string;
  userLevel?: string;
  userEmail?: string;
}

/**
 * Middleware that extracts and securely verifies user identity from
 * Authorization Header (Bearer JWT), Cookie (auth_token), or authenticated session headers.
 */
export const populateUserSession = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    let token: string | null = null;

    // 1. Check Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }

    // 2. Check auth_token from cookies
    if (!token && req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const lookupUsername = decoded.username || decoded.sub;

        if (lookupUsername) {
          const user = db
            .prepare("SELECT id, username, role, level, name, status FROM users WHERE username = ? COLLATE NOCASE")
            .get(lookupUsername) as any;

          if (user && user.status === "APPROVED") {
            req.user = user;
            req.userId = user.id;
            req.username = user.username;
            req.userRole = user.role;
            req.userLevel = user.level;
            req.userEmail = user.username;
            return next();
          }
        }
      } catch (jwtErr) {
        // Token invalid or expired
      }
    }
  } catch (err) {
    console.error("[AuthMiddleware] Session extraction error:", err);
  }

  // Strictly no header spoofing or artificial bypass. Unauthenticated remains unauthenticated.
  next();
};

/**
 * Strict authentication guard. Blocks unauthenticated access.
 */
export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.userId || !req.userRole) {
    return res.status(401).json({
      error: "Authentication required. Please log in to access this resource.",
    });
  }
  next();
};

/**
 * Strict Role-Based Access Control (RBAC) middleware.
 * Verifies that the authenticated user possesses one of the required roles or executive privileges.
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Enforce authentication first
    if (!req.userId || !req.userRole) {
      return res.status(401).json({
        error: "Authentication required. Please log in with valid credentials.",
      });
    }

    const roleUpper = (req.userRole || "").toString().trim().toUpperCase();

    // 2. Executive / God-tier roles with system-wide authorization
    const EXECUTIVE_ROLES = ["FC", "BOD", "DIRECTOR", "SUPERADMIN", "ADMIN"];
    if (EXECUTIVE_ROLES.includes(roleUpper)) {
      return next();
    }

    // 3. Check against permitted roles list
    const allowedUpper = allowedRoles.map((r) => r.trim().toUpperCase());
    if (allowedUpper.includes(roleUpper)) {
      return next();
    }

    // 4. Deny access if role does not match
    return res.status(403).json({
      error: `Access denied. Role '${roleUpper}' does not have permission to access this resource.`,
      requiredRoles: allowedRoles,
    });
  };
};
