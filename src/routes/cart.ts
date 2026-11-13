import { Router } from "express";
import { z } from "zod";
import { ProductStatus, StoreStatus } from "../lib/constants";
import { HttpError, wrap } from "../lib/http";
import { prisma } from "../lib/prisma";
import { isPurchasable, quoteItems } from "../lib/serialize";
import { requireAuth } from "../middleware/auth";

const router = Router();

const itemInclude = {
  product: {
    include: {
      images: { orderBy: { position: "asc" as const } },
      store: true,
    },
  },
};

async function loadCart(userId: string) {
  const cart = await prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: { items: { include: itemInclude, orderBy: { id: "asc" } } },
  });
  const items = cart.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    quantity: item.quantity,
    product: {
      name: item.product.name,
      slug: item.product.slug,
      price: item.product.price,
      stock: item.product.stock,
      image: item.product.images[0]?.url ?? null,
      available: isPurchasable(item.product, item.quantity),
      store: {
        id: item.product.store.id,
        name: item.product.store.name,
        slug: item.product.store.slug,
      },
    },
  }));
  const billable = cart.items.filter((item) => isPurchasable(item.product, item.quantity));
  return { items, ...quoteItems(billable) };
}

router.get(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    res.json(await loadCart(req.user!.id));
  }),
);

router.post(
  "/items",
  requireAuth,
  wrap(async (req, res) => {
    const data = z
      .object({
        productId: z.string().min(1),
        quantity: z.number().int().positive().max(20).default(1),
      })
      .parse(req.body);

    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      include: { store: true },
    });
    if (!product || product.status !== ProductStatus.ACTIVE || product.store.status !== StoreStatus.ACTIVE) {
      throw new HttpError(404, "That piece is no longer available");
    }

    const cart = await prisma.cart.upsert({
      where: { userId: req.user!.id },
      update: {},
      create: { userId: req.user!.id },
    });
    const existing = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId: product.id } },
    });
    const nextQuantity = (existing?.quantity ?? 0) + data.quantity;
    if (nextQuantity > product.stock) {
      throw new HttpError(400, `Only ${product.stock} left of ${product.name}`);
    }

    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity },
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId: product.id, quantity: data.quantity },
      });
    }

    res.status(201).json(await loadCart(req.user!.id));
  }),
);

router.patch(
  "/items/:id",
  requireAuth,
  wrap(async (req, res) => {
    const data = z.object({ quantity: z.number().int().min(0).max(20) }).parse(req.body);
    const item = await prisma.cartItem.findFirst({
      where: { id: req.params.id, cart: { userId: req.user!.id } },
      include: { product: true },
    });
    if (!item) throw new HttpError(404, "Item not in your bag");
    if (data.quantity === 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      if (data.quantity > item.product.stock) {
        throw new HttpError(400, `Only ${item.product.stock} left of ${item.product.name}`);
      }
      await prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity: data.quantity },
      });
    }
    res.json(await loadCart(req.user!.id));
  }),
);

router.delete(
  "/items/:id",
  requireAuth,
  wrap(async (req, res) => {
    const item = await prisma.cartItem.findFirst({
      where: { id: req.params.id, cart: { userId: req.user!.id } },
    });
    if (!item) throw new HttpError(404, "Item not in your bag");
    await prisma.cartItem.delete({ where: { id: item.id } });
    res.json(await loadCart(req.user!.id));
  }),
);

export default router;
