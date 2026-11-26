import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductTile } from "@/components/ProductTile";
import { findProduct } from "@/lib/catalog";
import { formatINR } from "@/lib/format";
import { DELIVERY_FEE } from "@/lib/nudges";
import { getOrder } from "@/lib/orders";

export const metadata: Metadata = { title: "Order placed · PayFirst" };

// Static shell + streamed order details (Cache Components: params are runtime data).
export default function OrderPage({ params }: PageProps<"/order/[id]">) {
  return (
    <div className="mx-auto max-w-lg text-center">
      <Suspense fallback={<p className="text-muted">Loading your order…</p>}>
        <OrderDetails params={params} />
      </Suspense>
    </div>
  );
}

async function OrderDetails({ params }: Pick<PageProps<"/order/[id]">, "params">) {
  const order = getOrder((await params).id);
  if (!order) notFound();

  const { quote } = order;
  const saved = quote.discount + (DELIVERY_FEE - quote.delivery);
  const upi = order.paymentMethod === "upi";

  return (
    <>
      <div aria-hidden className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent-soft text-3xl text-accent">
        ✓
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Order placed!</h1>
      <p className="mt-1 text-sm text-muted">
        Order <span className="font-mono">#{order.id.slice(0, 8).toUpperCase()}</span>
      </p>

      <section className="mt-6 rounded-2xl border border-border bg-card p-4 text-left text-sm">
        <div className="flex items-center gap-3">
          {findProduct(order.product.id) && <ProductTile product={findProduct(order.product.id)!} size="sm" />}
          <div className="flex-1">
            <p className="font-semibold">{order.product.name}</p>
            <p className="text-muted">Qty {order.qty}</p>
          </div>
          <p className="font-semibold tabular-nums">{formatINR(quote.total)}</p>
        </div>
        <p className="mt-4 border-t border-border pt-3" data-testid="payment-summary">
          {upi ? (
            <>
              Paid <strong>{formatINR(quote.total)}</strong> by UPI.
            </>
          ) : (
            <>
              Pay <strong>{formatINR(quote.total)}</strong> in cash when your order arrives.
            </>
          )}
        </p>
        {saved > 0 && (
          <p className="mt-2 font-medium text-accent" data-testid="savings">
            You saved {formatINR(saved)} by paying with UPI.
          </p>
        )}
      </section>

      <Link
        href="/"
        className="mt-6 inline-block rounded-xl bg-brand px-5 py-2.5 font-semibold text-brand-foreground transition hover:opacity-90"
      >
        Continue shopping
      </Link>
    </>
  );
}
