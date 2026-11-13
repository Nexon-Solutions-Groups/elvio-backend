import { Router } from "express";
import { ProductStatus, StoreStatus } from "../lib/constants";
import { prisma } from "../lib/prisma";
import { serializeProductCard, serializeProductDetail } from "../lib/serialize";
import { wrap, HttpError } from "../lib/http";

const router = Router();

const publicProduct = {
  status: ProductStatus.ACTIVE,
  store: { status: StoreStatus.ACTIVE },
};

router.get(
  "/categories",
  wrap(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            products: { where: publicProduct },
          },
        },
      },
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

router.get(
  "/products",
  wrap(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort : "new";
    const orderBy =
      sort === "price-asc"
        ? { price: "asc" as const }
        : sort === "price-desc"
          ? { price: "desc" as const }
          : { createdAt: "desc" as const };

    const products = await prisma.product.findMany({
      where: {
        ...publicProduct,
        ...(category ? { category: { slug: category } } : {}),
        ...(q
          ? {
              OR: [{ name: { contains: q } }, { description: { contains: q } }],
            }
          : {}),
      },
      include: {
        images: { orderBy: { position: "asc" } },
        store: true,
        category: true,
      },
      orderBy,
      take: 60,
    });

    res.json({ products: products.map(serializeProductCard) });
  }),
);

router.get(
  "/products/:slug",
  wrap(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, ...publicProduct },
      include: {
        images: { orderBy: { position: "asc" } },
        store: true,
        category: true,
      },
    });
    if (!product) throw new HttpError(404, "Product not found");

    const more = await prisma.product.findMany({
      where: {
        ...publicProduct,
        storeId: product.storeId,
        id: { not: product.id },
      },
      include: {
        images: { orderBy: { position: "asc" } },
        store: true,
        category: true,
      },
      take: 4,
    });

    res.json({
      product: serializeProductDetail(product),
      moreFromStore: more.map(serializeProductCard),
    });
  }),
);

router.get(
  "/stores",
  wrap(async (_req, res) => {
    const stores = await prisma.store.findMany({
      where: { status: StoreStatus.ACTIVE },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: { where: { status: ProductStatus.ACTIVE } } } },
      },
    });
    res.json({
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        slug: store.slug,
        description: store.description,
        city: store.city,
        bannerUrl: store.bannerUrl,
        productCount: store._count.products,
      })),
    });
  }),
);

router.get(
  "/stores/:slug",
  wrap(async (req, res) => {
    const store = await prisma.store.findFirst({
      where: { slug: req.params.slug, status: StoreStatus.ACTIVE },
    });
    if (!store) throw new HttpError(404, "Store not found");
    const products = await prisma.product.findMany({
      where: { storeId: store.id, status: ProductStatus.ACTIVE },
      include: {
        images: { orderBy: { position: "asc" } },
        store: true,
        category: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        description: store.description,
        city: store.city,
        bannerUrl: store.bannerUrl,
        productCount: products.length,
      },
      products: products.map(serializeProductCard),
    });
  }),
);

export default router;
