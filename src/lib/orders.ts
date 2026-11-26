// Order validation and an in-memory order store (demo only: no database, resets on restart).
import { findProduct, type Product } from "./catalog";
import { quote, type PaymentMethod, type Quote, type Variant } from "./nudges";

export const MAX_QTY = 5;

export type OrderRequest = { productId: string; qty: number; paymentMethod: PaymentMethod };

export type Order = {
  id: string;
  product: Pick<Product, "id" | "name" | "price" | "emoji">;
  qty: number;
  paymentMethod: PaymentMethod;
  variant: Variant;
  quote: Quote;
  createdAt: string;
};

export type ParseResult = { ok: true; value: OrderRequest } | { ok: false; error: string };

export function parseOrderRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Body must be a JSON object" };
  const { productId, qty, paymentMethod } = body as Record<string, unknown>;
  if (typeof productId !== "string" || !findProduct(productId)) return { ok: false, error: "Unknown product" };
  if (!Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > MAX_QTY) {
    return { ok: false, error: `qty must be a whole number from 1 to ${MAX_QTY}` };
  }
  if (paymentMethod !== "upi" && paymentMethod !== "cod") return { ok: false, error: "paymentMethod must be upi or cod" };
  return { ok: true, value: { productId, qty: qty as number, paymentMethod } };
}

/** Prices are always computed on the server from the catalog, never taken from the client. */
export function buildOrder(req: OrderRequest, variant: Variant, id: string, now = new Date()): Order {
  const product = findProduct(req.productId);
  if (!product) throw new Error(`Unknown product ${req.productId}`);
  return {
    id,
    product: { id: product.id, name: product.name, price: product.price, emoji: product.emoji },
    qty: req.qty,
    paymentMethod: req.paymentMethod,
    variant,
    quote: quote(product.price * req.qty, variant, req.paymentMethod),
    createdAt: now.toISOString(),
  };
}

// Survives Next.js dev hot reloads by living on globalThis.
const store = ((globalThis as { __payfirstOrders?: Map<string, Order> }).__payfirstOrders ??= new Map());

export function saveOrder(order: Order): void {
  store.set(order.id, order);
}

export function getOrder(id: string): Order | undefined {
  return store.get(id);
}
