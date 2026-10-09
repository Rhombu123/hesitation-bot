import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type GuildMember,
  type Interaction,
  type Message,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { GAME_EMBED_COLOR } from "../config.js";
import { CRATE_RARITIES, REP_RARITIES } from "../config/creditRewards.js";
import {
  LOOT_CATEGORY_META,
  LOOT_COLOR_PAGES,
  LOOT_HOBBY,
  LOOT_PERSONALITY,
  LOOT_TITLES,
  type LootCategory,
  type LootRoleDef,
  findLootRole,
  lootRolesForCategory,
} from "../config/lootRoles.js";
import {
  LOOT_EXCLUSIVE_DROP_PERCENT,
  LOOT_RARE_DROP_PERCENT,
} from "../services/lootDrops.js";
import { findLootDiscordRole, ensureLootDiscordRole } from "../services/lootRoleSync.js";
import { getUnlockedLootIds } from "../services/lootUnlocks.js";
import { INFO_EMOJI_ID, resolveEmojiById } from "../utils/customEmojis.js";

const PREFIX = "loot";
const EQUIP_PREFIX = "loot:equip";

export type LootView =
  | "overview"
  | "personality"
  | "hobby"
  | "colors"
  | "titles"
  | "rewards";

type LootContext = {
  guildId: string;
  ownerId: string;
  unlocked: Set<string>;
  info: string;
  displayName: string;
};

function customId(
  kind: "go" | "nav",
  ownerId: string,
  view: LootView,
  page: number,
): string {
  return `${PREFIX}:${kind}:${ownerId}:${view}:${page}`;
}

function parseCustomId(
  id: string,
): { ownerId: string; view: LootView; page: number } | null {
  const parts = id.split(":");
  // loot:go|nav:ownerId:view:page
  if (parts[0] !== PREFIX || parts.length !== 5) return null;
  if (parts[1] !== "go" && parts[1] !== "nav") return null;
  const ownerId = parts[2]!;
  const view = parts[3] as LootView;
  const page = Number(parts[4]);
  if (!ownerId || Number.isNaN(page)) return null;
  const ok: LootView[] = [
    "overview",
    "personality",
    "hobby",
    "colors",
    "titles",
    "rewards",
  ];
  if (!ok.includes(view)) return null;
  return { ownerId, view, page };
}

function ownedNames(
  roles: readonly LootRoleDef[],
  unlocked: Set<string>,
): string {
  const names = roles.filter((r) => unlocked.has(r.id)).map((r) => r.name);
  return names.length > 0 ? names.join(", ") : "None equipped";
}

function countOwned(
  roles: readonly LootRoleDef[],
  unlocked: Set<string>,
): number {
  return roles.filter((r) => unlocked.has(r.id)).length;
}

function formatRoleLine(role: LootRoleDef, unlocked: Set<string>): string {
  const has = unlocked.has(role.id);
  const lock = has ? "✅" : "🔒";
  const status = has ? "**Owned**" : "(Locked)";
  return `${lock} ${role.swatch} **${role.name}** ${status}`;
}

function formatRoleList(
  roles: readonly LootRoleDef[],
  unlocked: Set<string>,
): string {
  return roles.map((r) => formatRoleLine(r, unlocked)).join("\n");
}

async function loadContext(
  member: GuildMember,
): Promise<LootContext> {
  const unlocked = await getUnlockedLootIds(member.guild.id, member.id);
  const info = await resolveEmojiById(
    member.guild,
    INFO_EMOJI_ID,
    "info",
  );
  return {
    guildId: member.guild.id,
    ownerId: member.id,
    unlocked,
    info,
    displayName: member.displayName,
  };
}

function buildOverviewEmbed(ctx: LootContext): EmbedBuilder {
  const personalityOwned = ownedNames(LOOT_PERSONALITY, ctx.unlocked);
  const hobbyOwned = ownedNames(LOOT_HOBBY, ctx.unlocked);
  const colorOwned = ownedNames(
    lootRolesForCategory("color"),
    ctx.unlocked,
  );
  const titleOwned = ownedNames(LOOT_TITLES, ctx.unlocked);

  const cats = (["personality", "hobby", "color", "title"] as const)
    .map((cat) => {
      const meta = LOOT_CATEGORY_META[cat];
      const n = countOwned(lootRolesForCategory(cat), ctx.unlocked);
      return `${meta.emoji} **${meta.label}** — **${n}** unlocked`;
    })
    .join("\n");

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setTitle("Hesitation Loot Overview")
    .setDescription(
      [
        `${ctx.info} Browse ultra-rare roles you can earn from games.`,
        "",
        "📌 **Current Setup:**",
        `**Personality:** ${personalityOwned}`,
        `**Hobby:** ${hobbyOwned}`,
        `**Color:** ${colorOwned}`,
        `**Title:** ${titleOwned}`,
        "",
        "📖 **Categories:**",
        cats,
      ].join("\n"),
    );
}

function buildCategoryEmbed(
  ctx: LootContext,
  category: Exclude<LootCategory, "color">,
): EmbedBuilder {
  const meta = LOOT_CATEGORY_META[category];
  const roles = lootRolesForCategory(category);
  const owned = countOwned(roles, ctx.unlocked);
  const rarityNote =
    category === "title"
      ? "_Exclusive titles are extremely rare — far rarer than other loot._"
      : "_These roles are rare game drops (much rarer than rep / points / credits)._";

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setTitle(`Hesitation ${meta.short}`)
    .setDescription(
      [
        `${ctx.info} You own **${owned}** / **${roles.length}** ${meta.label.toLowerCase()}.`,
        "",
        `${meta.emoji} **${meta.label}**`,
        formatRoleList(roles, ctx.unlocked),
        "",
        rarityNote,
      ].join("\n"),
    );
}

function buildColorsEmbed(ctx: LootContext, page: number): EmbedBuilder {
  const pages = LOOT_COLOR_PAGES;
  const idx = ((page % pages.length) + pages.length) % pages.length;
  const slice = pages[idx]!;
  const allColors = lootRolesForCategory("color");
  const ownedTotal = countOwned(allColors, ctx.unlocked);
  const titleKind = slice.kind === "gradient" ? "Gradient" : "Solid";

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setTitle(
      `Hesitation ${titleKind} Colors (Page ${idx + 1}/${pages.length})`,
    )
    .setDescription(
      [
        `${ctx.info} You own **${ownedTotal}** colors total.`,
        "",
        `🌈 **${titleKind} Colors**`,
        formatRoleList(slice.roles, ctx.unlocked),
        "",
        "_Color roles are rare game drops (much rarer than rep / points / credits)._",
      ].join("\n"),
    );
}

function buildRewardsEmbed(ctx: LootContext): EmbedBuilder {
  const totalWeight = CRATE_RARITIES.reduce((s, r) => s + r.weight, 0);
  const rarityLines = CRATE_RARITIES.map((c) => {
    const rep = REP_RARITIES.find((r) => r.id === c.id)!;
    const pct = Math.round((c.weight / totalWeight) * 100);
    return (
      `**${c.label}** — **${pct}%**\n` +
      `Credits: **${c.minCredits}–${c.maxCredits}** · Rep: **${rep.minRep}–${rep.maxRep}**`
    );
  });

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setTitle("Hesitation Loot Rewards")
    .setDescription(
      [
        `${ctx.info} Reward rarities`,
        "",
        "📦 **Crate / Light / Dice**",
        rarityLines.join("\n\n"),
        "",
        `🍃 **Rare loot** — **${LOOT_RARE_DROP_PERCENT}%**`,
        `👑 **Exclusive** — **${LOOT_EXCLUSIVE_DROP_PERCENT}%**`,
      ].join("\n"),
    );
}

function pageCount(view: LootView): number {
  if (view === "colors") return LOOT_COLOR_PAGES.length;
  return 1;
}

function normalizePage(view: LootView, page: number): number {
  const n = pageCount(view);
  return ((page % n) + n) % n;
}

function navRow(
  ownerId: string,
  view: LootView,
  page: number,
): ActionRowBuilder<ButtonBuilder> | null {
  const total = pageCount(view);
  if (total <= 1) return null;

  const p = normalizePage(view, page);
  const label =
    view === "colors"
      ? `${LOOT_COLOR_PAGES[p]!.label} (${p + 1}/${total})`
      : `${p + 1}/${total}`;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId("nav", ownerId, view, p - 1))
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(customId("nav", ownerId, view, p))
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(customId("nav", ownerId, view, p + 1))
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary),
  );
}

function categoryStyle(
  active: LootView,
  view: LootView,
): ButtonStyle {
  return active === view ? ButtonStyle.Success : ButtonStyle.Primary;
}

function categoryRows(
  ownerId: string,
  active: LootView,
): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId("go", ownerId, "personality", 0))
      .setLabel("Personality")
      .setEmoji("🍃")
      .setStyle(categoryStyle(active, "personality")),
    new ButtonBuilder()
      .setCustomId(customId("go", ownerId, "hobby", 0))
      .setLabel("Hobby")
      .setEmoji("🎮")
      .setStyle(categoryStyle(active, "hobby")),
    new ButtonBuilder()
      .setCustomId(customId("go", ownerId, "colors", 0))
      .setLabel("Colors")
      .setEmoji("🌈")
      .setStyle(categoryStyle(active, "colors")),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId("go", ownerId, "titles", 0))
      .setLabel("Titles")
      .setEmoji("👑")
      .setStyle(categoryStyle(active, "titles")),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId("go", ownerId, "overview", 0))
      .setLabel("Overview")
      .setEmoji("🌐")
      .setStyle(
        active === "overview" ? ButtonStyle.Success : ButtonStyle.Secondary,
      ),
    new ButtonBuilder()
      .setCustomId(customId("go", ownerId, "rewards", 0))
      .setLabel("Rewards")
      .setEmoji("🎁")
      .setStyle(
        active === "rewards" ? ButtonStyle.Success : ButtonStyle.Primary,
      ),
  );

  return [row1, row2, row3];
}

function buildEmbed(
  ctx: LootContext,
  view: LootView,
  page: number,
): EmbedBuilder {
  switch (view) {
    case "overview":
      return buildOverviewEmbed(ctx);
    case "personality":
      return buildCategoryEmbed(ctx, "personality");
    case "hobby":
      return buildCategoryEmbed(ctx, "hobby");
    case "colors":
      return buildColorsEmbed(ctx, page);
    case "titles":
      return buildCategoryEmbed(ctx, "title");
    case "rewards":
      return buildRewardsEmbed(ctx);
  }
}

function rolesForEquipView(
  view: LootView,
  page: number,
): readonly LootRoleDef[] {
  switch (view) {
    case "personality":
      return LOOT_PERSONALITY;
    case "hobby":
      return LOOT_HOBBY;
    case "titles":
      return LOOT_TITLES;
    case "colors": {
      const pages = LOOT_COLOR_PAGES;
      const idx = ((page % pages.length) + pages.length) % pages.length;
      return pages[idx]!.roles;
    }
    default:
      return [];
  }
}

function equipSelectRow(
  member: GuildMember,
  ownerId: string,
  view: LootView,
  page: number,
  unlocked: Set<string>,
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const roles = rolesForEquipView(view, page);
  if (roles.length === 0) return null;

  const owned = roles.filter((r) => unlocked.has(r.id));
  if (owned.length === 0) {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${EQUIP_PREFIX}:${ownerId}:${view}:${page}`)
        .setPlaceholder("No unlocked roles on this page yet…")
        .setDisabled(true)
        .addOptions({
          label: "Nothing to equip",
          value: "none",
          description: "Win games to unlock loot roles",
        }),
    );
  }

  const options = owned.slice(0, 25).map((def) => {
    const discordRole = findLootDiscordRole(member.guild, def);
    const equipped = discordRole
      ? member.roles.cache.has(discordRole.id)
      : false;
    return {
      label: def.name.slice(0, 100),
      value: def.id,
      emoji: def.swatch,
      description: equipped
        ? "Equipped — select to unequip"
        : "Select to equip",
    };
  });

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${EQUIP_PREFIX}:${ownerId}:${view}:${page}`)
      .setPlaceholder("Select A Role To Equip or Unequip...")
      .addOptions(options),
  );
}

export async function buildLootPayload(
  member: GuildMember,
  view: LootView = "overview",
  page = 0,
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}> {
  await member.guild.roles.fetch().catch(() => null);
  const ctx = await loadContext(member);
  const p = normalizePage(view, page);
  const embed = buildEmbed(ctx, view, p);
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  const equip = equipSelectRow(member, ctx.ownerId, view, p, ctx.unlocked);
  if (equip) components.push(equip);

  const nav = navRow(ctx.ownerId, view, p);
  if (nav) components.push(nav);
  components.push(...categoryRows(ctx.ownerId, view));
  return { embeds: [embed], components };
}

/** `!loot` — browse ultra-rare earnable roles. */
export async function handleLootCommand(
  message: Message<true>,
): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    await message.reply("Could not load your member profile. Try again.");
    return;
  }

  const payload = await buildLootPayload(member, "overview", 0);
  await message.reply(payload);
}

function parseEquipCustomId(
  id: string,
): { ownerId: string; view: LootView; page: number } | null {
  const parts = id.split(":");
  // loot:equip:ownerId:view:page
  if (parts[0] !== PREFIX || parts[1] !== "equip" || parts.length !== 5) {
    return null;
  }
  const ownerId = parts[2]!;
  const view = parts[3] as LootView;
  const page = Number(parts[4]);
  if (!ownerId || Number.isNaN(page)) return null;
  const ok: LootView[] = [
    "overview",
    "personality",
    "hobby",
    "colors",
    "titles",
    "rewards",
  ];
  if (!ok.includes(view)) return null;
  return { ownerId, view, page };
}

async function toggleLootEquip(
  member: GuildMember,
  lootId: string,
): Promise<string> {
  const def = findLootRole(lootId);
  if (!def) return "That loot role isn't in the catalog.";

  const unlocked = await getUnlockedLootIds(member.guild.id, member.id);
  if (!unlocked.has(def.id)) {
    return `You haven't unlocked **${def.name}** yet.`;
  }

  await member.guild.roles.fetch().catch(() => null);
  const role = await ensureLootDiscordRole(member.guild, def);

  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, "Loot unequip via !loot");
    return `Unequipped ${def.swatch} **${def.name}**.`;
  }

  await member.roles.add(role, "Loot equip via !loot");
  return `Equipped ${def.swatch} **${def.name}**.`;
}

/** Button + select navigation for `!loot` embeds. */
export async function onLootInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  if (
    !interaction.isButton() &&
    !interaction.isStringSelectMenu()
  ) {
    return false;
  }
  if (!interaction.customId.startsWith(`${PREFIX}:`)) return false;

  if (interaction.isStringSelectMenu()) {
    const parsed = parseEquipCustomId(interaction.customId);
    if (!parsed) return false;

    if (interaction.user.id !== parsed.ownerId) {
      await interaction.reply({
        content: "Only the person who ran `!loot` can use this menu.",
        ephemeral: true,
      });
      return true;
    }

    const lootId = interaction.values[0];
    if (!lootId || lootId === "none") {
      await interaction.deferUpdate();
      return true;
    }

    await interaction.deferUpdate();

    const member = await interaction.guild!.members
      .fetch(parsed.ownerId)
      .catch(() => null);
    if (!member) {
      await interaction.followUp({
        content: "Could not load your member profile.",
        ephemeral: true,
      });
      return true;
    }

    let notice: string;
    try {
      notice = await toggleLootEquip(member, lootId);
    } catch (err) {
      console.error("[loot] equip failed:", err);
      notice =
        "Couldn't update that role — make sure my bot role is above the loot roles.";
    }

    const refreshed = await member.guild.members
      .fetch(member.id)
      .catch(() => member);
    const payload = await buildLootPayload(
      refreshed,
      parsed.view,
      parsed.page,
    );
    await interaction.editReply(payload);
    await interaction.followUp({ content: notice, ephemeral: true });
    return true;
  }

  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return false;

  if (interaction.user.id !== parsed.ownerId) {
    await interaction.reply({
      content: "Only the person who ran `!loot` can use these buttons.",
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferUpdate();

  const member = await interaction.guild!.members
    .fetch(parsed.ownerId)
    .catch(() => null);
  if (!member) {
    await interaction.followUp({
      content: "Could not load your member profile.",
      ephemeral: true,
    });
    return true;
  }

  const payload = await buildLootPayload(
    member,
    parsed.view,
    parsed.page,
  );
  await interaction.editReply(payload);
  return true;
}
