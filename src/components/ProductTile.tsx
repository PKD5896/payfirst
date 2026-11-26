import type { Product } from "@/lib/catalog";

const SIZES = {
  lg: "aspect-square w-full text-4xl sm:text-5xl",
  sm: "size-16 shrink-0 rounded-xl text-base",
} as const;

/** Decorative product tile: the garment's name in Devanagari on a woven-colour gradient. */
export function ProductTile({ product, size }: { product: Pick<Product, "motif" | "tint">; size: keyof typeof SIZES }) {
  return (
    <div
      aria-hidden
      lang="hi"
      className={`flex items-center justify-center bg-gradient-to-br font-devanagari font-semibold ${SIZES[size]} ${product.tint}`}
    >
      {product.motif}
    </div>
  );
}
