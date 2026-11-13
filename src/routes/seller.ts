import { Router } from "express";
import { z } from "zod";
import { OrderStatus, ProductStatus, Role, StoreStatus } from "../lib/constants";
import { HttpError, wrap } from "../lib/http";
import { prisma } from "../lib/prisma";
import { orderActions } from "../lib/serialize";
import { uniqueSlug } from "../lib/slug";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const imageUrl = z
  .string()
  .refine((value) => value.startsWith("/uploads/") || value.startsWith("https://"), "Use an uploaded image");

const productSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a product name").max(80),
    description: z.string().trim().min(10, "Describe the piece").max(2000),
    price: z.number().int().positive("Enter a price").max(1_000_000),
    compareAtPrice: z.number().int().positive().max(1_000_000).nullable().optional(),
    stock: z.number().int().min(0).max(100_000),
    categoryId: z.string().min(1, "Choose a category"),
    status: z.enum([ProductStatus.ACTIVE, ProductStatus.HIDDEN]).default(ProductStatus.ACTIVE),
    images: z.array(imageUrl).max(5).default([]),
  })
  .refine((value) => value.compareAtPrice == null || value.compareAtPrice > value.price, {
    message: "Compare-at price should be higher than the price",
  });

const storeSchema = z.object({
  name: z.string().trim().min(2, "Name your store").max(60),
  description: z.string().trim().min(10, "Tell buyers what you sell").max(400),
  city: z.string().trim().min(2, "Enter a city").max(60),
  bannerUrl: z.union([imageUrl, z.literal("")]).optional(),
});

async function ownedStore(userId: string) {
  const store = await prisma.store.findUnique({ where: { ownerId: userId } });
  if (!store) throw new HttpError(404, "Open a store first");
  return store;
}

function serializeSellerProduct(product: {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  status: string;
  categoryId: string;
  category: { name: string };
  images: { url: string }[];
}) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    stock: product.stock,
    status: product.status,
    categoryId: product.categoryId,
    category: product.category.name,
    image: product.images[0]?.url ?? null,
    images: product.images.map((image) => image.url),
  };
}

router.get(
  "/store",
  wrap(async (req, res) => {
    const store = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
    res.json({ store });
  }),
);

router.post(
  "/store",
  wrap(async (req, res) => {
    if (req.user!.role === Role.ADMIN) {
      throw new HttpError(403, "Admin accounts cannot open a store");
    }
    const existing = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
    if (existing) throw new HttpError(409, "You already have a store");
    const data = storeSchema.parse(req.body);
    const slug = await uniqueSlug(data.name, async (candidate) => {
      const found = await prisma.store.findUnique({ where: { slug: candidate } });
      return Boolean(found);
    });
    const store = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.user!.id },
        data: { role: Role.SELLER },
      });
      return tx.store.create({
        data: {
          ownerId: req.user!.id,
          name: data.name,
          slug,
          description: data.description,
          city: data.city,
          bannerUrl: data.bannerUrl || null,
        },
      });
    });
    res.status(201).json({ store });
  }),
);

router.get(
  "/summary",
  wrap(async (req, res) => {
    const store = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
    if (!store) {
      res.json({
        store: null,
        productCount: 0,
        orderCount: 0,
        openOrderCount: 0,
        revenue: 0,
        recentOrders: [],
      });
      return;
    }
    const [productCount, orders, recent] = await Promise.all([
      prisma.product.count({ where: { storeId: store.id } }),
      prisma.order.findMany({ where: { storeId: store.id } }),
      prisma.order.findMany({
        where: { storeId: store.id },
        include: {
          store: { select: { name: true, slug: true } },
          items: { select: { id: true, name: true, price: true, quantity: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
    const live = orders.filter((order) => order.status !== OrderStatus.CANCELLED);
    const open = orders.filter((order) =>
      [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.SHIPPED].includes(
        order.status as "PENDING",
      ),
    );
    res.json({
      store,
      productCount,
      orderCount: orders.length,
      openOrderCount: open.length,
      revenue: live.reduce((sum, order) => sum + order.total, 0),
      recentOrders: recent.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        actions: orderActions(order.status),
      })),
    });
  }),
);

router.get(
  "/products",
  wrap(async (req, res) => {
    const store = await ownedStore(req.user!.id);
    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      include: { images: { orderBy: { position: "asc" } }, category: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ products: products.map(serializeSellerProduct) });
  }),
);

router.get(
  "/products/:id",
  wrap(async (req, res) => {
    const store = await ownedStore(req.user!.id);
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: store.id },
      include: { images: { orderBy: { position: "asc" } }, category: true },
    });
    if (!product) throw new HttpError(404, "Product not found");
    res.json({ product: serializeSellerProduct(product) });
  }),
);

router.post(
  "/products",
  wrap(async (req, res) => {
    const store = await ownedStore(req.user!.id);
    const data = productSchema.parse(req.body);
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new HttpError(400, "Choose a category");
    const slug = await uniqueSlug(data.name, async (candidate) => {
      const found = await prisma.product.findUnique({ where: { slug: candidate } });
      return Boolean(found);
    });
    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        name: data.name,
        slug,
        description: data.description,
        price: data.price,
        compareAtPrice: data.compareAtPrice ?? null,
        stock: data.stock,
        status: data.status,
        images: {
          create: data.images.map((url, position) => ({ url, position })),
        },
      },
      include: { images: { orderBy: { position: "asc" } }, category: true },
    });
    res.status(201).json({ product: serializeSellerProduct(product) });
  }),
);

router.patch(
  "/products/:id",
  wrap(async (req, res) => {
    const store = await ownedStore(req.user!.id);
    const data = productSchema.parse(req.body);
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: store.id },
    });
    if (!existing) throw new HttpError(404, "Product not found");
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new HttpError(400, "Choose a category");

    const product = await prisma.$transaction(async (tx) => {
      await tx.productImage.deleteMany({ where: { productId: existing.id } });
      return tx.product.update({
        where: { id: existing.id },
        data: {
          categoryId: category.id,
          name: data.name,
          description: data.description,
          price: data.price,
          compareAtPrice: data.compareAtPrice ?? null,
          stock: data.stock,
          status: data.status,
          images: { create: data.images.map((url, position) => ({ url, position })) },
        },
        include: { images: { orderBy: { position: "asc" } }, category: true },
      });
    });
    res.json({ product: serializeSellerProduct(product) });
  }),
);

router.delete(
  "/products/:id",
  wrap(async (req, res) => {
    const store = await ownedStore(req.user!.id);
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: store.id },
    });
    if (!existing) throw new HttpError(404, "Product not found");
    await prisma.product.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);

router.get(
  "/orders",
  wrap(async (req, res) => {
    const store = await ownedStore(req.user!.id);
    const orders = await prisma.order.findMany({
      where: { storeId: store.id },
      include: {
        store: { select: { name: true, slug: true } },
        items: { select: { id: true, name: true, price: true, quantity: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      orders: orders.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        actions: orderActions(order.status),
      })),
    });
  }),
);

router.patch(
  "/orders/:id",
  wrap(async (req, res) => {
    const store = await ownedStore(req.user!.id);
    const data = z.object({ status: z.string() }).parse(req.body);
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: store.id },
      include: { items: true },
    });
    if (!order) throw new HttpError(404, "Order not found");
    const allowed = orderActions(order.status);
    if (!allowed.includes(data.status)) {
      throw new HttpError(400, "That status change is not available");
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.status === OrderStatus.CANCELLED) {
        for (const item of order.items) {
          if (!item.productId) continue;
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
      return tx.order.update({
        where: { id: order.id },
        data: {
          status: data.status,
          paymentStatus: data.status === OrderStatus.DELIVERED ? "COLLECTED" : order.paymentStatus,
        },
        include: {
          store: { select: { name: true, slug: true } },
          items: { select: { id: true, name: true, price: true, quantity: true } },
        },
      });
    });

    res.json({
      order: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        actions: orderActions(updated.status),
      },
    });
  }),
);

export default router;
