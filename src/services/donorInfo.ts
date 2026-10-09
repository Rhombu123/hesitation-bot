import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  ComponentType,
  MessageFlags,
  type APIComponentInContainer,
  type APIMessageTopLevelComponent,
  type Client,
  type Message,
  type TextChannel,
} from "discord.js";
import { config, EMBED_COLOR } from "../config.js";

const ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets",
);

const BANNER_FILE = "supreme-commands-banner.jpg";

/** Legacy embed author — still used to find older posts for migration. */
export const DONOR_INFO_AUTHOR = "Supreme Info";

const COMMANDS = [
  "!boost",
  "!role info",
  "!role setup",
  "!role give",
  "!role manage",
  "!role remove",
  "!role removeme",
  "!role overview",
] as const;

function commandList(): string {
  return COMMANDS.map((cmd) => `- \`${cmd}\``).join("\n");
}

function commandBody(): string {
  return [`📝 **Commands**`, "", commandList()].join("\n");
}

export function buildDonorInfoPayload(): {
  components: APIMessageTopLevelComponent[];
  files: AttachmentBuilder[];
  flags: typeof MessageFlags.IsComponentsV2;
} {
  const bannerPath = path.join(ASSETS, BANNER_FILE);
  const files: AttachmentBuilder[] = [];
  const containerChildren: APIComponentInContainer[] = [];

  if (existsSync(bannerPath)) {
    files.push(new AttachmentBuilder(bannerPath, { name: BANNER_FILE }));
    containerChildren.push({
      type: ComponentType.MediaGallery,
      items: [{ media: { url: `attachment://${BANNER_FILE}` } }],
    });
    containerChildren.push({
      type: ComponentType.Separator,
      divider: true,
    });
  } else {
    console.warn(
      `[donorInfo] Missing ${bannerPath} — posting without banner image.`,
    );
  }

  containerChildren.push({
    type: ComponentType.TextDisplay,
    content: commandBody(),
  });

  return {
    components: [
      {
        type: ComponentType.Container,
        accent_color: EMBED_COLOR,
        components: containerChildren,
      },
    ],
    files,
    flags: MessageFlags.IsComponentsV2,
  };
}

function isTextChannel(channel: unknown): channel is TextChannel {
  return (
    !!channel &&
    typeof channel === "object" &&
    "isTextBased" in channel &&
    typeof (channel as TextChannel).isTextBased === "function" &&
    (channel as TextChannel).isTextBased() &&
    "messages" in channel
  );
}

function isDonorInfoMessage(message: Message): boolean {
  if (message.author.id !== message.client.user?.id) return false;

  if (message.flags.has(MessageFlags.IsComponentsV2)) {
    return message.components.some((component) => {
      if (component.type !== ComponentType.Container || !("components" in component)) {
        return false;
      }
      return component.components.some(
        (inner) =>
          inner.type === ComponentType.TextDisplay &&
          "content" in inner &&
          inner.content.includes("`!boost`"),
      );
    });
  }

  return message.embeds.some((embed) => embed.author?.name === DONOR_INFO_AUTHOR);
}

function hasCorrectDonorInfoLayout(message: Message): boolean {
  if (!message.flags.has(MessageFlags.IsComponentsV2) || message.embeds.length > 0) {
    return false;
  }

  const container = message.components.find(
    (component) => component.type === ComponentType.Container,
  );
  if (!container || !("components" in container)) return false;

  const inner = container.components;
  const bannerPath = path.join(ASSETS, BANNER_FILE);
  const expectBanner = existsSync(bannerPath);

  let idx = 0;
  if (expectBanner) {
    if (inner[idx]?.type !== ComponentType.MediaGallery) return false;
    idx += 1;
    if (inner[idx]?.type !== ComponentType.Separator) return false;
    idx += 1;
  }

  const text = inner[idx];
  if (text?.type !== ComponentType.TextDisplay || !("content" in text)) return false;

  return (
    text.content.includes("- `!boost`") &&
    text.content.includes("📝 **Commands**") &&
    !text.content.includes("<@&")
  );
}

async function findDonorInfoMessage(
  channel: TextChannel,
): Promise<Message | null> {
  const fetched = await channel.messages.fetch({ limit: 50 }).catch((err) => {
    console.warn("[donorInfo] Failed to scan channel history:", err);
    return null;
  });
  if (!fetched) return null;

  const matches = [...fetched.values()]
    .filter(isDonorInfoMessage)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const keep = matches[0] ?? null;
  for (const dup of matches.slice(1)) {
    await dup.delete().catch(() => null);
  }
  return keep;
}

/**
 * Post the donor-info command list once. Skips if the layout is already correct
 * (survives bot restarts and redeploys).
 */
export async function ensureDonorInfoPost(client: Client<true>): Promise<void> {
  const channelId = config.donorInfoChannelId;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!isTextChannel(channel)) {
    console.warn(`[donorInfo] Channel ${channelId} is missing or not text.`);
    return;
  }

  const existing = await findDonorInfoMessage(channel);
  const payload = buildDonorInfoPayload();
  const sendOptions = {
    ...payload,
    embeds: [],
    allowedMentions: { parse: [] },
  };

  if (existing) {
    if (hasCorrectDonorInfoLayout(existing)) {
      console.log(
        `[donorInfo] Donor info post already present (${existing.id}) — skipping.`,
      );
      return;
    }
    await existing.edit(sendOptions);
    console.log(`[donorInfo] Updated donor info post (${existing.id}).`);
    return;
  }

  const sent = await channel.send(sendOptions);
  console.log(`[donorInfo] Posted donor info post (${sent.id}).`);
}
