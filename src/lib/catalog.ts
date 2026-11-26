export const MAX_QTY = 5; // per order

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number; // rupees
  motif: string; // Devanagari label shown on the product tile
  tint: string; // Tailwind classes for the product tile (background + text)
};

export const PRODUCTS: readonly Product[] = [
  {
    id: "cotton-kurta",
    name: "Handloom Cotton Kurta",
    description: "Breathable indigo handloom, straight cut.",
    price: 1199,
    motif: "कुर्ता",
    tint: "from-indigo-100 to-sky-100 text-indigo-900 dark:from-indigo-950 dark:to-sky-950 dark:text-indigo-200",
  },
  {
    id: "banarasi-dupatta",
    name: "Banarasi Silk Dupatta",
    description: "Zari border, woven in Varanasi.",
    price: 899,
    motif: "दुपट्टा",
    tint: "from-rose-100 to-amber-100 text-rose-900 dark:from-rose-950 dark:to-amber-950 dark:text-rose-200",
  },
  {
    id: "chanderi-set",
    name: "Chanderi Kurta Set",
    description: "Kurta, pants and dupatta in soft Chanderi.",
    price: 1899,
    motif: "चंदेरी",
    tint: "from-emerald-100 to-teal-100 text-emerald-900 dark:from-emerald-950 dark:to-teal-950 dark:text-emerald-200",
  },
  {
    id: "cotton-saree",
    name: "Block-print Cotton Saree",
    description: "Hand block-printed in Bagru, with blouse piece.",
    price: 1499,
    motif: "साड़ी",
    tint: "from-orange-100 to-yellow-100 text-orange-900 dark:from-orange-950 dark:to-yellow-950 dark:text-orange-200",
  },
];

export function findProduct(id: string | null | undefined): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
