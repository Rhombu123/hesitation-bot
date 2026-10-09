import type { Client, GuildMember, PartialUser, User } from "discord.js";
import { config } from "../config.js";

type AnyUser = User | PartialUser;

/** True when the user is displaying this guild's server tag. */
export function isDisplayingOurServerTag(
  user: AnyUser,
  guildId: string,
): boolean {
  const primary = user.primaryGuild;
  if (!primary) return false;
  return (
    primary.identityEnabled === true &&
    primary.identityGuildId === guildId
  );
}

function primaryGuildChanged(a: AnyUser, b: AnyUser): boolean {
  const left = a.primaryGuild;
  const right = b.primaryGuild;
  return (
    left?.identityGuildId !== right?.identityGuildId ||
    left?.identityEnabled !== right?.identityEnabled ||
    left?.tag !== right?.tag
  );
}

/**
 * Add/remove the server-tag role to match whether the member shows our tag.
 */
export async function syncServerTagRole(member: GuildMember): Promise<void> {
  const roleId = config.serverTagRoleId;
  if (!roleId) return;

  const role = member.guild.roles.cache.get(roleId);
  if (!role) {
    console.warn(
      `[serverTag] Role ${roleId} missing in guild ${member.guild.id}`,
    );
    return;
  }

  const shouldHave = isDisplayingOurServerTag(member.user, member.guild.id);
  const has = member.roles.cache.has(roleId);

  if (shouldHave && !has) {
    await member.roles.add(role, "Equipped server tag (MOON)");
    console.log(`[serverTag] Gave ${role.name} to ${member.user.tag}`);
    return;
  }

  if (!shouldHave && has) {
    await member.roles.remove(role, "Removed server tag (MOON)");
    console.log(`[serverTag] Removed ${role.name} from ${member.user.tag}`);
  }
}

/**
 * When a user's displayed server tag changes, sync the role in our guild(s).
 */
export async function onUserUpdateForServerTag(
  client: Client,
  oldUser: AnyUser,
  newUser: AnyUser,
): Promise<void> {
  if (newUser.bot) return;
  if (!primaryGuildChanged(oldUser, newUser)) return;

  const roleId = config.serverTagRoleId;
  if (!roleId) return;

  for (const guild of client.guilds.cache.values()) {
    const wasOurs = oldUser.primaryGuild?.identityGuildId === guild.id;
    const isOurs = newUser.primaryGuild?.identityGuildId === guild.id;
    if (!wasOurs && !isOurs) continue;

    const member = await guild.members.fetch(newUser.id).catch(() => null);
    if (!member) continue;

    await syncServerTagRole(member).catch((err) =>
      console.error(
        `[serverTag] Sync failed for ${newUser.id} in ${guild.id}:`,
        err,
      ),
    );
  }
}
