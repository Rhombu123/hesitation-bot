import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WIDTH = 800;
const HEIGHT = 360;
const HALF = WIDTH / 2;

const FONT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../assets/fonts/VoteSans-Bold.ttf",
);

/** Absolute path for SVG @font-face (librsvg). */
const FONT_FILE_URL = `file://${FONT_PATH}`;

export type VoteCardSide = {
  name: string;
  votes: number;
  percent: number;
  avatarPng: Buffer;
};

export type VoteCardOptions = {
  /** Dim the losing side + crown the winner on the final card. */
  winner?: "left" | "right";
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Keep glyphs DejaVu can draw; drop emoji / exotic symbols that become tofu. */
function sanitizeName(name: string, max = 18): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}_-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const base = cleaned || "User";
  return base.length > max ? `${base.slice(0, max - 1)}…` : base;
}

async function sideAvatar(png: Buffer): Promise<Buffer> {
  return sharp(png)
    .resize(HALF, HEIGHT, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

/** Socialize-style VS vote card (left blue / right pink). */
export async function renderVoteCard(
  left: VoteCardSide,
  right: VoteCardSide,
  opts: VoteCardOptions = {},
): Promise<Buffer> {
  // Ensure font is readable at render time (fails early if missing in deploy).
  readFileSync(FONT_PATH);

  const [leftBg, rightBg] = await Promise.all([
    sideAvatar(left.avatarPng),
    sideAvatar(right.avatarPng),
  ]);

  const leftBar =
    left.percent <= 0
      ? 0
      : Math.max(8, Math.round((HALF - 48) * (left.percent / 100)));
  const rightBar =
    right.percent <= 0
      ? 0
      : Math.max(8, Math.round((HALF - 48) * (right.percent / 100)));

  const leftName = escapeXml(sanitizeName(left.name));
  const rightName = escapeXml(sanitizeName(right.name));
  const leftVotes = `${left.votes} vote${left.votes === 1 ? "" : "s"}`;
  const rightVotes = `${right.votes} vote${right.votes === 1 ? "" : "s"}`;

  const leftDim = opts.winner === "right";
  const rightDim = opts.winner === "left";
  const leftFill = leftDim ? "#94a3b8" : "#ffffff";
  const rightFill = rightDim ? "#94a3b8" : "#ffffff";
  const leftPctFill = leftDim ? "#64748b" : "#60a5fa";
  const rightPctFill = rightDim ? "#64748b" : "#fb7185";

  const barH = 20;
  const barY = HEIGHT - 40;
  const barTrack = "#0f172a";
  const leftBarColor = "#2563eb"; // blue
  const rightBarColor = "#e11d48"; // red/rose — clearly different from left

  const crown =
    opts.winner === "left"
      ? `<text x="${HALF - 56}" y="48" font-family="VoteSans" font-size="36" fill="#fbbf24">👑</text>`
      : opts.winner === "right"
        ? `<text x="${HALF + 20}" y="48" font-family="VoteSans" font-size="36" fill="#fbbf24">👑</text>`
        : "";

  // Crown emoji may also tofu — use a simple gold triangle/star shape instead if needed.
  const crownShape =
    opts.winner === "left"
      ? `<polygon points="${HALF - 70},20 ${HALF - 50},48 ${HALF - 90},48" fill="#fbbf24"/>
         <rect x="${HALF - 90}" y="48" width="40" height="10" rx="2" fill="#fbbf24"/>`
      : opts.winner === "right"
        ? `<polygon points="${HALF + 70},20 ${HALF + 90},48 ${HALF + 50},48" fill="#fbbf24"/>
           <rect x="${HALF + 50}" y="48" width="40" height="10" rx="2" fill="#fbbf24"/>`
        : "";
  void crown;

  const overlay = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style type="text/css">
      @font-face {
        font-family: 'VoteSans';
        src: url('${FONT_FILE_URL}');
        font-weight: bold;
      }
    </style>
    <linearGradient id="leftFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.15"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#0a1628" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="rightFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.15"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#280a18" stop-opacity="0.92"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${HALF}" height="${HEIGHT}" fill="#3b82f6" opacity="0.28"/>
  <rect x="${HALF}" y="0" width="${HALF}" height="${HEIGHT}" fill="#ec4899" opacity="0.28"/>
  <rect x="0" y="0" width="${HALF}" height="${HEIGHT}" fill="url(#leftFade)"/>
  <rect x="${HALF}" y="0" width="${HALF}" height="${HEIGHT}" fill="url(#rightFade)"/>

  ${leftDim ? `<rect x="0" y="0" width="${HALF}" height="${HEIGHT}" fill="#000000" opacity="0.45"/>` : ""}
  ${rightDim ? `<rect x="${HALF}" y="0" width="${HALF}" height="${HEIGHT}" fill="#000000" opacity="0.45"/>` : ""}

  ${crownShape}

  <text x="24" y="42" font-family="VoteSans, DejaVu Sans, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${escapeXml(leftVotes)}</text>
  <text x="${WIDTH - 24}" y="42" font-family="VoteSans, DejaVu Sans, sans-serif" font-size="28" font-weight="700" fill="#ffffff" text-anchor="end">${escapeXml(rightVotes)}</text>

  <text x="24" y="${HEIGHT - 64}" font-family="VoteSans, DejaVu Sans, sans-serif" font-size="26" font-weight="700" fill="${leftFill}">${leftName}</text>
  <text x="${HALF - 24}" y="${HEIGHT - 64}" font-family="VoteSans, DejaVu Sans, sans-serif" font-size="26" font-weight="700" fill="${leftPctFill}" text-anchor="end">${left.percent}%</text>
  <text x="${HALF + 24}" y="${HEIGHT - 64}" font-family="VoteSans, DejaVu Sans, sans-serif" font-size="26" font-weight="700" fill="${rightFill}">${rightName}</text>
  <text x="${WIDTH - 24}" y="${HEIGHT - 64}" font-family="VoteSans, DejaVu Sans, sans-serif" font-size="26" font-weight="700" fill="${rightPctFill}" text-anchor="end">${right.percent}%</text>

  <rect x="24" y="${barY}" width="${HALF - 48}" height="${barH}" rx="10" fill="${barTrack}" opacity="0.75"/>
  <rect x="24" y="${barY}" width="${leftBar}" height="${barH}" rx="10" fill="${leftBarColor}"/>
  <rect x="${HALF + 24}" y="${barY}" width="${HALF - 48}" height="${barH}" rx="10" fill="${barTrack}" opacity="0.75"/>
  <rect x="${HALF + 24}" y="${barY}" width="${rightBar}" height="${barH}" rx="10" fill="${rightBarColor}"/>

  <rect x="${HALF - 44}" y="${HEIGHT / 2 - 28}" width="88" height="56" rx="12" fill="#000000" opacity="0.55"/>
  <text x="${HALF}" y="${HEIGHT / 2 + 10}" font-family="VoteSans, DejaVu Sans, sans-serif" font-size="28" font-weight="800" fill="#ffffff" text-anchor="middle">VS</text>
</svg>`;

  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: { r: 20, g: 24, b: 32 },
    },
  })
    .composite([
      { input: leftBg, left: 0, top: 0 },
      { input: rightBg, left: HALF, top: 0 },
      { input: Buffer.from(overlay), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** Tiny placeholder avatar if fetch fails. */
export async function placeholderAvatar(color: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="${color}"/>
    <circle cx="128" cy="100" r="48" fill="#ffffff" opacity="0.85"/>
    <ellipse cx="128" cy="210" rx="72" ry="56" fill="#ffffff" opacity="0.85"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
