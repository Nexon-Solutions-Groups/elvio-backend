import { DELIVERY_FEE, NEXT_ORDER_STATUS } from "./constants";

type Image = { url: string; position: number };
type StoreRef = { id: string; name: string; slug: string; status?: string };
type CategoryRef = { name: string; slug: string };

export type ProductRecord = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  status?: string;
  images: Image[];
  store: StoreRef & { city?: string; description?: string };
  category: CategoryRef & { id?: string };
};

export function serializeProductCard(product: ProductRecord) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    stock: product.stock,
    image: product.images[0]?.url ?? null,
    store: {
      id: product.store.id,
      name: product.store.name,
      slug: product.store.slug,
    },
    category: {
      name: product.category.name,
      slug: product.category.slug,
    },
  };
}

export function serializeProductDetail(product: ProductRecord) {
  return {
    ...serializeProductCard(product),
    description: product.description ?? "",
    images: product.images.map((image) => image.url),
    store: {
      id: product.store.id,
      name: product.store.name,
      slug: product.store.slug,
      city: product.store.city ?? "",
      description: product.store.description ?? "",
    },
  };
}

export function isPurchasable(product: {
  status: string;
  stock: number;
  store: { status: string };
}, quantity = 1) {
  return product.status === "ACTIVE" && product.store.status === "ACTIVE" && product.stock >= quantity;
}

export function quoteItems(
  items: { quantity: number; product: { price: number; store: { id: string } } }[],
) {
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const stores = new Set(items.map((item) => item.product.store.id));
  const deliveryFee = stores.size * DELIVERY_FEE;
  return { subtotal, deliveryFee, total: subtotal + deliveryFee };
}

export function orderActions(status: string) {
  return NEXT_ORDER_STATUS[status] ?? [];
}
