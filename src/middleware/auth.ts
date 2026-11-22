import type { NextFunction, Request, Response } from "express";
import { ObjectId, type Document, type Filter } from "mongodb";
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

    const token = header.slice("Bearer ".length).trim();
    if (!token) throw new AppError(401, "Unauthorized: token missing");

    let sub: string;
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: env.authUrl,
        audience: env.authUrl,
      });
      // Resolve the user by the immutable subject, never by email: emails can be
      // changed and later reclaimed, which would let an old token act as another user.
      sub = typeof payload.sub === "string" ? payload.sub : "";
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (
        code === "ERR_JWKS_TIMEOUT" ||
        code === "ERR_JWKS_INVALID_200_RESPONSE" ||
        code === "ERR_JOSE_GENERIC"
      ) {
        throw new AppError(503, "Authentication service unavailable");
      }
      throw new AppError(401, "Invalid or expired token");
    }
    if (!sub) throw new AppError(401, "Invalid token payload");

    const db = await getDb();
    const idFilter: Filter<Document> = ObjectId.isValid(sub)
      ? { _id: new ObjectId(sub) }
      : { _id: sub as unknown as ObjectId };
    const user = await db.collection("user").findOne(idFilter);
    if (!user) throw new AppError(401, "User not found");

    const role: Role =
      user.role === "owner" || user.role === "admin" || user.role === "customer"
        ? user.role
        : "customer";

    req.user = {
      id: String(user._id),
      email: String(user.email ?? ""),
      name: String(user.name ?? ""),
      role,
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

// Anyone signed in can rent; renting and listing are separate capabilities.
export const verifyRenter = allowRoles("customer", "owner", "admin");
export const verifyOwner = allowRoles("owner");
export const verifyAdmin = allowRoles("admin");
export const verifyOwnerOrAdmin = allowRoles("owner", "admin");