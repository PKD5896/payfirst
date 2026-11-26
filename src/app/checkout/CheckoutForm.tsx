"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ProductTile } from "@/components/ProductTile";
import { MAX_QTY, type Product } from "@/lib/catalog";
import { formatINR } from "@/lib/format";
import { DELIVERY_FEE, nudgeFor, quote, type PaymentMethod, type Variant } from "@/lib/nudges";

type Status = "idle" | "submitting" | "error";

export function CheckoutForm({ product, variant, debug }: { product: Product; variant: Variant; debug: boolean }) {
  const router = useRouter();
  const upiDialog = useRef<HTMLDialogElement>(null);
  const [qty, setQty] = useState(1);
  // No method is preselected, in every variant: a default would itself be a nudge.
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const subtotal = product.price * qty;
  const nudge = nudgeFor(variant);
  const upiQuote = quote(subtotal, variant, "upi");
  const codQuote = quote(subtotal, variant, "cod");
  const selected = method === "upi" ? upiQuote : method === "cod" ? codQuote : null;

  async function placeOrder(paymentMethod: PaymentMethod) {
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, qty, paymentMethod }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      router.push(`/order/${body.id}`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
      upiDialog.current?.close();
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (method === "upi") upiDialog.current?.showModal();
    else if (method === "cod") placeOrder("cod");
  }

  const busy = status === "submitting";

  return (
    <>
      <form onSubmit={onSubmit} className="mt-5 space-y-5">
        {/* Item */}
        <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
          <ProductTile product={product} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{product.name}</p>
            <p className="text-sm text-muted">{formatINR(product.price)} each</p>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Quantity">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1 || busy}
              aria-label="Decrease quantity"
              className="size-8 rounded-lg border border-border text-lg leading-none disabled:opacity-40"
            >
              −
            </button>
            <span className="w-6 text-center font-medium tabular-nums" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
              disabled={qty >= MAX_QTY || busy}
              aria-label="Increase quantity"
              className="size-8 rounded-lg border border-border text-lg leading-none disabled:opacity-40"
            >
              +
            </button>
          </div>
        </section>

        {/* Payment method */}
        <fieldset className="space-y-3" disabled={busy}>
          <legend className="mb-2 font-semibold">How would you like to pay?</legend>

          {nudge.message && (
            <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent" data-testid="nudge-message">
              {nudge.message}
            </p>
          )}

          <PaymentOption
            value="upi"
            checked={method === "upi"}
            onChange={setMethod}
            title="UPI"
            subtitle="Google Pay, PhonePe, Paytm, BHIM"
            total={upiQuote.total}
            badge={nudge.badge}
          />
          <PaymentOption
            value="cod"
            checked={method === "cod"}
            onChange={setMethod}
            title="Cash on Delivery"
            subtitle="Pay when your order arrives"
            total={codQuote.total}
          />
        </fieldset>

        {/* Price breakdown */}
        <section className="rounded-2xl border border-border bg-card p-4 text-sm" aria-label="Price details">
          <Row label={`Subtotal (${qty} item${qty > 1 ? "s" : ""})`} value={formatINR(subtotal)} />
          <Row
            label="Delivery"
            value={
              selected && selected.delivery === 0 ? (
                <span>
                  <s className="mr-1 text-muted">{formatINR(DELIVERY_FEE)}</s>
                  <span className="font-medium text-accent">FREE</span>
                </span>
              ) : (
                formatINR(DELIVERY_FEE)
              )
            }
          />
          {selected && selected.discount > 0 && (
            <Row label="UPI discount" value={<span className="font-medium text-accent">−{formatINR(selected.discount)}</span>} />
          )}
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
            <span>Total</span>
            <span data-testid="order-total">{selected ? formatINR(selected.total) : "Choose a payment method"}</span>
          </div>
        </section>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}. Please try again.
          </p>
        )}

        <button
          type="submit"
          disabled={!method || busy}
          className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-brand-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy
            ? "Placing order…"
            : method === "upi"
              ? `Pay ${formatINR(upiQuote.total)} with UPI`
              : method === "cod"
                ? `Place order · pay ${formatINR(codQuote.total)} on delivery`
                : "Choose a payment method"}
        </button>
      </form>

      <UpiSheet ref={upiDialog} amount={upiQuote.total} busy={busy} onApprove={() => placeOrder("upi")} />

      {debug && (
        <p className="mt-6 text-center text-xs text-muted" data-testid="debug-variant">
          Debug · variant <code className="font-mono">{variant}</code> ·{" "}
          <a className="underline" href={`/reset-shopper?next=${encodeURIComponent(`/checkout?product=${product.id}&debug=1`)}`}>
            new shopper ↻
          </a>
        </p>
      )}
    </>
  );
}

function PaymentOption(props: {
  value: PaymentMethod;
  checked: boolean;
  onChange: (m: PaymentMethod) => void;
  title: string;
  subtitle: string;
  total: number;
  badge?: string | null;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-4 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
        props.checked ? "border-brand ring-1 ring-brand" : "border-border hover:border-muted"
      }`}
    >
      <input
        type="radio"
        name="payment"
        value={props.value}
        checked={props.checked}
        onChange={() => props.onChange(props.value)}
        className="size-4 accent-brand"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {props.title}
          {props.badge && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent" data-testid="upi-badge">
              {props.badge}
            </span>
          )}
        </span>
        <span className="block text-sm text-muted">{props.subtitle}</span>
      </span>
      <span className="font-semibold tabular-nums">{formatINR(props.total)}</span>
    </label>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

const UPI_APPS = ["Google Pay", "PhonePe", "Paytm", "BHIM"];

function UpiSheet({
  ref,
  amount,
  busy,
  onApprove,
}: {
  ref: React.Ref<HTMLDialogElement>;
  amount: number;
  busy: boolean;
  onApprove: () => void;
}) {
  return (
    <dialog
      ref={ref}
      aria-labelledby="upi-title"
      className="mx-auto mt-auto mb-0 w-full max-w-md rounded-t-3xl border border-border bg-card p-6 text-foreground backdrop:bg-black/50 sm:my-auto sm:rounded-3xl"
    >
      <h2 id="upi-title" className="text-lg font-semibold">
        Pay with UPI
      </h2>
      <p className="mt-1 text-sm text-muted">PayFirst Store · payfirst@upi</p>
      <p className="mt-4 text-3xl font-bold tabular-nums">{formatINR(amount)}</p>

      <p className="mt-5 text-sm font-medium">Choose your UPI app</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {UPI_APPS.map((app) => (
          <button
            key={app}
            type="button"
            disabled={busy}
            onClick={onApprove}
            className="rounded-xl border border-border px-3 py-3 text-sm font-medium transition hover:border-brand disabled:opacity-50"
          >
            {busy ? "Processing…" : app}
          </button>
        ))}
      </div>

      <form method="dialog" className="mt-4">
        <button disabled={busy} className="w-full rounded-xl px-3 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50">
          Cancel
        </button>
      </form>
      <p className="mt-2 text-center text-xs text-muted">Demo: no real payment is made.</p>
    </dialog>
  );
}
