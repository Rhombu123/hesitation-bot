import sharp, { type OverlayOptions } from "sharp";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strip chars that make librsvg / sharp XML parsing throw. */
function sanitizeXmlText(s: string): string {
  return [...s]
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return (
        cp === 0x9 ||
        cp === 0xa ||
        cp === 0xd ||
        (cp >= 0x20 && cp <= 0xd7ff) ||
        (cp >= 0xe000 && cp <= 0xfffd) ||
        (cp >= 0x10000 && cp <= 0x10ffff)
      );
    })
    .join("");
}

/** Rasterize SVG and force exact pixel bounds (prevents sharp composite failures). */
async function rasterSvg(
  svg: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  try {
    return await sharp(svg, { density: 72 })
      .resize(w, h, {
        fit: "fill",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .png()
      .toBuffer();
  } catch {
    // Fallback empty transparent tile — never fail the whole card.
    return sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
  }
}


type TextToken = { kind: "text"; text: string };
type EmojiToken = { kind: "emoji"; url: string; key: string };
type Token = TextToken | EmojiToken;

const CUSTOM_EMOJI_RE = /<(a?):([a-zA-Z0-9_]+):(\d+)>/g;
const UNICODE_EMOJI_RE =
  /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*(?:\u20E3)?|\d\uFE0F?\u20E3|[#*]\uFE0F?\u20E3/gu;

/** Card “box” — prefer shrinking font to fit this height before growing. */
const BOX_H = 420;
const BOX_MAX_H = 900;
const AVATAR_W = 400;
const TEXT_X = 440;
const TEXT_RIGHT_PAD = 36;
const TEXT_MAX_W = 900 - TEXT_X - TEXT_RIGHT_PAD; // ~424
const TOP_PAD = 52;
const BOTTOM_PAD = 88; // room for name + handle
const FONT_FAMILY = "DejaVu Sans, Arial, Helvetica, sans-serif";

function twemojiCode(emoji: string): string {
  return [...emoji]
    .map((ch) => ch.codePointAt(0)!.toString(16))
    .filter((h) => h !== "fe0f")
    .join("-");
}

function twemojiUrl(emoji: string): string {
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${twemojiCode(emoji)}.png`;
}

function discordEmojiUrl(id: string): string {
  return `https://cdn.discordapp.com/emojis/${id}.png?size=96&quality=lossless`;
}

/** Split raw Discord message content into text + emoji tokens. */
export function tokenizeQuoteText(raw: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = sanitizeXmlText(raw.replace(/\s+/g, " ").trim());
  if (!s) return [{ kind: "text", text: " " }];

  let guard = 0;
  while (i < s.length) {
    if (++guard > s.length + 5) break;

    CUSTOM_EMOJI_RE.lastIndex = i;
    const custom = CUSTOM_EMOJI_RE.exec(s);
    UNICODE_EMOJI_RE.lastIndex = i;
    const uni = UNICODE_EMOJI_RE.exec(s);

    const customAt = custom && custom.index === i ? custom : null;
    const uniAt = uni && uni.index === i ? uni : null;

    if (customAt) {
      const id = customAt[3]!;
      tokens.push({
        kind: "emoji",
        key: `d:${id}`,
        url: discordEmojiUrl(id),
      });
      i = customAt.index + customAt[0].length;
      continue;
    }

    if (uniAt) {
      const emoji = uniAt[0]!;
      tokens.push({
        kind: "emoji",
        key: `u:${twemojiCode(emoji)}`,
        url: twemojiUrl(emoji),
      });
      i = uniAt.index + emoji.length;
      continue;
    }

    let next = s.length;
    CUSTOM_EMOJI_RE.lastIndex = i;
    const nextCustom = CUSTOM_EMOJI_RE.exec(s);
    if (nextCustom) next = Math.min(next, nextCustom.index);
    UNICODE_EMOJI_RE.lastIndex = i;
    const nextUni = UNICODE_EMOJI_RE.exec(s);
    if (nextUni) next = Math.min(next, nextUni.index);

    // Always advance at least one code point to avoid infinite loops.
    if (next <= i) next = i + (s.codePointAt(i)! > 0xffff ? 2 : 1);

    const chunk = s.slice(i, next);
    if (chunk) tokens.push({ kind: "text", text: chunk });
    i = next;
  }

  return tokens.length > 0 ? tokens : [{ kind: "text", text: " " }];
}

/**
 * Bold DejaVu advance widths — deliberately generous so wrap breaks early
 * and SVG tiles never clip glyphs on the right edge.
 */
function measureText(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x20) w += fontSize * 0.34;
    else if (cp < 0x7f) w += fontSize * 0.72; // bold Latin (was too low → clipped)
    else w += fontSize * 1.0;
  }
  return w * 1.04; // small safety pad
}

function emojiSlot(fontSize: number): number {
  return Math.round(fontSize * 1.2) + 6;
}

function measureToken(token: Token, fontSize: number): number {
  if (token.kind === "emoji") return emojiSlot(fontSize);
  return measureText(token.text, fontSize);
}

/** Words for wrapping — keep emojis attached to adjacent word pieces. */
function wrapTokens(
  tokens: Token[],
  fontSize: number,
  maxWidth: number,
): Token[][] {
  // Flatten into wrap units: each unit is a word (text) or emoji, spaces are glue.
  const units: Token[] = [];
  for (const t of tokens) {
    if (t.kind === "emoji") {
      units.push(t);
      continue;
    }
    const words = t.text.split(" ").filter((w) => w.length > 0);
    for (let i = 0; i < words.length; i++) {
      units.push({ kind: "text", text: words[i]! });
      if (i < words.length - 1) {
        units.push({ kind: "text", text: " " });
      }
    }
  }

  const lines: Token[][] = [];
  let cur: Token[] = [];
  let curW = 0;

  const flush = () => {
    // Trim leading/trailing spaces on the line
    while (cur[0]?.kind === "text" && cur[0].text === " ") cur.shift();
    while (
      cur.length &&
      cur[cur.length - 1]?.kind === "text" &&
      (cur[cur.length - 1] as TextToken).text === " "
    ) {
      cur.pop();
    }
    if (cur.length) lines.push(cur);
    cur = [];
    curW = 0;
  };

  for (const unit of units) {
    const w = measureToken(unit, fontSize);
    const isSpace = unit.kind === "text" && unit.text === " ";

    if (cur.length > 0 && curW + w > maxWidth) {
      flush();
      if (isSpace) continue;
    }

    if (unit.kind === "text" && !isSpace && w > maxWidth && cur.length === 0) {
      let rest = unit.text;
      while (rest.length > 0) {
        let take = rest.length;
        while (take > 1 && measureText(rest.slice(0, take), fontSize) > maxWidth) {
          take--;
        }
        cur.push({ kind: "text", text: rest.slice(0, take) });
        flush();
        rest = rest.slice(take);
      }
      continue;
    }

    cur.push(unit);
    curW += w;
  }
  flush();
  return lines.length > 0 ? lines : [[{ kind: "text", text: " " }]];
}

function lineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.45);
}

function layoutQuote(tokens: Token[]): {
  lines: Token[][];
  fontSize: number;
  lineH: number;
  height: number;
} {
  // Largest first so short quotes stay big; shrink only when needed.
  const candidates = [48, 44, 40, 36, 32, 28, 24, 20, 16, 14, 12];

  for (const fontSize of candidates) {
    const lineH = lineHeight(fontSize);
    const lines = wrapTokens(tokens, fontSize, TEXT_MAX_W);
    const textH = lines.length * lineH;
    const needed = TOP_PAD + textH + BOTTOM_PAD;
    if (needed <= BOX_H) {
      return { lines, fontSize, lineH, height: BOX_H };
    }
  }

  // Still too long at min size — grow the card up to the cap.
  const fontSize = 12;
  const lineH = lineHeight(fontSize);
  let lines = wrapTokens(tokens, fontSize, TEXT_MAX_W);
  const height = Math.min(
    BOX_MAX_H,
    Math.max(BOX_H, TOP_PAD + lines.length * lineH + BOTTOM_PAD),
  );
  const maxLines = Math.max(
    1,
    Math.floor((height - TOP_PAD - BOTTOM_PAD) / lineH),
  );
  if (lines.length > maxLines) lines = lines.slice(0, maxLines);
  return { lines, fontSize, lineH, height };
}

async function fetchEmojiPng(
  url: string,
  size: number,
  cache: Map<string, Buffer>,
): Promise<Buffer | null> {
  const cached = cache.get(url);
  if (cached) {
    return sharp(cached).resize(size, size, { fit: "contain" }).png().toBuffer();
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = Buffer.from(await res.arrayBuffer());
    cache.set(url, raw);
    return sharp(raw).resize(size, size, { fit: "contain" }).png().toBuffer();
  } catch (err) {
    console.warn("[quote] Emoji fetch failed:", url, err);
    return null;
  }
}

/**
 * Render one line: merge consecutive text into a single bold SVG run so
 * spacing stays even; place emoji images in the gaps.
 * Text-only lines use the full panel width so glyphs are never clipped.
 */
async function renderTokenLine(
  tokens: Token[],
  fontSize: number,
  lineH: number,
  maxWidth: number,
  cache: Map<string, Buffer>,
): Promise<Buffer> {
  const emojiSize = Math.max(14, Math.round(fontSize * 1.1));
  const baseline = Math.round((lineH + fontSize * 0.72) / 2);
  const hasEmoji = tokens.some((t) => t.kind === "emoji");

  // Fast path: pure text — one full-width SVG (wrap already chose the line).
  if (!hasEmoji) {
    const text = tokens
      .map((t) => (t.kind === "text" ? t.text : ""))
      .join("");
    const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${maxWidth}" height="${lineH}" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="${baseline}" font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="700" fill="#FFFFFF">${escapeXml(sanitizeXmlText(text))}</text>
</svg>`);
    return rasterSvg(svg, maxWidth, lineH);
  }

  const overlays: OverlayOptions[] = [];
  let x = 0;

  type Run =
    | { kind: "text"; text: string }
    | { kind: "emoji"; url: string };
  const runs: Run[] = [];
  for (const t of tokens) {
    if (t.kind === "text") {
      const last = runs[runs.length - 1];
      if (last?.kind === "text") last.text += t.text;
      else runs.push({ kind: "text", text: t.text });
    } else {
      runs.push({ kind: "emoji", url: t.url });
    }
  }

  for (const run of runs) {
    if (x >= maxWidth) break;

    if (run.kind === "text") {
      if (!run.text) continue;
      const remaining = maxWidth - x;
      if (remaining < fontSize * 0.5) break;

      // Tile must be at least as wide as real bold glyphs (never crop mid-word).
      const needed = Math.ceil(measureText(run.text, fontSize));
      if (needed > remaining + 1) break; // shouldn't happen if wrap is correct
      const tileW = Math.max(1, Math.min(remaining, needed));
      const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${tileW}" height="${lineH}" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="${baseline}" font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="700" fill="#FFFFFF">${escapeXml(sanitizeXmlText(run.text))}</text>
</svg>`);
      overlays.push({
        input: await rasterSvg(svg, tileW, lineH),
        left: Math.round(x),
        top: 0,
      });
      x += tileW;
      continue;
    }

    const slot = Math.min(emojiSlot(fontSize), maxWidth - x);
    if (slot < emojiSize * 0.5) break;
    const img = await fetchEmojiPng(run.url, Math.min(emojiSize, slot), cache);
    if (img) {
      const fitted = await sharp(img)
        .resize(Math.floor(slot), lineH, { fit: "inside" })
        .png()
        .toBuffer();
      const meta = await sharp(fitted).metadata();
      const iw = Math.min(Math.floor(slot), meta.width ?? Math.floor(slot));
      const ih = Math.min(lineH, meta.height ?? emojiSize);
      const safe = await sharp(fitted)
        .resize(iw, ih, { fit: "fill" })
        .png()
        .toBuffer();
      overlays.push({
        input: safe,
        left: Math.round(x + Math.max(0, (slot - iw) / 2)),
        top: Math.max(0, Math.round((lineH - ih) / 2)),
      });
    }
    x += slot;
  }

  const width = maxWidth;
  const safeOverlays: OverlayOptions[] = [];
  for (const o of overlays) {
    const meta = await sharp(o.input as Buffer).metadata();
    const ow = meta.width ?? 0;
    const oh = meta.height ?? 0;
    const left = typeof o.left === "number" ? o.left : 0;
    if (ow > 0 && oh > 0 && ow <= width && oh <= lineH && left + ow <= width) {
      safeOverlays.push(o);
    }
  }

  return sharp({
    create: {
      width,
      height: lineH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(safeOverlays)
    .png()
    .toBuffer();
}

export type QuoteCardInput = {
  quoteText: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  watermark?: string;
};

/**
 * Quote card: color PFP left with soft fade into black,
 * bold quote text on the right (shrinks to fit the box; emojis as images).
 */
export async function renderQuoteCard(input: QuoteCardInput): Promise<Buffer> {
  const W = 900;
  const tokens = tokenizeQuoteText(input.quoteText || " ");
  const layout = layoutQuote(tokens);
  const H = layout.height;
  const emojiCache = new Map<string, Buffer>();

  let avatarRaw: Buffer;
  if (input.avatarUrl) {
    try {
      const res = await fetch(input.avatarUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      avatarRaw = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.warn("[quote] Avatar fetch failed:", err);
      avatarRaw = await sharp({
        create: {
          width: AVATAR_W,
          height: H,
          channels: 3,
          background: { r: 40, g: 40, b: 40 },
        },
      })
        .png()
        .toBuffer();
    }
  } else {
    avatarRaw = await sharp({
      create: {
        width: AVATAR_W,
        height: H,
        channels: 3,
        background: { r: 40, g: 40, b: 40 },
      },
    })
      .png()
      .toBuffer();
  }

  let avatarBuf = await sharp(avatarRaw)
    .resize(AVATAR_W, H, { fit: "cover", position: "centre" })
    .modulate({ brightness: 1.02 })
    .ensureAlpha()
    .png()
    .toBuffer();

  const fadeMask = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${AVATAR_W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="50%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="70%" stop-color="#fff" stop-opacity="0.55"/>
      <stop offset="85%" stop-color="#fff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#a)"/>
</svg>`);

  avatarBuf = await sharp(avatarBuf)
    .composite([
      {
        input: await rasterSvg(fadeMask, AVATAR_W, H),
        blend: "dest-in",
      },
    ])
    .blur(0.6)
    .png()
    .toBuffer();

  const textPanelW = W - TEXT_X;
  const textBlockH = layout.lines.length * layout.lineH;
  const attrGap = 40; // space between quote and "- Name"
  const attrBlockH = 52; // name + handle
  // Vertically center quote + attribution as one block (short quotes sit mid-panel again).
  const blockH = textBlockH + attrGap + attrBlockH;
  const textStartY = Math.max(
    28,
    Math.min(
      Math.floor((H - blockH) / 2),
      Math.max(28, H - blockH - 28),
    ),
  );

  const lineOverlays: OverlayOptions[] = [];
  for (let i = 0; i < layout.lines.length; i++) {
    let lineBuf = await renderTokenLine(
      layout.lines[i]!,
      layout.fontSize,
      layout.lineH,
      textPanelW,
      emojiCache,
    );
    // Hard clamp — sharp rejects overlays wider/taller than the base image.
    const meta = await sharp(lineBuf).metadata();
    if ((meta.width ?? 0) > textPanelW || (meta.height ?? 0) > layout.lineH) {
      lineBuf = await sharp(lineBuf)
        .resize(textPanelW, layout.lineH, { fit: "inside" })
        .png()
        .toBuffer();
    }
    lineOverlays.push({
      input: lineBuf,
      left: 0,
      top: textStartY + i * layout.lineH,
    });
  }

  const nameY = textStartY + textBlockH + attrGap;
  const nameSize = Math.max(16, Math.min(22, Math.round(layout.fontSize * 0.45)));
  const handleSize = Math.max(13, Math.min(16, Math.round(nameSize * 0.78)));
  const safeName = escapeXml(sanitizeXmlText(input.displayName));
  const safeUser = escapeXml(sanitizeXmlText(input.username));
  const watermark = escapeXml(
    sanitizeXmlText(input.watermark ?? "Hesitant"),
  );
  const metaSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${textPanelW}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="${nameY}" font-family="${FONT_FAMILY}" font-size="${nameSize}" font-weight="700" fill="#FFFFFF">- ${safeName}</text>
  <text x="0" y="${nameY + nameSize + 8}" font-family="${FONT_FAMILY}" font-size="${handleSize}" fill="#A8A8A8">@${safeUser}</text>
  <text x="${textPanelW - 16}" y="${H - 14}" font-family="${FONT_FAMILY}" font-size="11" fill="#555555" text-anchor="end">${watermark}</text>
</svg>`);

  const textPanel = await sharp({
    create: {
      width: textPanelW,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      ...lineOverlays,
      { input: await rasterSvg(metaSvg, textPanelW, H), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      { input: avatarBuf, left: 0, top: 0 },
      { input: textPanel, left: TEXT_X, top: 0 },
    ])
    .png()
    .toBuffer();
}
