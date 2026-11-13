import { Router } from "express";
import { z } from "zod";
import { DELIVERY_FEE, OrderStatus } from "../lib/constants";
import { HttpError, wrap } from "../lib/http";
import { prisma } from "../lib/prisma";
import { isPurchasable } from "../lib/serialize";
import { requireAuth } from "../middleware/auth";

const router = Router();

const checkoutSchema = z.object({
  name: z.string().trim().min(2, "Enter the name for delivery"),
  phone: z.string().trim().min(7, "Enter a phone number the rider can call").max(20),
  city: z.string().trim().min(2, "Enter a city"),
  address: z.string().trim().min(8, "Enter a full address"),
});

function serializeOrder(order: {
  id: string;
  code: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  customerName: string;
  phone: string;
  city: string;
  address: string;
  createdAt: Date;
  store: { name: string; slug: string };
  items: { id: string; name: string; price: number; quantity: number }[];
}) {
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
  };
}

const orderInclude = {
  store: { select: { name: true, slug: true } },
  items: { select: { id: true, name: true, price: true, quantity: true } },
} as const;

router.post(
  "/checkout",
  requireAuth,
  wrap(async (req, res) => {
    const data = checkoutSchema.parse(req.body);
    const digits = data.phone.replace(/\D/g, "");
    if (digits.length < 10) {
      throw new HttpError(400, "Enter a phone number the rider can call");
    }

    const orders = await prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId: req.user!.id },
        include: {
          items: { include: { product: { include: { store: true } } } },
        },
      });
      if (!cart || cart.items.length === 0) {
        throw new HttpError(400, "Your bag is empty");
      }

      for (const item of cart.items) {
        if (!isPurchasable(item.product, item.quantity)) {
          throw new HttpError(400, `${item.product.name} is no longer available in that quantity`);
        }
      }

      const groups = new Map<string, typeof cart.items>();
      for (const item of cart.items) {
        const list = groups.get(item.product.storeId) ?? [];
        list.push(item);
        groups.set(item.product.storeId, list);
      }

      const created = [];
      for (const [storeId, items] of groups) {
        for (const item of items) {
          const updated = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (updated.count !== 1) {
            throw new HttpError(409, `Not enough stock for ${item.product.name}`);
          }
        }

        const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        const code = await nextCode(tx);
        const order = await tx.order.create({
          data: {
            code,
            userId: req.user!.id,
            storeId,
            status: OrderStatus.PENDING,
            paymentMethod: "COD",
            paymentStatus: "PENDING",
            subtotal,
            deliveryFee: DELIVERY_FEE,
            total: subtotal + DELIVERY_FEE,
            customerName: data.name,
            phone: data.phone.trim(),
            city: data.city,
            address: data.address,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                name: item.product.name,
                price: item.product.price,
                quantity: item.quantity,
              })),
            },
          },
          include: orderInclude,
        });
        created.push(order);
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return created;
    });

    res.status(201).json({ orders: orders.map(serializeOrder) });
  }),
);

async function nextCode(tx: { order: { findUnique: (args: { where: { code: string } }) => Promise<unknown> } }) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = `BZ${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = await tx.order.findUnique({ where: { code } });
    if (!existing) return code;
  }
  return `BZ${Date.now().toString().slice(-8)}`;
}

router.get(
  "/orders",
  requireAuth,
  wrap(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.user!.id },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders: orders.map(serializeOrder) });
  }),
);

router.get(
  "/orders/:id",
  requireAuth,
  wrap(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: orderInclude,
    });
    if (!order) throw new HttpError(404, "Order not found");
    res.json({ order: serializeOrder(order) });
  }),
);

export default router;
