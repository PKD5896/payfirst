import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { findProduct } from "@/lib/catalog";
import { getCheckoutVariant } from "@/lib/flagsmith";
import { VISITOR_COOKIE, isValidVisitorId } from "@/lib/visitor";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Checkout · PayFirst" };

// The static shell renders instantly; the shopper-specific part streams in behind Suspense
// (Cache Components requires runtime data such as cookies to sit inside a boundary).
export default function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  return (
    <div className="mx-auto max-w-lg">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← Continue shopping
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Checkout</h1>
      <Suspense fallback={<CheckoutSkeleton />}>
        <Checkout searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Checkout({ searchParams }: Pick<PageProps<"/checkout">, "searchParams">) {
  // Only ever run for a real checkout visit — never during prerendering or prefetching —
  // because evaluating the flag records an experiment exposure.
  await connection();
  const params = await searchParams;
  const product = findProduct(typeof params.product === "string" ? params.product : undefined);
  if (!product) redirect("/");

  // This is where the shopper sees the variant, so this is where the exposure is recorded.
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value;
  const variant = isValidVisitorId(visitorId) ? await getCheckoutVariant(visitorId) : "control";
  const debug = process.env.NODE_ENV === "development" || params.debug === "1";

  return <CheckoutForm product={product} variant={variant} debug={debug} />;
}

function CheckoutSkeleton() {
  return (
    <div className="mt-5 space-y-5" aria-busy="true" aria-label="Loading checkout">
      {[80, 72, 72, 120].map((h, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-border bg-card" style={{ height: h }} />
      ))}
    </div>
  );
}
