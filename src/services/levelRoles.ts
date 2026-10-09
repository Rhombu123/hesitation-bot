import type { Client, GuildMember } from "discord.js";
import { LEVEL_ROLES } from "../config.js";
import { ROLE_IDS } from "../config/rolePrivileges.js";
import { getOrCreateStats } from "./xp.js";

/**
 * Grant every level-reward role for thresholds between oldLevel (exclusive)
 * and newLevel (inclusive). Roles already held are skipped.
 * Level 90+ also grants permanent Elite (not time-limited).
 */
export async function grantLevelRoles(
  client: Client,
  opts: {
    guildId: string;
    userId: string;
    oldLevel: number;
    newLevel: number;
    member?: GuildMember | null;
  },
): Promise<Array<{ level: number; roleName: string; roleId: string }>> {
  const granted: Array<{ level: number; roleName: string; roleId: string }> =
    [];
  const toGrant = LEVEL_ROLES.filter(
    (r) => r.level > opts.oldLevel && r.level <= opts.newLevel,
  );

  try {
    const guild = await client.guilds.fetch(opts.guildId);
    const member =
      opts.member ??
      (await guild.members.fetch(opts.userId).catch(() => null));
    if (!member) {
      console.warn(
        `[levelRoles] Could not fetch member ${opts.userId} in guild ${opts.guildId}`,
      );
      return granted;
    }

    const me = guild.members.me;
    if (!me?.permissions.has("ManageRoles")) {
      console.warn(
        "[levelRoles] Bot is missing Manage Roles — cannot assign level roles.",
      );
      return granted;
    }

    for (const { level, roleId } of toGrant) {
      if (member.roles.cache.has(roleId)) continue;

      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        console.warn(
          `[levelRoles] Role ${roleId} (level ${level}) not found in guild ${guild.id}`,
        );
        continue;
      }

      if (role.managed || role.position >= me.roles.highest.position) {
        console.warn(
          `[levelRoles] Cannot assign role ${role.name} (${roleId}) — move the bot's role above it.`,
        );
        continue;
      }

      await member.roles.add(role, `Reached level ${level}`);
      granted.push({ level, roleName: role.name, roleId: role.id });
      console.log(
        `[levelRoles] Gave ${member.user.tag} role ${role.name} for level ${level}`,
      );
    }

    // Permanent Elite at level 90+
    if (
      opts.newLevel >= 90 &&
      opts.oldLevel < 90 &&
      ROLE_IDS.elite &&
      !member.roles.cache.has(ROLE_IDS.elite)
    ) {
      const elite = await guild.roles.fetch(ROLE_IDS.elite).catch(() => null);
      if (
        elite &&
        !elite.managed &&
        elite.position < me.roles.highest.position
      ) {
        await member.roles.add(elite, "Reached level 90 — permanent Elite");
        granted.push({
          level: 90,
          roleName: elite.name,
          roleId: elite.id,
        });
        console.log(
          `[levelRoles] Gave ${member.user.tag} permanent Elite for level 90`,
        );
      }
    }
  } catch (err) {
    console.error(
      `[levelRoles] Failed granting roles for ${opts.userId} → level ${opts.newLevel}:`,
      err,
    );
  }

  return granted;
}

/**
 * Re-apply every earned level role after someone rejoins.
 * XP / points / rep already persist in the DB — Discord just drops roles on leave.
 */
export async function restoreLevelRolesOnRejoin(
  member: GuildMember,
): Promise<void> {
  if (member.user.bot) return;

  const stats = await getOrCreateStats(member.guild.id, member.id);
  if (stats.level <= 0) return;

  await grantLevelRoles(member.client, {
    guildId: member.guild.id,
    userId: member.id,
    oldLevel: 0,
    newLevel: stats.level,
    member,
  });
}
