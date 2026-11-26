import Link from "next/link";

export default function OrderNotFound() {
  return (
    <div className="mx-auto max-w-lg text-center">
      <h1 className="text-2xl font-bold tracking-tight">Order not found</h1>
      <p className="mt-2 text-muted">This demo keeps orders in memory, so they disappear when the server restarts.</p>
      <Link href="/" className="mt-6 inline-block font-semibold text-brand underline">
        Back to the store
      </Link>
    </div>
  );
}
