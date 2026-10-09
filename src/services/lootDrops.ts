import {
  EmbedBuilder,
  type GuildMember,
  type TextBasedChannel,
} from "discord.js";
import { GAME_EMBED_COLOR } from "../config.js";
import {
  LOOT_CATEGORY_META,
  LOOT_HOBBY,
  LOOT_PERSONALITY,
  LOOT_TITLES,
  lootRolesForCategory,
  type LootRoleDef,
} from "../config/lootRoles.js";
import { randomInt } from "../utils/helpers.js";
import { getUnlockedLootIds, unlockLootRole } from "./lootUnlocks.js";

/**
 * Chance to drop a rare loot role (Personality / Hobby / Colors) on a game win.
 * 0.5% = 1 in 200.
 */
export const LOOT_RARE_DROP_PERCENT = 0.5;
export const LOOT_RARE_DROP_ONE_IN = 200;

/**
 * Chance to drop an Exclusive Title on a game win.
 * 0.25% = 1 in 400.
 */
export const LOOT_EXCLUSIVE_DROP_PERCENT = 0.25;
export const LOOT_EXCLUSIVE_DROP_ONE_IN = 400;

const RARE_POOL: readonly LootRoleDef[] = [
  ...LOOT_PERSONALITY,
  ...LOOT_HOBBY,
  ...lootRolesForCategory("color"),
];

function rollOneIn(oneIn: number): boolean {
  return randomInt(1, oneIn) === 1;
}

function pickUnowned(
  pool: readonly LootRoleDef[],
  unlocked: Set<string>,
): LootRoleDef | null {
  const open = pool.filter((r) => !unlocked.has(r.id));
  if (open.length === 0) return null;
  return open[randomInt(0, open.length - 1)]!;
}

/**
 * Roll loot on a game win. Exclusive is checked first (rarer).
 * Returns the newly unlocked role, or null.
 */
export async function rollLootDrop(
  guildId: string,
  userId: string,
): Promise<LootRoleDef | null> {
  const unlocked = await getUnlockedLootIds(guildId, userId);

  if (rollOneIn(LOOT_EXCLUSIVE_DROP_ONE_IN)) {
    const pick = pickUnowned(LOOT_TITLES, unlocked);
    if (pick) {
      const inserted = await unlockLootRole(guildId, userId, pick.id).catch(
        (err) => {
          console.error("[lootDrop] exclusive unlock failed:", err);
          return false;
        },
      );
      if (inserted) return pick;
    }
  }

  if (rollOneIn(LOOT_RARE_DROP_ONE_IN)) {
    const pick = pickUnowned(RARE_POOL, unlocked);
    if (pick) {
      const inserted = await unlockLootRole(guildId, userId, pick.id).catch(
        (err) => {
          console.error("[lootDrop] rare unlock failed:", err);
          return false;
        },
      );
      if (inserted) return pick;
    }
  }

  return null;
}

function dropEmbed(member: GuildMember, role: LootRoleDef): EmbedBuilder {
  const meta = LOOT_CATEGORY_META[role.category];
  const exclusive = role.rarity === "exclusive";
  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setAuthor({
      name: exclusive
        ? `${member.displayName} found an Exclusive Title!`
        : `${member.displayName} found rare loot!`,
      iconURL: member.displayAvatarURL({ size: 64 }),
    })
    .setDescription(
      [
        `<@${member.id}> unlocked ${role.swatch} **${role.name}**`,
        `${meta.emoji} **${meta.label}**`,
        "",
        exclusive
          ? `_Exclusive drop — ${LOOT_EXCLUSIVE_DROP_PERCENT}% chance_`
          : `_Rare loot drop — ${LOOT_RARE_DROP_PERCENT}% chance_`,
        "Use `!loot` to browse your collection.",
      ].join("\n"),
    );
}

/** Roll + announce a loot drop in-channel if the winner hits. */
export async function tryAnnounceLootDrop(
  channel: TextBasedChannel,
  member: GuildMember,
): Promise<LootRoleDef | null> {
  if (channel.isDMBased() || !("send" in channel)) return null;

  let role: LootRoleDef | null = null;
  try {
    role = await rollLootDrop(member.guild.id, member.id);
  } catch (err) {
    console.error("[lootDrop] roll failed:", err);
    return null;
  }
  if (!role) return null;

  try {
    await channel.send({
      content: `<@${member.id}>`,
      embeds: [dropEmbed(member, role)],
      allowedMentions: { users: [member.id] },
    });
    console.log(
      `[lootDrop] ${member.user.tag} unlocked ${role.id} (${role.rarity})`,
    );
  } catch (err) {
    console.warn("[lootDrop] announce failed:", err);
  }
  return role;
}
