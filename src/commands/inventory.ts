import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type Interaction,
  type Message,
} from "discord.js";
import { config, EMBED_COLOR } from "../config.js";
import { formatFindUsd, truncateItemName } from "../data/findCatalog.js";
import {
  getUserInventoryPage,
  getUserWeeklyRank,
  getWeeklyValueList,
} from "../services/findInventory.js";
import {
  formatResetCountdown,
  msUntilNextUtcWeek,
} from "../utils/helpers.js";
import {
  CROWN_EMOJI_ID,
  CROWN_EMOJI_NAME,
  INFO_EMOJI_ID,
  INFO_EMOJI_NAME,
  NUMBER_EMOJI_IDS,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";

const PREFIX = "inv";
const RANK_PAGE_SIZE = 10;

type InvView = "home" | "items" | "rank";

type ParsedInvId = {
  view: InvView;
  invokerId: string;
  targetUserId: string;
  page: number;
};

function customId(
  view: InvView,
  invokerId: string,
  targetUserId: string,
  page = 0,
): string {
  return `${PREFIX}:${view}:${invokerId}:${targetUserId}:${page}`;
}

/** Nav arrows/page label — separate prefix so tab buttons never share an id. */
function navCustomId(
  view: "items" | "rank",
  invokerId: string,
  targetUserId: string,
  page: number,
): string {
  return `${PREFIX}:nav:${view}:${invokerId}:${targetUserId}:${page}`;
}

function parseCustomId(id: string): ParsedInvId | null {
  const parts = id.split(":");
  if (parts[0] !== PREFIX) return null;

  if (parts[1] === "nav" && parts.length === 6) {
    const view = parts[2];
    if (view !== "items" && view !== "rank") return null;
    const invokerId = parts[3]!;
    const targetUserId = parts[4]!;
    const page = Number(parts[5]);
    if (!invokerId || !targetUserId || !Number.isFinite(page)) return null;
    return {
      view,
      invokerId,
      targetUserId,
      page: Math.max(0, Math.floor(page)),
    };
  }

  if (parts.length !== 5) return null;
  const view = parts[1] as InvView;
  if (view !== "home" && view !== "items" && view !== "rank") return null;
  const invokerId = parts[2]!;
  const targetUserId = parts[3]!;
  const page = Number(parts[4]);
  if (!invokerId || !targetUserId || !Number.isFinite(page)) return null;
  return { view, invokerId, targetUserId, page: Math.max(0, Math.floor(page)) };
}

function displayName(message: Message<true>, userId: string): string {
  if (userId === message.author.id) {
    return message.member?.displayName ?? message.author.username;
  }
  const member = message.guild.members.cache.get(userId);
  return member?.displayName ?? userId;
}

function tabStyle(active: InvView, tab: InvView): ButtonStyle {
  return active === tab ? ButtonStyle.Success : ButtonStyle.Primary;
}

function navRow(
  invokerId: string,
  targetUserId: string,
  view: "items" | "rank",
  page: number,
  pageCount: number,
): ActionRowBuilder<ButtonBuilder> | null {
  if (pageCount <= 1) return null;
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(navCustomId(view, invokerId, targetUserId, safePage - 1))
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(navCustomId(view, invokerId, targetUserId, safePage))
      .setLabel(`${safePage + 1}/${pageCount}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(navCustomId(view, invokerId, targetUserId, safePage + 1))
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= pageCount - 1),
  );
}

function tabRow(
  invokerId: string,
  targetUserId: string,
  active: InvView,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId("home", invokerId, targetUserId, 0))
      .setLabel("Home")
      .setEmoji("🏠")
      .setStyle(tabStyle(active, "home")),
    new ButtonBuilder()
      .setCustomId(customId("items", invokerId, targetUserId, 0))
      .setLabel("Items")
      .setEmoji("👕")
      .setStyle(tabStyle(active, "items")),
    new ButtonBuilder()
      .setCustomId(customId("rank", invokerId, targetUserId, 0))
      .setLabel("Rankings")
      .setEmoji("🏆")
      .setStyle(tabStyle(active, "rank")),
  );
}

async function buildHomeEmbed(
  guildId: string,
  targetUserId: string,
  displayLabel: string,
  avatarUrl: string | null,
): Promise<EmbedBuilder> {
  const [page, weeklyRank] = await Promise.all([
    getUserInventoryPage(guildId, targetUserId, 1),
    getUserWeeklyRank(guildId, targetUserId),
  ]);

  const rankLine =
    weeklyRank != null && page.totalCount > 0
      ? `#${weeklyRank.toLocaleString("en-US")}`
      : "—";

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: `${displayLabel}'s Inventory`,
      iconURL: avatarUrl ?? undefined,
    })
    .setDescription(
      [
        `🏆 **Current Rank:** ${rankLine}`,
        `🧰 **Items Collected:** ${page.totalCount.toLocaleString("en-US")}`,
        `💵 **Inventory Worth:** ${formatFindUsd(page.totalValueCents)}`,
      ].join("\n"),
    );
}

async function buildItemsEmbed(
  guildId: string,
  targetUserId: string,
  displayLabel: string,
  avatarUrl: string | null,
  pageNum: number,
): Promise<{ embed: EmbedBuilder; page: number; pageCount: number }> {
  const page = await getUserInventoryPage(guildId, targetUserId, pageNum + 1);

  const lines =
    page.items.length === 0
      ? ["_No items yet — use `!find` to hunt for deals!_"]
      : page.items.map((row, i) => {
          const n = (page.page - 1) * 10 + i + 1;
          const name = truncateItemName(row.itemName, 52);
          return `${n}. ${name} (1x) - **${formatFindUsd(row.rolledPriceCents)}** 💵`;
        });

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: `${displayLabel}'s Items`,
      iconURL: avatarUrl ?? undefined,
    })
    .setDescription(
      ["👕 Check out your **latest finds** here", "", ...lines].join("\n"),
    );

  if (page.totalCount > 0) {
    embed.setFooter({
      text: `💳 Total Value: ${formatFindUsd(page.totalValueCents)} 💵`,
    });
  }

  return { embed, page: page.page - 1, pageCount: page.pageCount };
}

async function rankEmoji(guild: Guild, rank: number): Promise<string> {
  const id = NUMBER_EMOJI_IDS[rank];
  if (!id) return `**${rank}.**`;
  return resolveEmojiById(guild, id, `num${rank}`);
}

async function buildRankingsEmbed(
  guild: Guild,
  guildId: string,
  pageNum: number,
  client: Message["client"] | Interaction["client"],
): Promise<{ embed: EmbedBuilder; page: number; pageCount: number }> {
  await guild.emojis.fetch().catch(() => null);

  const [crown, info] = await Promise.all([
    resolveEmojiById(guild, CROWN_EMOJI_ID, CROWN_EMOJI_NAME),
    resolveEmojiById(guild, INFO_EMOJI_ID, INFO_EMOJI_NAME),
  ]);

  const rows = await getWeeklyValueList(guildId);
  const pageCount = Math.max(1, Math.ceil(rows.length / RANK_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, pageNum), pageCount - 1);
  const slice = rows.slice(
    safePage * RANK_PAGE_SIZE,
    safePage * RANK_PAGE_SIZE + RANK_PAGE_SIZE,
  );

  const collectorMention = config.collectorRoleId
    ? `<@&${config.collectorRoleId}>`
    : "**Collector**";

  const reset = formatResetCountdown(msUntilNextUtcWeek());
  const leader = rows[0];
  const winnerLine = ltrLine(
    `${crown} **Weekly Leader** — ${
      leader ? ltrIsolate(`<@${leader.userId}>`) : "_nobody yet_"
    }`,
  );

  const rankingLines =
    slice.length === 0
      ? ["_No finds logged this week yet._"]
      : await Promise.all(
          slice.map(async (row, i) => {
            const rank = safePage * RANK_PAGE_SIZE + i + 1;
            const emoji = await rankEmoji(guild, rank);
            const mention = ltrIsolate(`<@${row.userId}>`);
            return ltrLine(
              `${emoji} ${mention} — **${formatFindUsd(row.totalCents)}** 💵`,
            );
          }),
        );

  const botIcon = client.user?.displayAvatarURL({ size: 64 }) ?? undefined;
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: "Weekly Items Leaderboard",
      ...(botIcon ? { iconURL: botIcon } : {}),
    })
    .setDescription(
      [
        winnerLine,
        "",
        "__Rankings__",
        ...rankingLines,
        "",
        "**Next Reset**",
        `🔔 ${reset}`,
        "",
        `${info} The user with the **highest total** 💵 this week gets ${collectorMention} at **Monday 00:00 UTC**.`,
      ].join("\n"),
    )
    .setFooter({ text: "Updates live · Resets Monday 00:00 UTC" })
    .setTimestamp();

  return { embed, page: safePage, pageCount };
}

export async function buildInventoryPayload(
  message: Message<true>,
  invokerId: string,
  targetUserId: string,
  view: InvView = "home",
  page = 0,
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const displayLabel = displayName(message, targetUserId);
  const member = await message.guild.members
    .fetch(targetUserId)
    .catch(() => null);
  const avatarUrl =
    member?.displayAvatarURL({ size: 128 }) ??
    message.client.users.cache.get(targetUserId)?.displayAvatarURL({
      size: 128,
    }) ??
    null;

  const components: ActionRowBuilder<ButtonBuilder>[] = [
    tabRow(invokerId, targetUserId, view),
  ];

  if (view === "home") {
    const embed = await buildHomeEmbed(
      message.guildId,
      targetUserId,
      displayLabel,
      avatarUrl,
    );
    return { embeds: [embed], components };
  }

  if (view === "items") {
    const { embed, page: safePage, pageCount } = await buildItemsEmbed(
      message.guildId,
      targetUserId,
      displayLabel,
      avatarUrl,
      page,
    );
    const nav = navRow(invokerId, targetUserId, "items", safePage, pageCount);
    if (nav) components.push(nav);
    return { embeds: [embed], components };
  }

  const { embed, page: safePage, pageCount } = await buildRankingsEmbed(
    message.guild,
    message.guildId,
    page,
    message.client,
  );
  const nav = navRow(invokerId, targetUserId, "rank", safePage, pageCount);
  if (nav) components.push(nav);
  return { embeds: [embed], components };
}

async function buildInventoryPayloadFromInteraction(
  interaction: Interaction,
  invokerId: string,
  targetUserId: string,
  view: InvView,
  page: number,
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  if (!interaction.inGuild() || !interaction.guild) {
    throw new Error("Guild required");
  }

  const guild = interaction.guild;
  const member = await guild.members.fetch(targetUserId).catch(() => null);
  const displayLabel = member?.displayName ?? targetUserId;
  const avatarUrl =
    member?.displayAvatarURL({ size: 128 }) ??
    interaction.client.users.cache.get(targetUserId)?.displayAvatarURL({
      size: 128,
    }) ??
    null;

  const components: ActionRowBuilder<ButtonBuilder>[] = [
    tabRow(invokerId, targetUserId, view),
  ];

  if (view === "home") {
    const embed = await buildHomeEmbed(
      guild.id,
      targetUserId,
      displayLabel,
      avatarUrl,
    );
    return { embeds: [embed], components };
  }

  if (view === "items") {
    const { embed, page: safePage, pageCount } = await buildItemsEmbed(
      guild.id,
      targetUserId,
      displayLabel,
      avatarUrl,
      page,
    );
    const nav = navRow(invokerId, targetUserId, "items", safePage, pageCount);
    if (nav) components.push(nav);
    return { embeds: [embed], components };
  }

  const { embed, page: safePage, pageCount } = await buildRankingsEmbed(
    guild,
    guild.id,
    page,
    interaction.client,
  );
  const nav = navRow(invokerId, targetUserId, "rank", safePage, pageCount);
  if (nav) components.push(nav);
  return { embeds: [embed], components };
}

function parsePageArg(args: string[]): number {
  const raw = args[0];
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n) - 1;
}

export async function handleInventoryCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const target =
    message.mentions.users.first() ??
    (args[0] && /^\d{15,21}$/.test(args[0].replace(/[<@!>]/g, ""))
      ? { id: args[0].replace(/[<@!>]/g, "") }
      : null);

  const targetUserId = target?.id ?? message.author.id;
  const pageArg = target ? parsePageArg(args.slice(1)) : parsePageArg(args);
  const startView: InvView = pageArg > 0 ? "items" : "home";

  try {
    const payload = await buildInventoryPayload(
      message,
      message.author.id,
      targetUserId,
      startView,
      pageArg,
    );
    await message.reply({
      ...payload,
      allowedMentions: { users: [targetUserId] },
    });
  } catch (err) {
    console.error("[inventory]", err);
    await message.reply("Couldn't load inventory right now.");
  }
}

export async function onInventoryInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith(`${PREFIX}:`)) return false;

  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return false;

  if (interaction.user.id !== parsed.invokerId) {
    await interaction.reply({
      content: "Only the person who ran `!inv` can use these buttons.",
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferUpdate();

  try {
    const payload = await buildInventoryPayloadFromInteraction(
      interaction,
      parsed.invokerId,
      parsed.targetUserId,
      parsed.view,
      parsed.page,
    );
    const target = interaction.message;
    if (!target) {
      throw new Error("Missing component message");
    }
    await target.edit(payload);
  } catch (err) {
    console.error("[inventory] interaction", err);
    await interaction
      .followUp({
        content: "Couldn't update inventory right now.",
        ephemeral: true,
      })
      .catch(() => {});
  }

  return true;
}
