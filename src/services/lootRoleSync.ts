import type { Client, Guild, Role } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { allLootRoles, type LootRoleDef } from "../config/lootRoles.js";

export function findLootDiscordRole(
  guild: Guild,
  def: LootRoleDef,
): Role | undefined {
  if (def.roleId) {
    const byId = guild.roles.cache.get(def.roleId);
    if (byId) return byId;
  }
  const needle = def.name.toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === needle);
}

/**
 * Find loot Discord role by fixed ID (preferred) or name, or create it.
 */
export async function ensureLootDiscordRole(
  guild: Guild,
  def: LootRoleDef,
): Promise<Role> {
  await guild.roles.fetch().catch(() => null);

  if (def.roleId) {
    const byId = guild.roles.cache.get(def.roleId);
    if (byId) return byId;
    throw new Error(
      `Loot role **${def.name}** is configured as \`${def.roleId}\` but that role is missing in this server.`,
    );
  }

  const existing = findLootDiscordRole(guild, def);
  if (existing) {
    if (existing.color !== def.discordColor) {
      await existing
        .edit({
          color: def.discordColor,
          reason: `Loot role color themed to "${def.name}"`,
        })
        .catch((err) =>
          console.warn(`[lootRoles] Recolor ${def.name} failed:`, err),
        );
    }
    return existing;
  }

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error(
      `I need **Manage Roles** to create the **${def.name}** loot role.`,
    );
  }

  const created = await guild.roles.create({
    name: def.name,
    color: def.discordColor,
    mentionable: false,
    hoist: false,
    reason: `Loot role auto-created on equip (${def.id})`,
  });
  console.log(
    `[lootRoles] Created Discord role ${created.name} (${created.id}) in ${guild.id}`,
  );
  return created;
}

async function syncOneLootRole(
  guild: Guild,
  def: LootRoleDef,
): Promise<"updated" | "ok" | "missing" | "failed"> {
  const role = findLootDiscordRole(guild, def);
  if (!role) return "missing";
  if (role.color === def.discordColor) return "ok";

  try {
    await role.edit({
      color: def.discordColor,
      reason: `Loot role color themed to "${def.name}"`,
    });
    return "updated";
  } catch (err) {
    console.warn(
      `[lootRoles] Failed to recolor ${def.name} (${role.id}) in ${guild.id}:`,
      err,
    );
    return "failed";
  }
}

/**
 * Match Discord loot roles by exact name and set colors to fit each name.
 * Skips roles that don't exist yet (created on first equip instead).
 */
export async function syncLootRoleColors(client: Client<true>): Promise<void> {
  const defs = allLootRoles();
  let updated = 0;
  let ok = 0;
  let missing = 0;
  let failed = 0;

  for (const guild of client.guilds.cache.values()) {
    await guild.roles.fetch().catch(() => null);

    for (const def of defs) {
      const result = await syncOneLootRole(guild, def);
      if (result === "updated") updated += 1;
      else if (result === "ok") ok += 1;
      else if (result === "missing") missing += 1;
      else if (result === "failed") failed += 1;
    }
  }

  console.log(
    `[lootRoles] Color sync — updated ${updated}, ok ${ok}, missing ${missing}, failed ${failed}.`,
  );
}
