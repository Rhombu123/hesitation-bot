/**
 * Generate 256×256 transparent quiz category icon thumbnails.
 * Run: npx tsx scripts/generate-quiz-thumbs.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../assets/quiz",
);

const TWEMOJI =
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72";

const CANVAS = 256;
const ICON_SIZE = 188;

/** Twemoji codepoint hex, or "svg" for inline icon. */
const CATEGORIES = [
  { id: "celebrities", icon: "2b50", label: "star" },
  { id: "history", icon: "1f4dc", label: "scroll" },
  { id: "science", icon: "1f52c", label: "microscope" },
  { id: "math", icon: "svg", label: "pi" },
  { id: "geography", icon: "1f30d", label: "globe" },
] as const;

function mathPiSvg(): string {
  return `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="148" font-weight="700"
    fill="#5c8dff">π</text>
</svg>`;
}

async function fetchTwemoji(code: string): Promise<Buffer> {
  const res = await fetch(`${TWEMOJI}/${code}.png`);
  if (!res.ok) {
    throw new Error(`Failed to fetch twemoji ${code}: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function iconBuffer(icon: string): Promise<Buffer> {
  if (icon === "svg") {
    return sharp(Buffer.from(mathPiSvg())).png().toBuffer();
  }
  const raw = await fetchTwemoji(icon);
  return sharp(raw)
    .resize(ICON_SIZE, ICON_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function writeThumb(id: string, icon: string): Promise<void> {
  const resized = await iconBuffer(icon);
  const meta = await sharp(resized).metadata();
  const w = meta.width ?? ICON_SIZE;
  const h = meta.height ?? ICON_SIZE;
  const left = Math.floor((CANVAS - w) / 2);
  const top = Math.floor((CANVAS - h) / 2);

  const png = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();

  const outPath = path.join(OUT, `${id}.png`);
  writeFileSync(outPath, png);
  console.log(`Wrote ${outPath}`);
}

mkdirSync(OUT, { recursive: true });

for (const cat of CATEGORIES) {
  await writeThumb(cat.id, cat.icon);
}
