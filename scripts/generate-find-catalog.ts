/**
 * Generates ~2,000 find-catalog items into src/data/find-catalog.json
 * Run: npm run generate:find-catalog
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_COUNT = 2_000;

const CATEGORIES = {
  electronics: { minCents: 1_500, maxCents: 80_000, weight: 220 },
  fashion: { minCents: 800, maxCents: 35_000, weight: 220 },
  home: { minCents: 500, maxCents: 45_000, weight: 200 },
  food: { minCents: 50, maxCents: 8_000, weight: 180 },
  sports: { minCents: 600, maxCents: 25_000, weight: 180 },
  beauty: { minCents: 400, maxCents: 18_000, weight: 180 },
  toys: { minCents: 300, maxCents: 15_000, weight: 160 },
  office: { minCents: 200, maxCents: 12_000, weight: 160 },
  automotive: { minCents: 800, maxCents: 60_000, weight: 140 },
  garden: { minCents: 400, maxCents: 20_000, weight: 160 },
} as const;

type Category = keyof typeof CATEGORIES;

const ADJECTIVES = [
  "Pro",
  "Ultra",
  "Classic",
  "Premium",
  "Compact",
  "Deluxe",
  "Essential",
  "Portable",
  "Wireless",
  "Smart",
  "Vintage",
  "Modern",
  "Eco",
  "Mini",
  "Max",
  "Daily",
  "Studio",
  "Active",
  "Fresh",
  "Bold",
] as const;

const BRANDS = [
  "Joyhoosh",
  "Northline",
  "Velora",
  "Kinetix",
  "Bluecrest",
  "Sunforge",
  "UrbanPeak",
  "NovaCraft",
  "SilverOak",
  "BrightPath",
  "CoreWave",
  "Zenith",
  "Pulse",
  "Evergreen",
  "MetroFlex",
  "AeroLite",
  "TrueForm",
  "PeakLine",
  "ClearView",
  "StoneRiver",
] as const;

const PRODUCTS: Record<Category, readonly string[]> = {
  electronics: [
    "Bluetooth headset",
    "wireless earbuds",
    "USB-C hub",
    "portable charger",
    "smart watch band",
    "webcam",
    "mechanical keyboard",
    "gaming mouse",
    "tablet stand",
    "HDMI cable pack",
    "LED desk lamp",
    "phone case",
    "laptop sleeve",
    "mini speaker",
    "router extender",
  ],
  fashion: [
    "hoodie",
    "sneakers",
    "baseball cap",
    "denim jacket",
    "canvas tote bag",
    "leather belt",
    "wool scarf",
    "running shorts",
    "crew socks pack",
    "sunglasses",
    "crossbody bag",
    "beanie",
    "polo shirt",
    "windbreaker",
    "slip-on shoes",
  ],
  home: [
    "throw pillow",
    "ceramic mug set",
    "bed sheet set",
    "storage basket",
    "wall clock",
    "scented candle",
    "kitchen knife set",
    "cutting board",
    "mixing bowl set",
    "vacuum filter pack",
    "shower curtain",
    "bath mat",
    "picture frame",
    "coaster set",
    "laundry hamper",
  ],
  food: [
    "cold brew coffee",
    "protein bar box",
    "spice sampler",
    "olive oil bottle",
    "hot sauce trio",
    "granola mix",
    "instant ramen pack",
    "dark chocolate box",
    "herbal tea tin",
    "maple syrup jar",
    "trail mix bag",
    "sparkling water case",
    "pasta sauce jar",
    "peanut butter jar",
    "energy drink pack",
  ],
  sports: [
    "yoga mat",
    "resistance bands",
    "water bottle",
    "gym towel",
    "tennis balls",
    "pickleball paddle",
    "bike light",
    "jump rope",
    "foam roller",
    "golf glove",
    "swim goggles",
    "hiking socks",
    "cooling towel",
    "ankle weights",
    "sports duffel bag",
  ],
  beauty: [
    "face moisturizer",
    "lip balm set",
    "hair serum",
    "body wash",
    "nail polish kit",
    "makeup sponge pack",
    "cleansing wipes",
    "hand cream",
    "perfume roller",
    "sunscreen lotion",
    "shampoo bottle",
    "conditioner bottle",
    "face mask pack",
    "beard oil",
    "makeup brush set",
  ],
  toys: [
    "building block set",
    "plush toy",
    "puzzle box",
    "action figure",
    "board game",
    "RC car",
    "coloring book set",
    "sticker pack",
    "card game",
    "mini drone",
    "play dough kit",
    "slime kit",
    "fidget cube",
    "model kit",
    "dollhouse accessory",
  ],
  office: [
    "notebook pack",
    "gel pen set",
    "desk organizer",
    "sticky notes bundle",
    "file folders",
    "label maker tape",
    "mouse pad",
    "document tray",
    "whiteboard markers",
    "paper clips box",
    "calendar planner",
    "binder clips",
    "highlighter set",
    "index cards",
    "letter opener",
  ],
  automotive: [
    "car phone mount",
    "tire pressure gauge",
    "microfiber cloth pack",
    "air freshener",
    "jump starter pack",
    "seat cover set",
    "floor mat set",
    "windshield sun shade",
    "cup holder insert",
    "trunk organizer",
    "wheel cleaner",
    "dash cam mount",
    "license plate frame",
    "car vacuum kit",
    "ice scraper",
  ],
  garden: [
    "garden gloves",
    "watering can",
    "plant pot set",
    "seed starter kit",
    "pruning shears",
    "garden hose nozzle",
    "bird feeder",
    "potting soil bag",
    "garden trowel",
    "plant markers",
    "outdoor string lights",
    "compost bin",
    "raised bed liner",
    "garden kneeler",
    "herb planter",
  ],
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomCents(min: number, max: number): number {
  const raw = min + Math.floor(Math.random() * (max - min + 1));
  return Math.max(1, raw);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildCategoryPool(): Category[] {
  const pool: Category[] = [];
  for (const [cat, meta] of Object.entries(CATEGORIES) as [
    Category,
    (typeof CATEGORIES)[Category],
  ][]) {
    for (let i = 0; i < meta.weight; i++) pool.push(cat);
  }
  return pool;
}

type CatalogItem = {
  id: string;
  name: string;
  category: Category;
  basePriceCents: number;
  imageUrl: string;
};

function main(): void {
  const pool = buildCategoryPool();
  const seen = new Set<string>();
  const items: CatalogItem[] = [];

  while (items.length < TARGET_COUNT) {
    const category = pick(pool);
    const meta = CATEGORIES[category];
    const adj = pick(ADJECTIVES);
    const brand = pick(BRANDS);
    const product = pick(PRODUCTS[category]);
    const model = `${Math.floor(Math.random() * 9000) + 1000}`;
    const name = `${brand} ${adj.toLowerCase()} ${product} model ${model}`;

    const baseId = `${category}-${slugify(`${brand}-${product}`)}-${model}`;
    if (seen.has(baseId)) continue;
    seen.add(baseId);

    items.push({
      id: baseId,
      name,
      category,
      basePriceCents: randomCents(meta.minCents, meta.maxCents),
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(baseId)}/256/256`,
    });
  }

  const outPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../src/data/find-catalog.json",
  );
  writeFileSync(outPath, JSON.stringify(items, null, 0));
  console.log(`Wrote ${items.length} items to ${outPath}`);
}

main();
