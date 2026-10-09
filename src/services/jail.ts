/**
 * Jail votes, timeouts, bail, escapes, and immunity.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type Guild,
  type GuildMember,
  type Interaction,
  type Message,
  type TextChannel,
} from "discord.js";
import { config } from "../config.js";
import {
  hasCollector,
  hasElite,
  hasGenius,
  hasMythic,
  hasPopular,
  hasSupreme,
  hasVip,
  ROLE_IDS,
} from "../config/rolePrivileges.js";
import { newId, supabase } from "../db/supabase.js";
import {
  InsufficientCreditsError,
  spendCredits,
} from "./credits.js";
import { formatWaitDuration, msUntilNextUtcMidnight } from "./reputation.js";
import { utcDateString, utcWeekId, msUntilNextUtcWeek } from "../utils/helpers.js";

export const JAIL_EMBED_RED = 0xed4245;
export const JAIL_EMBED_GREEN = 0x57f287;
export const JAIL_VOTE_MS = 60_000;
export const JAIL_DURATION_MS = 10 * 60_000;
export const JAIL_COOLDOWN_MS = 5 * 60_000;
export const DAILY_JAIL_LIMIT = 5;
export const DAILY_BAIL_LIMIT = 3;
export const BAIL_COST = 1_000;

function formatJailDuration(): string {
  const mins = JAIL_DURATION_MS / 60_000;
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

const WEEKLY_IMMUNITY_MS = 7 * 24 * 60 * 60_000;
const MONTHLY_IMMUNITY_MS = 30 * 24 * 60 * 60_000;

type JailVote = {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  targetId: string;
  starterId: string;
  yes: Set<string>;
  no: Set<string>;
  endsAt: number;
  ended: boolean;
  timeout: ReturnType<typeof setTimeout>;
  client: Client;
};

const activeVotes = new Map<string, JailVote>();

export function canStartJail(member: GuildMember): boolean {
  return hasMythic(member);
}

export function getJailEscapeLimit(member: GuildMember): number {
  if (hasMythic(member)) return 5;
  if (hasSupreme(member)) return 4;
  if (hasElite(member)) return 3;
  if (hasGenius(member) || hasPopular(member) || hasCollector(member)) return 3;
  if (hasVip(member)) return 2;
  return 1;
}

function purchaseUrl(guildId: string): string {
  if (config.donationPurchaseUrl) return config.donationPurchaseUrl;
  return `https://discord.com/channels/${guildId}/${config.donationChannelId}`;
}

function roleMention(guild: Guild, roleId: string, fallback: string): string {
  const role = roleId ? guild.roles.cache.get(roleId) : undefined;
  return role ? `<@&${role.id}>` : `**${fallback}**`;
}

export function buildJailDeniedEmbed(guild: Guild): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setColor(JAIL_EMBED_RED)
    .setAuthor({ name: "Donor Role Required" })
    .setDescription(
      [
        "🚫 You need",
        roleMention(guild, ROLE_IDS.mythic, "Mythic"),
        "to use `!jail`",
      ].join(" "),
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Store")
      .setStyle(ButtonStyle.Link)
      .setURL(purchaseUrl(guild.id)),
  );

  return { embed, components: [row] };
}

// ── DB helpers ─────────────────────────────────────────────────────────────

async function getDailyUsage(
  guildId: string,
  userId: string,
): Promise<{ jailsStarted: number; bailsUsed: number; lastJailAt: Date | null }> {
  const date = utcDateString();
  const { data, error } = await supabase
    .from("JailDailyUsage")
    .select("jailsStarted, bailsUsed, lastJailAt")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error(`[jail:getDailyUsage] ${error.message}`);
  return {
    jailsStarted: (data?.jailsStarted as number | undefined) ?? 0,
    bailsUsed: (data?.bailsUsed as number | undefined) ?? 0,
    lastJailAt: data?.lastJailAt
      ? new Date(data.lastJailAt as string)
      : null,
  };
}

export function getJailCooldownRemainingMs(lastJailAt: Date | null): number {
  if (!lastJailAt) return 0;
  const remaining = lastJailAt.getTime() + JAIL_COOLDOWN_MS - Date.now();
  return Math.max(0, remaining);
}

async function incrementDailyJails(
  guildId: string,
  userId: string,
): Promise<number> {
  const date = utcDateString();
  const usage = await getDailyUsage(guildId, userId);
  const next = usage.jailsStarted + 1;
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("JailDailyUsage")
    .select("id")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("date", date)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("JailDailyUsage")
      .update({ jailsStarted: next, lastJailAt: now })
      .eq("id", existing.id as string);
  } else {
    await supabase.from("JailDailyUsage").insert({
      id: newId(),
      guildId,
      userId,
      date,
      jailsStarted: next,
      bailsUsed: 0,
      lastJailAt: now,
    });
  }
  return next;
}

async function incrementDailyBails(
  guildId: string,
  userId: string,
): Promise<number> {
  const date = utcDateString();
  const usage = await getDailyUsage(guildId, userId);
  const next = usage.bailsUsed + 1;
  const { data: existing } = await supabase
    .from("JailDailyUsage")
    .select("id")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("date", date)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("JailDailyUsage")
      .update({ bailsUsed: next })
      .eq("id", existing.id as string);
  } else {
    await supabase.from("JailDailyUsage").insert({
      id: newId(),
      guildId,
      userId,
      date,
      jailsStarted: 0,
      bailsUsed: next,
    });
  }
  return next;
}

async function getEscapesUsed(
  guildId: string,
  userId: string,
): Promise<number> {
  const weekId = utcWeekId();
  const { data, error } = await supabase
    .from("JailEscapeWeekly")
    .select("escapesUsed")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("weekId", weekId)
    .maybeSingle();
  if (error) throw new Error(`[jail:getEscapesUsed] ${error.message}`);
  return (data?.escapesUsed as number | undefined) ?? 0;
}

async function incrementEscapesUsed(
  guildId: string,
  userId: string,
): Promise<number> {
  const weekId = utcWeekId();
  const { data: existing } = await supabase
    .from("JailEscapeWeekly")
    .select("id, escapesUsed")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("weekId", weekId)
    .maybeSingle();

  const next = ((existing?.escapesUsed as number | undefined) ?? 0) + 1;
  if (existing?.id) {
    await supabase
      .from("JailEscapeWeekly")
      .update({ escapesUsed: next })
      .eq("id", existing.id as string);
  } else {
    await supabase.from("JailEscapeWeekly").insert({
      id: newId(),
      guildId,
      userId,
      weekId,
      escapesUsed: next,
    });
  }
  return next;
}

export type ImmunityRow = {
  weeklyTokens: number;
  monthlyTokens: number;
  activeUntil: Date | null;
};

export async function getImmunity(
  guildId: string,
  userId: string,
): Promise<ImmunityRow> {
  const { data, error } = await supabase
    .from("JailImmunity")
    .select("weeklyTokens, monthlyTokens, activeUntil")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .maybeSingle();
  if (error) throw new Error(`[jail:getImmunity] ${error.message}`);
  if (!data) {
    return { weeklyTokens: 0, monthlyTokens: 0, activeUntil: null };
  }
  return {
    weeklyTokens: (data.weeklyTokens as number) ?? 0,
    monthlyTokens: (data.monthlyTokens as number) ?? 0,
    activeUntil: data.activeUntil
      ? new Date(data.activeUntil as string)
      : null,
  };
}

async function upsertImmunity(
  guildId: string,
  userId: string,
  patch: Partial<ImmunityRow>,
): Promise<ImmunityRow> {
  const current = await getImmunity(guildId, userId);
  const next: ImmunityRow = {
    weeklyTokens: patch.weeklyTokens ?? current.weeklyTokens,
    monthlyTokens: patch.monthlyTokens ?? current.monthlyTokens,
    activeUntil:
      patch.activeUntil !== undefined ? patch.activeUntil : current.activeUntil,
  };

  const { data: existing } = await supabase
    .from("JailImmunity")
    .select("id")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .maybeSingle();

  const row = {
    weeklyTokens: next.weeklyTokens,
    monthlyTokens: next.monthlyTokens,
    activeUntil: next.activeUntil?.toISOString() ?? null,
  };

  if (existing?.id) {
    await supabase.from("JailImmunity").update(row).eq("id", existing.id as string);
  } else {
    await supabase.from("JailImmunity").insert({
      id: newId(),
      guildId,
      userId,
      ...row,
    });
  }
  return next;
}

export async function hasActiveImmunity(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const row = await getImmunity(guildId, userId);
  return row.activeUntil != null && row.activeUntil.getTime() > Date.now();
}

export async function listActiveJails(
  guildId: string,
): Promise<
  Array<{ userId: string; expiresAt: Date; startedByUserId: string }>
> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("JailRecord")
    .select("userId, expiresAt, startedByUserId")
    .eq("guildId", guildId)
    .gt("expiresAt", now);
  if (error) throw new Error(`[jail:listActiveJails] ${error.message}`);
  return (data ?? []).map((r) => ({
    userId: r.userId as string,
    expiresAt: new Date(r.expiresAt as string),
    startedByUserId: r.startedByUserId as string,
  }));
}

async function insertJailRecord(opts: {
  guildId: string;
  userId: string;
  startedByUserId: string;
  expiresAt: Date;
}): Promise<void> {
  await supabase.from("JailRecord").insert({
    id: newId(),
    guildId: opts.guildId,
    userId: opts.userId,
    startedByUserId: opts.startedByUserId,
    expiresAt: opts.expiresAt.toISOString(),
  });
}

async function deleteJailRecord(guildId: string, userId: string): Promise<void> {
  await supabase
    .from("JailRecord")
    .delete()
    .eq("guildId", guildId)
    .eq("userId", userId);
}

export async function isUserJailed(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("JailRecord")
    .select("id")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .gt("expiresAt", now)
    .maybeSingle();
  if (error) throw new Error(`[jail:isUserJailed] ${error.message}`);
  return !!data;
}

// ── Embeds ───────────────────────────────────────────────────────────────────

export function buildJailOverviewEmbed(
  jailsUsed: number,
): EmbedBuilder {
  const remaining = Math.max(0, DAILY_JAIL_LIMIT - jailsUsed);
  return new EmbedBuilder()
    .setColor(JAIL_EMBED_RED)
    .setAuthor({ name: "Jail Overview" })
    .setDescription(
      [
        "ℹ️ You can **start a vote** to **jail** a user from **voice/chat**",
        "",
        `🗑️ **Jails Remaining:** ${remaining}/${DAILY_JAIL_LIMIT}`,
        `📅 **Duration:** ${formatJailDuration()}`,
        `⏳ **Cooldown:** 5 minutes between jail votes`,
        "",
        "Usage: `!jail @user`",
      ].join("\n"),
    );
}

export function buildJailCommandsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(JAIL_EMBED_RED)
    .setAuthor({ name: "List Of Jail Commands" })
    .setDescription(
      [
        "🗑️ ***Jail Commands***",
        "",
        "• `!jail @user` to **start** a jail vote",
        "• `!jail list` to **view** currently jailed members",
        "• `!bail @user` to **release** someone from a successful jail vote",
        "• `!immunity` to **equip** or gift Jail Immunity",
      ].join("\n"),
    );
}

export async function buildImmunityStatusEmbed(
  guildId: string,
  userId: string,
): Promise<EmbedBuilder> {
  const row = await getImmunity(guildId, userId);
  const active =
    row.activeUntil != null && row.activeUntil.getTime() > Date.now();
  const status = active ? "🟢 **Active**" : "🔴 **Inactive**";

  return new EmbedBuilder()
    .setColor(JAIL_EMBED_RED)
    .setAuthor({ name: "Jail Immunity" })
    .setDescription(
      [
        `ℹ️ **Immunity Status:** ${status}`,
        "",
        "❔ ***Inventory***",
        `🛡️ **Jail Immunity (Weekly):** \`${row.weeklyTokens}\``,
        "",
        "_Weekly tokens reset with **Genius**, **Popular**, and **Collector** crowns._",
        "",
        "To gift a token: `!immunity gift @user weekly`",
        "To equip: `!immunity weekly`",
      ].join("\n"),
    );
}

/**
 * Reset weekly immunity tokens on crown rollover — same schedule as Genius /
 * Popular / Collector. Each weekly winner gets 1 token; former holders lose theirs.
 */
export async function syncWeeklyImmunityTokens(
  guildId: string,
  opts: {
    geniusWinner: string | null;
    popularWinner: string | null;
    collectorWinner: string | null;
    previousGenius: string | null;
    previousPopular: string | null;
    previousCollector: string | null;
  },
): Promise<void> {
  const winners = new Set(
    [opts.geniusWinner, opts.popularWinner, opts.collectorWinner].filter(
      (id): id is string => !!id,
    ),
  );

  for (const prevId of [
    opts.previousGenius,
    opts.previousPopular,
    opts.previousCollector,
  ]) {
    if (!prevId || winners.has(prevId)) continue;
    const row = await getImmunity(guildId, prevId);
    if (row.weeklyTokens > 0 || row.activeUntil) {
      await upsertImmunity(guildId, prevId, {
        weeklyTokens: 0,
        activeUntil: null,
      });
    }
  }

  for (const winnerId of winners) {
    await upsertImmunity(guildId, winnerId, { weeklyTokens: 1 });
  }
}

function voteEmbed(
  target: GuildMember,
  starter: GuildMember,
  yes: number,
  no: number,
  endsAtUnix: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(JAIL_EMBED_RED)
    .setAuthor({ name: "ATTENTION" })
    .setDescription(
      [
        `🗑️ A vote to **jail** ${target} for **${formatJailDuration()}** was started by ${starter}`,
        "",
        "📕 **Status**",
        `✅ Yes: **${yes}**   ❌ No: **${no}**`,
        "",
        `⏳ **Ends** <t:${endsAtUnix}:R>`,
        "",
        "📮 Vote below to decide their fate",
      ].join("\n"),
    );
}

function voteButtons(voteId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`jail:vote:yes:${voteId}`)
      .setLabel("Yes")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`jail:vote:no:${voteId}`)
      .setLabel("No")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

function jailSuccessEmbed(
  target: GuildMember,
  yes: number,
  no: number,
  guildId: string,
  userId: string,
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(JAIL_EMBED_GREEN)
    .setAuthor({ name: "Vote Successful" })
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setDescription(
      [
        `🗑️ ${target} was **jailed for ${formatJailDuration()}**`,
        "",
        "📕 ***Final Vote***",
        `✅ Yes: **${yes}**   ❌ No: **${no}**`,
        "",
        "Use `!bail @user` to release a user from jail",
      ].join("\n"),
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`jail:bail:${guildId}:${userId}`)
      .setLabel("Bail Them Out")
      .setEmoji("🏛️")
      .setStyle(ButtonStyle.Success),
  );

  return { embed, components: [row] };
}

function bailSuccessEmbed(
  target: GuildMember,
  bailer: GuildMember,
  bailsUsed: number,
): EmbedBuilder {
  const remaining = Math.max(0, DAILY_BAIL_LIMIT - bailsUsed);
  const reset = formatWaitDuration(msUntilNextUtcMidnight());
  return new EmbedBuilder()
    .setColor(JAIL_EMBED_GREEN)
    .setAuthor({ name: "Bail Successful" })
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setDescription(
      [
        `✅ ${target} was **bailed out of jail** by ${bailer}`,
        "",
        `🏛️ **Bails Remaining:** ${remaining}/${DAILY_BAIL_LIMIT}`,
        `📅 **Resets** in ${reset}`,
      ].join("\n"),
    );
}

export async function buildJailedDmEmbed(
  member: GuildMember,
): Promise<{ embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const used = await getEscapesUsed(member.guild.id, member.id);
  const limit = getJailEscapeLimit(member);
  const remaining = Math.max(0, limit - used);
  const reset = formatWaitDuration(msUntilNextUtcWeek());

  const embed = new EmbedBuilder()
    .setColor(JAIL_EMBED_RED)
    .setAuthor({ name: "You have been jailed!" })
    .setDescription(
      [
        `🗑️ You have been **jailed** for **${formatJailDuration()}**`,
        "",
        `🔓 **Jail Escapes Remaining:** ${remaining}/${limit}`,
        `📅 Resets in ${reset}`,
        "",
        "🖱️ **Click** on the button below to **bail yourself** out!",
      ].join("\n"),
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`jail:escape:${member.guild.id}`)
      .setLabel("Escape Jail")
      .setEmoji("🏛️")
      .setStyle(ButtonStyle.Success)
      .setDisabled(remaining <= 0),
  );

  return { embed, components: [row] };
}

// ── Jail / release ───────────────────────────────────────────────────────────

async function applyJail(
  target: GuildMember,
  startedByUserId: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + JAIL_DURATION_MS);
  const me = target.guild.members.me;
  if (!me?.permissions.has("ModerateMembers")) {
    throw new Error("MISSING_MOD_PERMS");
  }
  await target.timeout(JAIL_DURATION_MS, "Jailed by community vote");
  await insertJailRecord({
    guildId: target.guild.id,
    userId: target.id,
    startedByUserId,
    expiresAt,
  });

  try {
    const dm = await target.createDM();
    const { embed, components } = await buildJailedDmEmbed(target);
    await dm.send({ embeds: [embed], components });
  } catch {
    // DMs closed
  }
}

export async function releaseFromJail(
  target: GuildMember,
  reason: string,
): Promise<void> {
  const me = target.guild.members.me;
  if (me?.permissions.has("ModerateMembers")) {
    await target.timeout(null, reason).catch(() => null);
  }
  await deleteJailRecord(target.guild.id, target.id);
}

async function finishVote(vote: JailVote): Promise<void> {
  if (vote.ended) return;
  vote.ended = true;
  clearTimeout(vote.timeout);
  activeVotes.delete(vote.id);

  const channel = await vote.client.channels
    .fetch(vote.channelId)
    .catch(() => null);
  if (!channel?.isTextBased() || !("messages" in channel)) return;

  const message = await channel.messages.fetch(vote.messageId).catch(() => null);
  const guild = await vote.client.guilds.fetch(vote.guildId).catch(() => null);
  if (!guild || !message) return;

  const yes = vote.yes.size;
  const no = vote.no.size;

  if (yes <= no) {
    const embed = new EmbedBuilder()
      .setColor(JAIL_EMBED_RED)
      .setAuthor({ name: "ATTENTION" })
      .setDescription(
        [
          `🗑️ Jail vote for <@${vote.targetId}> **failed** (${yes} yes / ${no} no).`,
          "",
          "📕 ***Final Vote***",
          `✅ Yes: **${yes}**   ❌ No: **${no}**`,
        ].join("\n"),
      );

    await message.edit({
      embeds: [embed],
      components: [voteButtons(vote.id, true)],
    });
    return;
  }

  const target = await guild.members.fetch(vote.targetId).catch(() => null);
  if (!target) {
    await message.edit({
      content: "Jail vote passed but the member left the server.",
      embeds: [],
      components: [],
    });
    return;
  }

  try {
    await applyJail(target, vote.starterId);
  } catch (err) {
    const msg =
      err instanceof Error && err.message === "MISSING_MOD_PERMS"
        ? "I need **Moderate Members** to jail users."
        : "Could not jail that member.";
    await message.edit({ content: msg, embeds: [], components: [] });
    return;
  }

  const { embed, components } = jailSuccessEmbed(
    target,
    yes,
    no,
    guild.id,
    target.id,
  );
  await message.edit({ embeds: [embed], components });
}

export async function startJailVote(
  channel: TextChannel,
  starter: GuildMember,
  target: GuildMember,
): Promise<Message> {
  const voteId = newId();
  const endsAt = Date.now() + JAIL_VOTE_MS;
  const endsAtUnix = Math.floor(endsAt / 1000);

  const sent = await channel.send({
    embeds: [voteEmbed(target, starter, 0, 0, endsAtUnix)],
    components: [voteButtons(voteId)],
    allowedMentions: { users: [target.id, starter.id] },
  });

  const vote: JailVote = {
    id: voteId,
    guildId: channel.guildId,
    channelId: channel.id,
    messageId: sent.id,
    targetId: target.id,
    starterId: starter.id,
    yes: new Set(),
    no: new Set(),
    endsAt,
    ended: false,
    client: channel.client,
    timeout: setTimeout(() => {
      void finishVote(vote).catch((err) =>
        console.error("[jail] finishVote failed:", err),
      );
    }, JAIL_VOTE_MS),
  };
  activeVotes.set(voteId, vote);
  await incrementDailyJails(channel.guildId, starter.id);
  return sent;
}

async function refreshVoteMessage(vote: JailVote): Promise<void> {
  const channel = await vote.client.channels
    .fetch(vote.channelId)
    .catch(() => null);
  if (!channel?.isTextBased() || !("messages" in channel)) return;
  const guild = await vote.client.guilds.fetch(vote.guildId).catch(() => null);
  if (!guild) return;

  const [message, target, starter] = await Promise.all([
    channel.messages.fetch(vote.messageId).catch(() => null),
    guild.members.fetch(vote.targetId).catch(() => null),
    guild.members.fetch(vote.starterId).catch(() => null),
  ]);
  if (!message || !target || !starter) return;

  await message.edit({
    embeds: [
      voteEmbed(
        target,
        starter,
        vote.yes.size,
        vote.no.size,
        Math.floor(vote.endsAt / 1000),
      ),
    ],
    components: [voteButtons(vote.id)],
  });
}

export async function performBail(
  bailer: GuildMember,
  target: GuildMember,
): Promise<{ bailsUsed: number }> {
  const jailed = await isUserJailed(target.guild.id, target.id);
  if (!jailed) {
    throw new Error("NOT_JAILED");
  }

  const usage = await getDailyUsage(bailer.guild.id, bailer.id);
  if (usage.bailsUsed >= DAILY_BAIL_LIMIT) {
    throw new Error("BAIL_LIMIT");
  }

  await spendCredits(bailer.guild.id, bailer.id, BAIL_COST);
  await releaseFromJail(target, `Bailed out by ${bailer.user.tag}`);
  const bailsUsed = await incrementDailyBails(bailer.guild.id, bailer.id);
  return { bailsUsed };
}

export async function performEscape(member: GuildMember): Promise<void> {
  const jailed = await isUserJailed(member.guild.id, member.id);
  if (!jailed) throw new Error("NOT_JAILED");

  const limit = getJailEscapeLimit(member);
  const used = await getEscapesUsed(member.guild.id, member.id);
  if (used >= limit) throw new Error("NO_ESCAPES");

  await incrementEscapesUsed(member.guild.id, member.id);
  await releaseFromJail(member, "Self escape from jail");
}

export async function equipImmunity(
  member: GuildMember,
  kind: "weekly" | "monthly",
): Promise<void> {
  const row = await getImmunity(member.guild.id, member.id);
  if (kind === "weekly") {
    if (row.weeklyTokens <= 0) throw new Error("NO_TOKEN");
    await upsertImmunity(member.guild.id, member.id, {
      weeklyTokens: row.weeklyTokens - 1,
      activeUntil: new Date(Date.now() + WEEKLY_IMMUNITY_MS),
    });
    return;
  }
  if (row.monthlyTokens <= 0) throw new Error("NO_TOKEN");
  await upsertImmunity(member.guild.id, member.id, {
    monthlyTokens: row.monthlyTokens - 1,
    activeUntil: new Date(Date.now() + MONTHLY_IMMUNITY_MS),
  });
}

export async function giftImmunity(
  from: GuildMember,
  to: GuildMember,
  kind: "weekly" | "monthly",
): Promise<void> {
  const row = await getImmunity(from.guild.id, from.id);
  if (kind === "weekly") {
    if (row.weeklyTokens <= 0) throw new Error("NO_TOKEN");
    const toRow = await getImmunity(to.guild.id, to.id);
    await upsertImmunity(from.guild.id, from.id, {
      weeklyTokens: row.weeklyTokens - 1,
    });
    await upsertImmunity(to.guild.id, to.id, {
      weeklyTokens: toRow.weeklyTokens + 1,
    });
    return;
  }
  if (row.monthlyTokens <= 0) throw new Error("NO_TOKEN");
  const toRow = await getImmunity(to.guild.id, to.id);
  await upsertImmunity(from.guild.id, from.id, {
    monthlyTokens: row.monthlyTokens - 1,
  });
  await upsertImmunity(to.guild.id, to.id, {
    monthlyTokens: toRow.monthlyTokens + 1,
  });
}

export function overviewButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("jail:overview:immunity")
      .setLabel("Immunity")
      .setEmoji("🏛️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("jail:overview:commands")
      .setLabel("Commands")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function onJailInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.isButton()) return false;
  const id = interaction.customId;
  if (!id.startsWith("jail:")) return false;

  if (id === "jail:overview:immunity") {
    if (!interaction.inGuild() || !interaction.guild) return true;
    const embed = await buildImmunityStatusEmbed(
      interaction.guild.id,
      interaction.user.id,
    );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return true;
  }

  if (id === "jail:overview:commands") {
    await interaction.reply({
      embeds: [buildJailCommandsEmbed()],
      ephemeral: true,
    });
    return true;
  }

  const parts = id.split(":");
  const action = parts[1];

  if (action === "vote" && parts.length >= 4) {
    const side = parts[2];
    const voteId = parts[3]!;
    const vote = activeVotes.get(voteId);
    if (!vote || vote.ended) {
      await interaction.reply({
        content: "This jail vote has ended.",
        ephemeral: true,
      });
      return true;
    }
    if (interaction.user.id === vote.targetId) {
      await interaction.reply({
        content: "You can't vote on your own jail sentence.",
        ephemeral: true,
      });
      return true;
    }
    vote.yes.delete(interaction.user.id);
    vote.no.delete(interaction.user.id);
    if (side === "yes") vote.yes.add(interaction.user.id);
    else vote.no.add(interaction.user.id);

    await interaction.deferUpdate();
    await refreshVoteMessage(vote);
    return true;
  }

  if (action === "bail" && parts.length >= 4) {
    if (!interaction.inGuild() || !interaction.guild) return true;
    const targetId = parts[3]!;
    const bailer = interaction.member as GuildMember;
    const target = await interaction.guild.members
      .fetch(targetId)
      .catch(() => null);
    if (!target) {
      await interaction.reply({
        content: "That member isn't in the server.",
        ephemeral: true,
      });
      return true;
    }
    if (bailer.id === target.id) {
      await interaction.reply({
        content: "Use the **Escape Jail** button in your DMs to free yourself.",
        ephemeral: true,
      });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const { bailsUsed } = await performBail(bailer, target);
      await interaction.editReply({
        embeds: [bailSuccessEmbed(target, bailer, bailsUsed)],
      });
      if (interaction.message.editable) {
        await interaction.message.edit({ components: [] }).catch(() => null);
      }
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        await interaction.editReply({
          content: `You need **${BAIL_COST.toLocaleString()}** credits to bail someone out.`,
        });
      } else if (err instanceof Error && err.message === "BAIL_LIMIT") {
        await interaction.editReply({
          content: "You've used all your daily bails.",
        });
      } else if (err instanceof Error && err.message === "NOT_JAILED") {
        await interaction.editReply({
          content: "That user isn't jailed anymore.",
        });
      } else {
        await interaction.editReply({
          content: "Couldn't bail that user right now.",
        });
      }
    }
    return true;
  }

  if (action === "escape" && parts.length >= 3) {
    const guildId = parts[2]!;
    const guild = await interaction.client.guilds
      .fetch(guildId)
      .catch(() => null);
    if (!guild) return true;
    const member = await guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (!member) return true;

    await interaction.deferReply({ ephemeral: true });
    try {
      await performEscape(member);
      await interaction.editReply({
        content: "You escaped jail!",
      });
    } catch (err) {
      const msg =
        err instanceof Error && err.message === "NO_ESCAPES"
          ? "You're out of jail escapes for this week."
          : err instanceof Error && err.message === "NOT_JAILED"
            ? "You're not jailed."
            : "Couldn't escape right now.";
      await interaction.editReply({ content: msg });
    }
    return true;
  }

  return false;
}

export async function restoreActiveJails(client: Client): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("JailRecord")
    .select("guildId, userId, expiresAt")
    .gt("expiresAt", now);
  if (error) {
    console.warn("[jail] restoreActiveJails failed:", error.message);
    return;
  }
  for (const row of data ?? []) {
    const guild = await client.guilds
      .fetch(row.guildId as string)
      .catch(() => null);
    if (!guild) continue;
    const member = await guild.members
      .fetch(row.userId as string)
      .catch(() => null);
    if (!member) continue;
    const expiresAt = new Date(row.expiresAt as string).getTime();
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      await deleteJailRecord(guild.id, member.id);
      continue;
    }
    const me = guild.members.me;
    if (me?.permissions.has("ModerateMembers")) {
      await member
        .timeout(remaining, "Jail restored after bot restart")
        .catch(() => null);
    }
  }
}

export { bailSuccessEmbed, getDailyUsage, incrementDailyJails };
