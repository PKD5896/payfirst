export type Product = {
  id: string;
  name: string;
  description: string;
  price: number; // rupees
  emoji: string;
  tint: string; // Tailwind classes for the product tile
};

export const PRODUCTS: readonly Product[] = [
  {
    id: "cotton-kurta",
    name: "Handloom Cotton Kurta",
    description: "Breathable indigo handloom, straight cut.",
    price: 1199,
    emoji: "👕",
    tint: "from-indigo-100 to-sky-100 dark:from-indigo-950 dark:to-sky-950",
  },
  {
    id: "banarasi-dupatta",
    name: "Banarasi Silk Dupatta",
    description: "Zari border, woven in Varanasi.",
    price: 899,
    emoji: "🧣",
    tint: "from-rose-100 to-amber-100 dark:from-rose-950 dark:to-amber-950",
  },
  {
    id: "chanderi-set",
    name: "Chanderi Kurta Set",
    description: "Kurta, pants and dupatta in soft Chanderi.",
    price: 1899,
    emoji: "👗",
    tint: "from-emerald-100 to-teal-100 dark:from-emerald-950 dark:to-teal-950",
  },
  {
    id: "cotton-saree",
    name: "Block-print Cotton Saree",
    description: "Hand block-printed in Bagru, with blouse piece.",
    price: 1499,
    emoji: "🥻",
    tint: "from-orange-100 to-yellow-100 dark:from-orange-950 dark:to-yellow-950",
  },
];

export function findProduct(id: string | null | undefined): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
