import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Client as DiscordClient } from "discord.js";
import { handleShopBuyGet, handleShopGet } from "./shopPages.js";
import { handleStripeWebhookEvent } from "../services/stripeShopWebhook.js";

/** Whitelisted public files under ./assets (no directory traversal). */
const PUBLIC_ASSETS: Record<string, { file: string; type: string }> = {
  "/assets/shop-moon-logo.jpg": {
    file: "shop-moon-logo.jpg",
    type: "image/jpeg",
  },
};

async function serveAsset(
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const asset = PUBLIC_ASSETS[pathname];
  if (!asset) return false;
  try {
    const body = await readFile(join(process.cwd(), "assets", asset.file));
    res.writeHead(200, {
      "Content-Type": asset.type,
      "Content-Length": body.length,
      "Cache-Control": "public, max-age=86400",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
  return true;
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Health + role shop + Stripe webhook on the same Railway PORT.
 */
export function startShopHttpServer(
  port: number,
  discord: DiscordClient,
): ReturnType<typeof createServer> {
  const server = createServer((req, res) => {
    void route(req, res, discord).catch((err) => {
      console.error("[http]", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
      }
      res.end("error");
    });
  });

  server.listen(port, () => {
    console.log(`[http] Listening on :${port} (health + shop + stripe webhook)`);
  });

  return server;
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  discord: DiscordClient,
): Promise<void> {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const method = (req.method ?? "GET").toUpperCase();

  if (method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (method === "GET" && (await serveAsset(res, url.pathname))) return;
  if (method === "GET" && handleShopGet(req, res, url)) return;
  if (method === "GET" && handleShopBuyGet(req, res, url)) return;

  if (method === "POST" && url.pathname === "/stripe/webhook") {
    const raw = await readRawBody(req);
    const result = await handleStripeWebhookEvent(
      discord,
      raw,
      req.headers["stripe-signature"],
    );
    res.writeHead(result.status, { "Content-Type": "text/plain" });
    res.end(result.body);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
}
