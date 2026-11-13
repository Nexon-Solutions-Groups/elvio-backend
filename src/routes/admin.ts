import { Router } from "express";
import { z } from "zod";
import { OrderStatus, Role, StoreStatus } from "../lib/constants";
import { HttpError, wrap } from "../lib/http";
import { prisma } from "../lib/prisma";
import { uniqueSlug } from "../lib/slug";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole(Role.ADMIN));

router.get(
  "/summary",
  wrap(async (_req, res) => {
    const [stores, products, orders, recent] = await Promise.all([
      prisma.store.count(),
      prisma.product.count(),
      prisma.order.findMany(),
      prisma.order.findMany({
        include: {
          store: { select: { name: true, slug: true } },
          items: { select: { id: true, name: true, price: true, quantity: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);
    const live = orders.filter((order) => order.status !== OrderStatus.CANCELLED);
    res.json({
      stores,
      products,
      orders: orders.length,
      revenue: live.reduce((sum, order) => sum + order.total, 0),
      recentOrders: recent.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
      })),
    });
  }),
);

router.get(
  "/categories",
  wrap(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    res.json({
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        productCount: category._count.products,
      })),
    });
  }),
);

router.post(
  "/categories",
  wrap(async (req, res) => {
    const data = z.object({ name: z.string().trim().min(2, "Name the category").max(40) }).parse(req.body);
    const slug = await uniqueSlug(data.name, async (candidate) => {
      const found = await prisma.category.findUnique({ where: { slug: candidate } });
      return Boolean(found);
    });
    const category = await prisma.category.create({ data: { name: data.name, slug } });
    res.status(201).json({ category });
  }),
);

router.delete(
  "/categories/:id",
  wrap(async (req, res) => {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new HttpError(404, "Category not found");
    if (category._count.products > 0) {
      throw new HttpError(400, "Move products out of this category first");
    }
    await prisma.category.delete({ where: { id: category.id } });
    res.json({ ok: true });
  }),
);

router.get(
  "/stores",
  wrap(async (_req, res) => {
    const stores = await prisma.store.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { name: true, email: true } },
        _count: { select: { products: true, orders: true } },
      },
    });
    res.json({
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        slug: store.slug,
        city: store.city,
        status: store.status,
        owner: store.owner,
        productCount: store._count.products,
        orderCount: store._count.orders,
      })),
    });
  }),
);

router.patch(
  "/stores/:id",
  wrap(async (req, res) => {
    const data = z.object({ status: z.enum([StoreStatus.ACTIVE, StoreStatus.SUSPENDED]) }).parse(req.body);
    const store = await prisma.store.findUnique({ where: { id: req.params.id } });
    if (!store) throw new HttpError(404, "Store not found");
    const updated = await prisma.store.update({
      where: { id: store.id },
      data: { status: data.status },
    });
    res.json({ store: updated });
  }),
);

export default router;
