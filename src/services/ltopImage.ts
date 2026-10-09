import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RANKS_DIR = join(ROOT, "assets", "ranks");

const WIDTH = 560;
const ROW_H = 56;
const PAD = 20;
const ICON = 44;

export type LtopRow = {
  rank: number;
  name: string;
  count: number;
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build a PNG leaderboard image with rank star icons 1–10. */
export async function renderLtopImage(
  rows: LtopRow[],
  date: string,
): Promise<Buffer> {
  const height = PAD * 2 + 52 + rows.length * ROW_H + 28;
  const composites: { input: Buffer; left: number; top: number }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rank = rows[i]!.rank;
    const iconPath = join(RANKS_DIR, `${rank}.png`);
    const icon = await sharp(readFileSync(iconPath))
      .resize(ICON, ICON, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    composites.push({
      input: icon,
      left: PAD,
      top: PAD + 52 + i * ROW_H + Math.floor((ROW_H - ICON) / 2),
    });
  }

  const textRows = rows
    .map((row, i) => {
      const y = PAD + 52 + i * ROW_H + ROW_H / 2 + 6;
      const name = escapeXml(
        row.name.length > 28 ? `${row.name.slice(0, 27)}…` : row.name,
      );
      const countLabel = `${row.count} msg${row.count === 1 ? "" : "s"}`;
      return `
        <text x="${PAD + ICON + 14}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600" fill="#E8EEF5">${name}</text>
        <text x="${WIDTH - PAD}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#ADD8E6" text-anchor="end">${escapeXml(countLabel)}</text>
      `;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a2332"/>
      <stop offset="100%" stop-color="#121820"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="16" fill="url(#bg)"/>
  <text x="${PAD}" y="${PAD + 28}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#ADD8E6">Daily Message Leaderboard</text>
  <text x="${PAD}" y="${PAD + 46}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#8A9BB0">Resets midnight CT · ${escapeXml(date)}</text>
  ${textRows}
</svg>`;

  return sharp(Buffer.from(svg)).composite(composites).png().toBuffer();
}
