import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Message,
  type TextChannel,
} from "discord.js";
import { config } from "../config.js";

/** Purple sidebar — staff application embed accent. */
export const STAFF_APP_EMBED_COLOR = 0x9b59b6;

const ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets",
);

const BANNER_FILE = "staff-app-banner.png";

export function buildStaffApplicationEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(STAFF_APP_EMBED_COLOR)
    .setTitle("🛡️ Staff Application — Apply now!")
    .setDescription(
      [
        "> Help maintain and keep our community a safe space",
        "",
        "✅ ***__Requirements__***",
        "- Level 5+",
        "- Active and motivated to help out the community",
      ].join("\n"),
    );
}

function applyButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Apply Now")
      .setStyle(ButtonStyle.Link)
      .setURL(config.staffApplicationFormUrl),
  );
}

/**
 * Post the staff application embed (banner + Google Form button).
 * Staff: `!poststaffapp` — posts to the configured channel, or the current channel.
 */
export async function postStaffApplicationMessage(
  channel: TextChannel,
): Promise<Message> {
  const embed = buildStaffApplicationEmbed();
  const files: AttachmentBuilder[] = [];

  const bannerPath = path.join(ASSETS, BANNER_FILE);
  if (existsSync(bannerPath)) {
    files.push(new AttachmentBuilder(bannerPath, { name: BANNER_FILE }));
    embed.setImage(`attachment://${BANNER_FILE}`);
  } else {
    console.warn(
      `[staffApp] Missing ${bannerPath} — posting without banner image.`,
    );
  }

  return channel.send({
    embeds: [embed],
    components: [applyButtonRow()],
    files,
    allowedMentions: { parse: [] },
  });
}
