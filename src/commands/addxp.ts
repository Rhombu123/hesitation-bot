import {
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildMember,
  type Message,
} from "discord.js";
import { ADD_XP_ROLE_IDS, EMBED_COLOR } from "../config.js";
import { addXp, getOrCreateStats } from "../services/xp.js";
import { progressInLevel } from "../utils/levelFormula.js";

function canUseAddXp(member: GuildMember): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return member.roles.cache.some((role) => ADD_XP_ROLE_IDS.has(role.id));
}

function parseAmount(token: string | undefined): number | null {
  if (!token) return null;
  const cleaned = token.replace(/[(),]/g, "").trim();
  const n = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function isMentionToken(token: string): boolean {
  return /^<@!?\d+>$/.test(token);
}

async function resolveMemberFromToken(
  message: Message<true>,
  token: string,
): Promise<GuildMember | null> {
  const raw = token.replace(/[()]/g, "").trim();
  if (!raw) return null;

  // <@id> or raw snowflake
  const id = raw.replace(/[<@!>]/g, "");
  if (/^\d{15,21}$/.test(id)) {
    return message.guild.members.fetch(id).catch(() => null);
  }

  // Username / display name search (best-effort)
  const q = raw.toLowerCase();
  await message.guild.members.fetch().catch(() => null);
  return (
    message.guild.members.cache.find(
      (m) =>
        m.user.username.toLowerCase() === q ||
        m.displayName.toLowerCase() === q ||
        m.user.tag.toLowerCase() === q,
    ) ?? null
  );
}

/**
 * `!addxp <amount>` → self
 * `!addxp <amount> @user` → that user
 * `!addxp @user <amount>` → that user
 * Staff with configured roles may target anyone, including themselves.
 */
async function parseAddXpArgs(
  message: Message<true>,
  args: string[],
): Promise<{ amount: number; target: GuildMember } | { error: string }> {
  if (args.length === 0) {
    return {
      error: "Usage: `!addxp <amount>` or `!addxp <amount> @user`",
    };
  }

  let amount: number | null = null;
  let target: GuildMember | null = message.mentions.members?.first() ?? null;

  const tokens = args.map((a) => a.trim()).filter(Boolean);

  for (const token of tokens) {
    if (isMentionToken(token)) continue; // handled via mentions
    const asAmount = parseAmount(token);
    if (asAmount !== null && amount === null) {
      amount = asAmount;
      continue;
    }
    if (!target) {
      target = await resolveMemberFromToken(message, token);
    }
  }

  // Mention-only path already set target; still need amount from non-mention tokens
  if (amount === null) {
    return {
      error: "Usage: `!addxp <amount>` or `!addxp <amount> @user` (amount must be a positive number)",
    };
  }

  if (!target) {
    // No target given → grant to the staff member themselves
    target = await message.guild.members
      .fetch({ user: message.author.id, force: true })
      .catch(() => null);
  }

  if (!target) {
    return {
      error:
        "Could not find that member. Ping them with `@username` — example: `!addxp 50 @Someone`",
    };
  }

  if (amount > 1_000_000) {
    return { error: "Amount too large (max 1,000,000 XP per command)." };
  }

  return { amount, target };
}

export async function handleAddXpCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const author = await message.guild.members
    .fetch({ user: message.author.id, force: true })
    .catch(() => null);

  if (!author) {
    await message.reply("Could not load your member profile. Try again.");
    return;
  }

  if (!canUseAddXp(author)) {
    console.warn(
      `[addxp] Denied for ${author.user.tag}. Roles: [${[...author.roles.cache.keys()].join(", ")}]`,
    );
    await message.reply(
      "You don't have permission to use `!addxp`. You need one of the staff XP roles (or Administrator / Manage Server).",
    );
    return;
  }

  const parsed = await parseAddXpArgs(message, args);
  if ("error" in parsed) {
    await message.reply(parsed.error);
    return;
  }

  const { amount, target } = parsed;

  try {
    const result = await addXp(
      message.client,
      message.guildId,
      target.id,
      amount,
      target,
    );
    const stats = await getOrCreateStats(message.guildId, target.id);
    const { current, needed } = progressInLevel(stats.xp);

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription(
        [
          `Added **${amount}** XP to **${target.displayName}**${target.id === author.id ? " (you)" : ""}.`,
          `Now **Level ${result.level}** · **${stats.xp}** total XP`,
          `Progress: **${current}** / **${needed}** XP`,
          result.levelsGained > 0
            ? `Leveled up **${result.levelsGained}** time${result.levelsGained === 1 ? "" : "s"}!`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );

    await message.reply({ embeds: [embed] });
    console.log(
      `[addxp] ${author.user.tag} gave ${amount} XP to ${target.user.tag} (now level ${result.level})`,
    );
  } catch (err) {
    console.error("[addxp] failed:", err);
    await message.reply(
      "Failed to add XP (database error). Check that Supabase is connected.",
    );
  }
}
