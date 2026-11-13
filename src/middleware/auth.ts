import type { NextFunction, Request, Response } from "express";
import { cookieName, readToken } from "../lib/auth";
import { prisma } from "../lib/prisma";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
} as const;

export async function attachUser(req: Request) {
  const token = req.cookies?.[cookieName];
  if (!token) return null;
  try {
    const payload = readToken(token);
    return prisma.user.findUnique({ where: { id: payload.sub }, select: userSelect });
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await attachUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "You do not have access to this" });
      return;
    }
    next();
  };
}
