export const DELIVERY_FEE = 200;

export const Role = {
  CUSTOMER: "CUSTOMER",
  SELLER: "SELLER",
  ADMIN: "ADMIN",
} as const;

export const StoreStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;

export const ProductStatus = {
  ACTIVE: "ACTIVE",
  HIDDEN: "HIDDEN",
} as const;

export const OrderStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
} as const;

export const NEXT_ORDER_STATUS: Record<string, string[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};
