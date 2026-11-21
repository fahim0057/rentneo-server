import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env";
import { getDb } from "../db";
import { AppError } from "./errors";
import type { Role } from "../types/express";

// Created once. jose caches the keys and refetches if it sees an unknown key id.
const JWKS = createRemoteJWKSet(new URL(`${env.authUrl}/api/auth/jwks`));

export async function verifyToken(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new AppError(401, "Unauthorized: token missing");

    const token = header.split(" ")[1];
    let email: string;
    try {
      const { payload } = await jwtVerify(token, JWKS, { issuer: env.authUrl });
      email = String(payload.email ?? "");
    } catch {
      throw new AppError(401, "Invalid or expired token");
    }
    if (!email) throw new AppError(401, "Invalid token payload");

    const db = await getDb();
    const user = await db.collection("user").findOne({ email });
    if (!user) throw new AppError(401, "User not found");

    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: (user.role as Role) ?? "customer",
    };
    next();
  } catch (err) {
    next(err);
  }
}

function allowRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, "Unauthorized"));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, `Forbidden: ${roles.join(" or ")} access required`));
    }
    next();
  };
}

export const verifyRenter = allowRoles("customer");
export const verifyOwner = allowRoles("owner");
export const verifyAdmin = allowRoles("admin");