import {
  PermissionFlagsBits,
  type GuildMember,
} from "discord.js";
import {
  ADD_XP_ROLE_IDS,
  GAME_SPAWN_STAFF_ROLE_IDS,
  SENIOR_MOD_ROLE_ID,
  STAFF_ROLE_IDS,
} from "../config.js";

/** Shared deny text for manual game spawn commands. */
export const NO_SPAWN_GAMES_PERMISSION =
  "You don't have permission to spawn games.";

/** Discord Administrator permission. */
export function isDiscordAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/** Admin, Manage Server, or add-XP staff — can cast `!uwuify` with extended limits. */
export function canCastUwuify(member: GuildMember): boolean {
  if (isDiscordAdmin(member)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return member.roles.cache.some((role) => ADD_XP_ROLE_IDS.has(role.id));
}

/** Staff roles, Admin, or Manage Server — can use restricted commands anywhere. */
export function isStaffMember(member: GuildMember): boolean {
  if (isDiscordAdmin(member)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return member.roles.cache.some((role) => STAFF_ROLE_IDS.has(role.id));
}

/**
 * Direct mini-game spawn (`!flag`, `!react`, `!crate`, …).
 * Admin / Manage Server / higher add-XP staff — not Senior Mod.
 */
export function canSpawnGames(member: GuildMember): boolean {
  if (isDiscordAdmin(member)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return member.roles.cache.some((role) =>
    GAME_SPAWN_STAFF_ROLE_IDS.has(role.id),
  );
}

/** True if member has Senior Mod (may use `!games` menu, not direct spawn cmds). */
export function hasSeniorMod(member: GuildMember): boolean {
  return member.roles.cache.has(SENIOR_MOD_ROLE_ID);
}
