import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type Client,
  type Interaction,
  type Message,
  type User,
} from "discord.js";
import { join } from "node:path";
import { EMBED_COLOR } from "../config.js";
import { config } from "../config.js";
import { ROLE_IDS } from "../config/rolePrivileges.js";
import {
  buildShopUrl,
  SHOP_OPEN_CUSTOM_ID,
  SHOP_TIERS,
  type ShopTier,
} from "../services/shopLinks.js";
import { MOUSE_EMOJI_ID } from "../utils/customEmojis.js";

const SHOP_THUMB_NAME = "shop-moon-logo.jpg";

function shopThumbAttachment(): AttachmentBuilder {
  return new AttachmentBuilder(
    join(process.cwd(), "assets", SHOP_THUMB_NAME),
    { name: SHOP_THUMB_NAME },
  );
}

function roleMention(tier: ShopTier): string {
  const id =
    tier === "vip"
      ? ROLE_IDS.vip
      : tier === "elite"
        ? ROLE_IDS.elite
        : tier === "supreme"
          ? ROLE_IDS.supreme
          : ROLE_IDS.mythic;
  return id ? `<@&${id}>` : `**${tier}**`;
}

function shopTierLines(): string {
  return SHOP_TIERS.map(
    (t) => `${roleMention(t.id)} — **${t.priceLabel}**`,
  ).join("\n");
}

/** Personal `!shop` / ephemeral reply embed. */
function personalShopEmbed(user: User): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: "Hesitation Role Shop",
      iconURL: user.displayAvatarURL({ size: 64 }),
    })
    .setDescription(
      [
        "Support the server and unlock donor roles.",
        "Your Discord account is **already linked** — open the shop to see full perks and checkout.",
        "",
        shopTierLines(),
      ].join("\n"),
    )
    .setThumbnail(`attachment://${SHOP_THUMB_NAME}`)
    .setFooter({ text: "Personal link · expires in 15 minutes" });
}

function personalShopRow(url: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Open Shop")
      .setStyle(ButtonStyle.Link)
      .setEmoji(MOUSE_EMOJI_ID)
      .setURL(url),
  );
}

/** Public auto-promo embed — button gives each clicker a personal signed link. */
export function buildShopPromoMessage(botUser: User): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  files: AttachmentBuilder[];
} {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: "Hesitation Role Shop",
      iconURL: botUser.displayAvatarURL({ size: 64 }),
    })
    .setDescription(
      [
        "Support the server and unlock donor roles.",
        "Click **Open Shop** for your personal checkout link (Discord already linked).",
        "",
        shopTierLines(),
      ].join("\n"),
    )
    .setThumbnail(`attachment://${SHOP_THUMB_NAME}`)
    .setFooter({ text: "Posted every 2 hours · personal link expires in 15 minutes" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(SHOP_OPEN_CUSTOM_ID)
      .setLabel("Open Shop")
      .setStyle(ButtonStyle.Primary)
      .setEmoji(MOUSE_EMOJI_ID),
  );

  return {
    embeds: [embed],
    components: [row],
    files: [shopThumbAttachment()],
  };
}

/** Ephemeral “open shop” reply with a signed link for this Discord user. */
export async function replyWithSignedShopLink(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== SHOP_OPEN_CUSTOM_ID) return false;

  if (!config.shopLinkSecret || !config.shopPublicUrl) {
    await interaction.reply({
      content:
        "The role shop isn’t configured yet (missing `SHOP_LINK_SECRET` / `SHOP_PUBLIC_URL`).",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const url = buildShopUrl(interaction.user.id);

  await interaction.reply({
    embeds: [personalShopEmbed(interaction.user)],
    components: [personalShopRow(url)],
    files: [shopThumbAttachment()],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [], roles: [], users: [] },
  });
  return true;
}

/** Prefix command: `!shop` — personal signed checkout link. */
export async function handleShopCommand(message: Message<true>): Promise<void> {
  if (!config.shopLinkSecret || !config.shopPublicUrl) {
    await message.reply(
      "The role shop isn’t configured yet. Ask staff to set `SHOP_PUBLIC_URL` and `SHOP_LINK_SECRET`.",
    );
    return;
  }

  const url = buildShopUrl(message.author.id);

  await message.reply({
    embeds: [personalShopEmbed(message.author)],
    components: [personalShopRow(url)],
    files: [shopThumbAttachment()],
    allowedMentions: { parse: [], roles: [], users: [] },
  });
}
