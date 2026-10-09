import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type Message,
  type TextChannel,
} from "discord.js";
import { EMBED_COLOR, config } from "../config.js";
import { getAppealsGuildId } from "../utils/appealsGuild.js";

const ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets",
);

const FAQ_BANNER_FILE = "appeals-faq-banner.png";

const RULES_MARKER = "Hesitation Appeals Server Rules";
const FAQ_MARKER = "Frequently Asked Questions";

const TOS_URL = "https://discord.com/terms";
const GUIDELINES_URL = "https://discord.com/guidelines";

function channelUrl(guildId: string, channelId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}`;
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

function ruleField(n: number, text: string): { name: string; value: string; inline: boolean } {
  return {
    name: `**Rule ${n}:**`,
    value: `> ${text}`,
    inline: true,
  };
}

export function buildAppealsRulesEmbeds(ticketsChannelId: string): EmbedBuilder[] {
  const rules = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`${RULES_MARKER}:`)
    .setDescription(
      [
        `Welcome to the **Hesitation Appeals** server! This server is intended for users who have been banned from the **Hesitation** Discord server and wish to appeal their ban. In your appeal ticket, you must follow all rules listed below, as well as Discord’s official **[Terms of Service](${TOS_URL})** and **[Community Guidelines](${GUIDELINES_URL})**.`,
      ].join("\n"),
    )
    .addFields(
      ruleField(1, "You cannot appeal if you have already been unbanned once before."),
      ruleField(2, "You cannot appeal if your ban was temporary."),
      ruleField(3, "Do not mass ping the appeal staff."),
      ruleField(4, "Do not open multiple appeal tickets. If told to wait, you must wait the given time before appealing."),
      ruleField(5, "You may not open an appeal ticket unless at least 30 days have passed since the time of your ban."),
      ruleField(6, "Do not harass appeal staff if your ticket isn’t going your way or if your appeal is denied."),
    );

  const howTo = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("How To Open A Ban Appeal Ticket")
    .setDescription(
      [
        "> Please read these carefully! Remember that staff reserves the right to ban you from this server, so always be on your best behaviour.",
        "",
        "1. Please read the rules stated above.",
        `2. Head over to <#${ticketsChannelId}> & open a ticket`,
        "3. Explain your situation:",
        " ⤷ *Why were you banned from Hesitation?*",
        " ⤷ *Why do you believe the ban should be lifted?*",
        " ⤷ *How will you ensure this doesn't happen again?*",
        "4. Tickets will be closed if no responses are received.",
        "5. If you are not banned from Hesitation, do not open a ticket.",
      ].join("\n"),
    );

  return [rules, howTo];
}

export function buildAppealsRulesButtons(
  guildId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Open A Ticket")
      .setEmoji("👋")
      .setStyle(ButtonStyle.Link)
      .setURL(channelUrl(guildId, config.appealsTicketsChannelId)),
    new ButtonBuilder()
      .setLabel("FAQ")
      .setEmoji("❓")
      .setStyle(ButtonStyle.Link)
      .setURL(channelUrl(guildId, config.appealsFaqChannelId)),
  );
}

export function buildAppealsFaqEmbed(rulesChannelId: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(FAQ_MARKER)
    .setDescription(
      [
        "**➡ How do I appeal my ban?**",
        `> *To appeal your ban, go to <#${rulesChannelId}> and click the **Open A Ticket** button*`,
        "",
        "**➡ Can I appeal if my ban was temporary?**",
        "> *No, temporary bans cannot be appealed. You must wait for the temporary ban to expire before rejoining the server. Temporary bans are lifted automatically.*",
        "",
        "**➡ Can I appeal if I've already been unbanned once before?**",
        "> *No, you cannot appeal again if you've been unbanned previously. Appeals are only available for first-time bans unless you believe your ban was a false ban or a mistake.*",
        "",
        "**➡ Can I appeal if I wasn't banned from Hesitation?**",
        "> *No, do not open a ticket here if you are not banned from the **Hesitation** server. This server is only for banned users to appeal their bans.*",
        "",
        "**➡ How long does it take for my appeal to be reviewed?**",
        "> *Appeal staff will review your ticket as soon as possible. Please be patient and avoid repeatedly asking for updates, as this could slow down the process.*",
        "",
        "**➡ Can I DM or ping the appeal staff for help with my appeal?**",
        "> *No, mass pinging or DMing the appeal staff is not allowed, you will be banned.*",
        "",
        "**➡ What if I break the rules in this server?**",
        "> *Breaking the rules in the appeals server can result in a ban from this server.*",
      ].join("\n"),
    );

  const bannerPath = path.join(ASSETS, FAQ_BANNER_FILE);
  if (existsSync(bannerPath)) {
    embed.setImage(`attachment://${FAQ_BANNER_FILE}`);
  }

  return embed;
}

export function buildAppealsFaqButtons(
  guildId: string,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  const invite = config.mainServerInviteUrl;
  if (invite) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Invite To Hesitation")
        .setStyle(ButtonStyle.Link)
        .setURL(invite),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setLabel("Click Here To Open A Ticket")
      .setEmoji("🖱️")
      .setStyle(ButtonStyle.Link)
      .setURL(channelUrl(guildId, config.appealsTicketsChannelId)),
  );
  return row;
}

function isBotRulesMessage(message: Message): boolean {
  if (message.author.id !== message.client.user?.id) return false;
  return message.embeds.some(
    (e) => e.title?.includes(RULES_MARKER) || e.title?.includes("Ban Appeal Ticket"),
  );
}

function isBotFaqMessage(message: Message): boolean {
  if (message.author.id !== message.client.user?.id) return false;
  return message.embeds.some((e) => e.title === FAQ_MARKER);
}

async function findBotMessage(
  channel: TextChannel,
  predicate: (m: Message) => boolean,
): Promise<Message | null> {
  const fetched = await channel.messages.fetch({ limit: 50 }).catch((err) => {
    console.warn("[appeals] Failed to scan channel history:", err);
    return null;
  });
  if (!fetched) return null;

  const matches = [...fetched.values()]
    .filter(predicate)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const keep = matches[0] ?? null;
  for (const dup of matches.slice(1)) {
    await dup.delete().catch(() => null);
  }
  return keep;
}

async function ensureRulesPost(
  client: Client<true>,
  guildId: string,
): Promise<void> {
  const channelId = config.appealsRulesChannelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!isTextChannel(channel)) {
    console.warn(`[appeals] Rules channel ${channelId} missing or not text.`);
    return;
  }

  const embeds = buildAppealsRulesEmbeds(config.appealsTicketsChannelId);
  const components = [buildAppealsRulesButtons(guildId)];
  const existing = await findBotMessage(channel, isBotRulesMessage);

  if (existing) {
    await existing.edit({
      embeds,
      components,
      allowedMentions: { parse: [] },
    });
    console.log(`[appeals] Updated rules post (${existing.id}).`);
    return;
  }

  const sent = await channel.send({
    embeds,
    components,
    allowedMentions: { parse: [] },
  });
  console.log(`[appeals] Posted rules post (${sent.id}).`);
}

async function ensureFaqPost(
  client: Client<true>,
  guildId: string,
): Promise<void> {
  const channelId = config.appealsFaqChannelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!isTextChannel(channel)) {
    console.warn(`[appeals] FAQ channel ${channelId} missing or not text.`);
    return;
  }

  const embed = buildAppealsFaqEmbed(config.appealsRulesChannelId);
  const components = [buildAppealsFaqButtons(guildId)];
  const files: AttachmentBuilder[] = [];
  const bannerPath = path.join(ASSETS, FAQ_BANNER_FILE);
  if (existsSync(bannerPath)) {
    files.push(new AttachmentBuilder(bannerPath, { name: FAQ_BANNER_FILE }));
  }

  const existing = await findBotMessage(channel, isBotFaqMessage);
  if (existing) {
    await existing.edit({
      embeds: [embed],
      components,
      files,
      allowedMentions: { parse: [] },
    });
    console.log(`[appeals] Updated FAQ post (${existing.id}).`);
    return;
  }

  const sent = await channel.send({
    embeds: [embed],
    components,
    files,
    allowedMentions: { parse: [] },
  });
  console.log(`[appeals] Posted FAQ post (${sent.id}).`);
}

/**
 * Post / refresh appeals rules + FAQ embeds (survives restarts).
 */
export async function ensureAppealsInfoPosts(
  client: Client<true>,
): Promise<void> {
  const guildId = await getAppealsGuildId(client);
  if (!guildId) {
    console.warn("[appeals] Could not resolve appeals guild — skipping posts.");
    return;
  }

  await ensureRulesPost(client, guildId);
  await ensureFaqPost(client, guildId);
}
