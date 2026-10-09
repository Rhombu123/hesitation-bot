import type { Client, Guild } from "discord.js";

/** Shown only while a bless XP boost is active. */
export const BLESS_ROLE_ID = "1552763904482873445";

export async function setBlessRole(
  guild: Guild,
  userId: string,
  enabled: boolean,
): Promise<void> {
  const role = await guild.roles.fetch(BLESS_ROLE_ID).catch(() => null);
  if (!role) {
    console.warn(
      `[bless] Role ${BLESS_ROLE_ID} not found in guild ${guild.id}.`,
    );
    return;
  }

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (
    !me?.permissions.has("ManageRoles") ||
    role.position >= me.roles.highest.position
  ) {
    console.warn(
      `[bless] Cannot manage bless role ${role.name} (${role.id}) — move the bot role above it.`,
    );
    return;
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const has = member.roles.cache.has(role.id);
  if (enabled && !has) {
    await member.roles.add(role, "Bless XP boost started");
    console.log(`[bless] Gave ${member.user.tag} ${role.name} (${role.id})`);
  } else if (!enabled && has) {
    await member.roles.remove(role, "Bless XP boost ended");
    console.log(`[bless] Removed ${role.name} (${role.id}) from ${member.user.tag}`);
  }
}

/** Drop the bless role from anyone who is not in the active set. */
export async function reconcileBlessRoles(
  client: Client,
  activeUserIdsByGuild: Map<string, Set<string>>,
): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const role = await guild.roles.fetch(BLESS_ROLE_ID).catch(() => null);
    if (!role) continue;
    const me = guild.members.me;
    if (
      !me?.permissions.has("ManageRoles") ||
      role.position >= me.roles.highest.position
    ) {
      continue;
    }

    await guild.members.fetch().catch(() => null);
    const active = activeUserIdsByGuild.get(guild.id) ?? new Set<string>();

    for (const member of guild.members.cache.values()) {
      const has = member.roles.cache.has(role.id);
      const should = active.has(member.id);
      if (should && !has) {
        await member.roles.add(role, "Bless XP boost still active").catch((err) =>
          console.warn(`[bless] Add failed for ${member.user.tag}:`, err),
        );
      } else if (!should && has) {
        await member.roles
          .remove(role, "Bless XP boost ended")
          .catch((err) =>
            console.warn(`[bless] Remove failed for ${member.user.tag}:`, err),
          );
      }
    }
  }
}
