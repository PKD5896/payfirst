import Link from "next/link";
import { ProductTile } from "@/components/ProductTile";
import { PRODUCTS } from "@/lib/catalog";
import { formatINR } from "@/lib/format";

export default function StorePage() {
  return (
    <>
      <section className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Woven by hand, delivered to your door.</h1>
        <p className="mt-2 text-muted">Handloom kurtas, silk dupattas and block-print sarees from artisan clusters across India.</p>
      </section>

      <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {PRODUCTS.map((p) => (
          <li key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <ProductTile product={p} size="lg" />
            <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
              <h2 className="text-sm font-semibold leading-snug sm:text-base">{p.name}</h2>
              <p className="hidden text-sm text-muted sm:block">{p.description}</p>
              <p className="mt-auto pt-2 text-base font-semibold">{formatINR(p.price)}</p>
              <Link
                href={`/checkout?product=${p.id}`}
                prefetch={false} // opening checkout records an experiment exposure; never do it speculatively
                className="mt-2 rounded-xl bg-brand px-3 py-2 text-center text-sm font-semibold text-brand-foreground transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Buy now
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
