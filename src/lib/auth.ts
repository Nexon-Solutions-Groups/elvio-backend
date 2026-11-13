import type { Response } from "express";
import jwt from "jsonwebtoken";

export const cookieName = "bazaar_token";

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is not set");
  return value;
}

export function setAuthCookie(res: Response, userId: string, role: string) {
  const token = jwt.sign({ sub: userId, role }, secret(), { expiresIn: "7d" });
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(cookieName, { path: "/" });
}

export function readToken(token: string) {
  return jwt.verify(token, secret()) as { sub: string; role: string };
}
