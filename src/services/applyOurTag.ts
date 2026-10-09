import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  EmbedBuilder,
  type Guild,
  type Message,
  type TextChannel,
} from "discord.js";
import { config } from "../config.js";

/** Light blue / periwinkle — matches Socialize apply-tag embed. */
export const APPLY_TAG_EMBED_COLOR = 0x143b96;

const ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets",
);

/** Preview of the moon tag next to a username (bottom of embed). */
const PREVIEW_FILE = "apply-tag-preview.png";

export type ApplyTagOptions = {
  /** Name shown in Server Tags dropdown (default: moon). */
  serverTagName?: string;
  /** Whether to react 🌙 after posting (default true). */
  reactGoat?: boolean;
};

/**
 * “Enable our server tag” embed for `#apply-our-tag`.
 */
export function buildApplyOurTagEmbed(
  _guild: Guild,
  opts: ApplyTagOptions = {},
): EmbedBuilder {
  const tagName = opts.serverTagName?.trim() || "MOON";
  const starRole = `<@&${config.serverTagRoleId}>`;

  return new EmbedBuilder()
    .setColor(APPLY_TAG_EMBED_COLOR)
    .setTitle("🌙 Want That Moon Tag Next to Your Name?")
    .setDescription(
      [
        "**🖥️ Desktop**",
        `User Settings → Profiles → Scroll down to Server Tags → Click the dropdown → Select **${tagName}**`,
        "",
        "**📱 Mobile**",
        `Edit Profile → Scroll down to Server Tags → Tap the dropdown → Select **${tagName}**`,
        "",
        `Once selected, you'll automatically get the shiny **${tagName}** tag and ✨ ${starRole} next to your name!`,
      ].join("\n"),
    );
}

/**
 * Post the apply-our-tag instructional message in a channel.
 * Staff: run `!postapplytag` inside `#apply-our-tag`.
 */
export async function postApplyOurTagMessage(
  channel: TextChannel,
  opts: ApplyTagOptions = {},
): Promise<Message> {
  const embed = buildApplyOurTagEmbed(channel.guild, opts);
  const files: AttachmentBuilder[] = [];

  const previewPath = path.join(ASSETS, PREVIEW_FILE);
  if (existsSync(previewPath)) {
    files.push(
      new AttachmentBuilder(previewPath, { name: PREVIEW_FILE }),
    );
    embed.setImage(`attachment://${PREVIEW_FILE}`);
  }

  const sent = await channel.send({
    embeds: [embed],
    files,
    allowedMentions: { parse: [] },
  });

  if (opts.reactGoat !== false) {
    await sent.react("🌙").catch(() => null);
  }

  return sent;
}
