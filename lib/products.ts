export interface Product {
  id: string;
  name: string;
  barcode: string;
  priceCents: number;
  imagePath: string;
}

export const PRODUCT_CATALOGUE_LABEL = "Demo catalogue";

// WHY: Synthetic barcodes and local image paths keep the till demo independent of real stock, pricing, and brands.
export const products: Product[] = [
  {
    id: "maize-meal-2-5kg",
    name: "Maize Meal 2.5kg",
    barcode: "2000000000015",
    priceCents: 3_490,
    imagePath: "/images/products/maize-meal-2-5kg.png",
  },
  {
    id: "cooking-oil-1l",
    name: "Cooking Oil 1L",
    barcode: "2000000000022",
    priceCents: 4_290,
    imagePath: "/images/products/cooking-oil-1l.png",
  },
  {
    id: "sugar-2kg",
    name: "Sugar 2kg",
    barcode: "2000000000039",
    priceCents: 2_790,
    imagePath: "/images/products/sugar-2kg.png",
  },
  {
    id: "white-bread",
    name: "White Bread",
    barcode: "2000000000046",
    priceCents: 1_800,
    imagePath: "/images/products/white-bread.png",
  },
  {
    id: "long-life-milk-1l",
    name: "Long-life Milk 1L",
    barcode: "2000000000053",
    priceCents: 1_750,
    imagePath: "/images/products/long-life-milk-1l.png",
  },
  {
    id: "rice-2kg",
    name: "Rice 2kg",
    barcode: "2000000000060",
    priceCents: 3_990,
    imagePath: "/images/products/rice-2kg.png",
  },
  {
    id: "black-tea-100-bags",
    name: "Black Tea 100 Bags",
    barcode: "2000000000077",
    priceCents: 3_290,
    imagePath: "/images/products/black-tea-100-bags.png",
  },
  {
    id: "table-salt-1kg",
    name: "Table Salt 1kg",
    barcode: "2000000000084",
    priceCents: 1_290,
    imagePath: "/images/products/table-salt-1kg.png",
  },
  {
    id: "eggs-6-pack",
    name: "Eggs 6 Pack",
    barcode: "2000000000091",
    priceCents: 2_490,
    imagePath: "/images/products/eggs-6-pack.png",
  },
  {
    id: "baked-beans-410g",
    name: "Baked Beans 410g",
    barcode: "2000000000107",
    priceCents: 1_690,
    imagePath: "/images/products/baked-beans-410g.png",
  },
  {
    id: "washing-powder-1kg",
    name: "Washing Powder 1kg",
    barcode: "2000000000114",
    priceCents: 3_590,
    imagePath: "/images/products/washing-powder-1kg.png",
  },
  {
    id: "instant-noodles",
    name: "Instant Noodles",
    barcode: "2000000000121",
    priceCents: 850,
    imagePath: "/images/products/instant-noodles.png",
  },
];

export function getProductByBarcode(barcode: string): Product | undefined {
  return products.find((product) => product.barcode === barcode);
}
