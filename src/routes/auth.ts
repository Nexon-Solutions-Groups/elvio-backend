import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { clearAuthCookie, setAuthCookie } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { wrap } from "../lib/http";
import { attachUser } from "../middleware/auth";

const router = Router();

const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
} as const;

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().email("Enter a valid email").transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Use at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Enter your password"),
});

router.post(
  "/register",
  wrap(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 10),
        cart: { create: {} },
      },
      select: publicUser,
    });
    setAuthCookie(res, user.id, user.role);
    res.status(201).json({ user });
  }),
);

router.post(
  "/login",
  wrap(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    const valid = user ? await bcrypt.compare(data.password, user.passwordHash) : false;
    if (!user || !valid) {
      res.status(401).json({ error: "Email or password is incorrect" });
      return;
    }
    await prisma.cart.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    setAuthCookie(res, user.id, user.role);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
    });
  }),
);

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get(
  "/me",
  wrap(async (req, res) => {
    const user = await attachUser(req);
    res.json({ user });
  }),
);

export default router;
