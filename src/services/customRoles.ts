import type { Guild, GuildMember, Role } from "discord.js";
import { config } from "../config.js";
import { canUseCustomRoleGradient } from "../config/rolePrivileges.js";
import { newId, supabase } from "../db/supabase.js";

export type CustomRoleRow = {
  id: string;
  guildId: string;
  ownerId: string;
  discordRoleId: string;
  createdAt: string;
};

export type CustomRoleMemberRow = {
  id: string;
  guildId: string;
  discordRoleId: string;
  userId: string;
  givenBy: string;
  createdAt: string;
};

export async function getCustomRoleByOwner(
  guildId: string,
  ownerId: string,
): Promise<CustomRoleRow | null> {
  const { data, error } = await supabase
    .from("CustomRoles")
    .select("*")
    .eq("guildId", guildId)
    .eq("ownerId", ownerId)
    .maybeSingle();
  if (error) throw new Error(`[supabase:getCustomRoleByOwner] ${error.message}`);
  return (data as CustomRoleRow | null) ?? null;
}

export async function getCustomRoleByDiscordId(
  guildId: string,
  discordRoleId: string,
): Promise<CustomRoleRow | null> {
  const { data, error } = await supabase
    .from("CustomRoles")
    .select("*")
    .eq("guildId", guildId)
    .eq("discordRoleId", discordRoleId)
    .maybeSingle();
  if (error)
    throw new Error(`[supabase:getCustomRoleByDiscordId] ${error.message}`);
  return (data as CustomRoleRow | null) ?? null;
}

export async function listCustomRoles(
  guildId: string,
): Promise<CustomRoleRow[]> {
  const { data, error } = await supabase
    .from("CustomRoles")
    .select("*")
    .eq("guildId", guildId);
  if (error) throw new Error(`[supabase:listCustomRoles] ${error.message}`);
  return (data as CustomRoleRow[]) ?? [];
}

export async function insertCustomRole(opts: {
  guildId: string;
  ownerId: string;
  discordRoleId: string;
}): Promise<CustomRoleRow> {
  const row = {
    id: newId(),
    guildId: opts.guildId,
    ownerId: opts.ownerId,
    discordRoleId: opts.discordRoleId,
  };
  const { data, error } = await supabase
    .from("CustomRoles")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(`[supabase:insertCustomRole] ${error.message}`);
  return data as CustomRoleRow;
}

export async function deleteCustomRoleRecord(
  guildId: string,
  ownerId: string,
): Promise<void> {
  const existing = await getCustomRoleByOwner(guildId, ownerId);
  if (!existing) return;

  await supabase
    .from("CustomRoleMembers")
    .delete()
    .eq("guildId", guildId)
    .eq("discordRoleId", existing.discordRoleId);

  const { error } = await supabase
    .from("CustomRoles")
    .delete()
    .eq("guildId", guildId)
    .eq("ownerId", ownerId);
  if (error) throw new Error(`[supabase:deleteCustomRoleRecord] ${error.message}`);
}

export async function recordRoleGive(opts: {
  guildId: string;
  discordRoleId: string;
  userId: string;
  givenBy: string;
}): Promise<void> {
  const { data: existing } = await supabase
    .from("CustomRoleMembers")
    .select("id")
    .eq("guildId", opts.guildId)
    .eq("discordRoleId", opts.discordRoleId)
    .eq("userId", opts.userId)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase.from("CustomRoleMembers").insert({
    id: newId(),
    guildId: opts.guildId,
    discordRoleId: opts.discordRoleId,
    userId: opts.userId,
    givenBy: opts.givenBy,
  });
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(`[supabase:recordRoleGive] ${error.message}`);
  }
}

export async function listCustomRoleMembersForUser(
  guildId: string,
  userId: string,
): Promise<CustomRoleMemberRow[]> {
  const { data, error } = await supabase
    .from("CustomRoleMembers")
    .select("*")
    .eq("guildId", guildId)
    .eq("userId", userId);
  if (error) {
    throw new Error(`[supabase:listCustomRoleMembersForUser] ${error.message}`);
  }
  return (data as CustomRoleMemberRow[]) ?? [];
}

export async function listCustomRoleMembersForRole(
  guildId: string,
  discordRoleId: string,
): Promise<CustomRoleMemberRow[]> {
  const { data, error } = await supabase
    .from("CustomRoleMembers")
    .select("*")
    .eq("guildId", guildId)
    .eq("discordRoleId", discordRoleId);
  if (error) {
    throw new Error(`[supabase:listCustomRoleMembersForRole] ${error.message}`);
  }
  return (data as CustomRoleMemberRow[]) ?? [];
}

export async function removeRoleMemberRecord(opts: {
  guildId: string;
  discordRoleId: string;
  userId: string;
}): Promise<void> {
  await supabase
    .from("CustomRoleMembers")
    .delete()
    .eq("guildId", opts.guildId)
    .eq("discordRoleId", opts.discordRoleId)
    .eq("userId", opts.userId);
}

/**
 * Fully remove an owner's custom role: strip holders, delete the Discord role,
 * and wipe CustomRoles / CustomRoleMembers rows.
 */
export async function destroyOwnerCustomRole(
  guild: Guild,
  ownerId: string,
  reason: string,
): Promise<boolean> {
  const row = await getCustomRoleByOwner(guild.id, ownerId);
  if (!row) return false;

  await stripCustomRoleHolders(guild, ownerId, reason);

  const role = await guild.roles.fetch(row.discordRoleId).catch(() => null);
  if (role) {
    await role
      .delete(reason)
      .catch((err) =>
        console.warn(
          `[customRoles] Discord role delete failed for ${row.discordRoleId}:`,
          err,
        ),
      );
  }

  await deleteCustomRoleRecord(guild.id, ownerId);
  console.log(
    `[customRoles] Destroyed custom role ${row.discordRoleId} for owner ${ownerId}: ${reason}`,
  );
  return true;
}

/**
 * Unequip the owner's custom role from every holder (including the owner).
 * Keeps the Discord role, CustomRoles row, and CustomRoleMembers so the same
 * role can be re-equipped when the owner gets Supreme again.
 */
export async function stripCustomRoleHolders(
  guild: Guild,
  ownerId: string,
  reason: string,
): Promise<number> {
  const row = await getCustomRoleByOwner(guild.id, ownerId);
  if (!row) return 0;

  const role = await guild.roles.fetch(row.discordRoleId).catch(() => null);
  if (!role) {
    console.warn(
      `[customRoles] Strip skipped — Discord role ${row.discordRoleId} missing (memberships kept for owner ${ownerId}).`,
    );
    return 0;
  }

  await guild.members.fetch().catch(() => null);
  const holders = guild.members.cache.filter((m) => m.roles.cache.has(role.id));
  let removed = 0;
  for (const [, member] of holders) {
    try {
      await member.roles.remove(role, reason);
      removed += 1;
    } catch (err) {
      console.warn(
        `[customRoles] Strip failed for ${member.user.tag}:`,
        err,
      );
    }
  }

  console.log(
    `[customRoles] Unequipped <@&${role.id}> from ${removed} member(s) (owner ${ownerId}). Role + memberships kept.`,
  );
  return removed;
}

/**
 * Re-equip a Supreme owner's custom role to the owner and everyone previously
 * given it (CustomRoleMembers). Used when Supreme is granted again.
 */
export async function reequipCustomRoleHolders(
  guild: Guild,
  ownerId: string,
  reason: string,
): Promise<number> {
  const row = await getCustomRoleByOwner(guild.id, ownerId);
  if (!row) return 0;

  const role = await guild.roles.fetch(row.discordRoleId).catch(() => null);
  if (!role) {
    console.warn(
      `[customRoles] Re-equip skipped — Discord role ${row.discordRoleId} missing for owner ${ownerId}.`,
    );
    return 0;
  }

  await ensureCustomRoleBelowStaff(guild, role);

  let restored = 0;
  const owner = await guild.members.fetch(ownerId).catch(() => null);
  if (owner) {
    await ensureSolidCustomRoleColor(role, {
      allowGradient: canUseCustomRoleGradient(owner),
    });
    if (!owner.roles.cache.has(role.id)) {
      try {
        await owner.roles.add(role, reason);
        restored += 1;
      } catch (err) {
        console.warn(
          `[customRoles] Re-equip owner failed for ${owner.user.tag}:`,
          err,
        );
      }
    }
  }

  const members = await listCustomRoleMembersForRole(guild.id, row.discordRoleId);
  for (const m of members) {
    if (m.userId === ownerId) continue;
    const member = await guild.members.fetch(m.userId).catch(() => null);
    if (!member || member.user.bot) continue;
    if (member.roles.cache.has(role.id)) continue;
    try {
      await member.roles.add(role, reason);
      restored += 1;
    } catch (err) {
      console.warn(
        `[customRoles] Re-equip failed for ${member.user.tag}:`,
        err,
      );
    }
  }

  if (restored > 0) {
    console.log(
      `[customRoles] Re-equipped <@&${role.id}> on ${restored} member(s) (owner ${ownerId}).`,
    );
  }
  return restored;
}

/** Bot can manage this role (position + Manage Roles). */
export function canManageDiscordRole(guild: Guild, role: Role): boolean {
  const me = guild.members.me;
  if (!me?.permissions.has("ManageRoles")) return false;
  if (role.managed) return false;
  return me.roles.highest.position > role.position;
}

/**
 * Highest slot a custom role may occupy: immediately under Helper,
 * and still under the bot so it can be managed.
 */
export function customRoleTargetPosition(guild: Guild): number {
  const me = guild.members.me;
  const botCap = me ? me.roles.highest.position - 1 : 1;
  const helper = guild.roles.cache.get(config.helperRoleId);
  const helperCap = helper ? helper.position - 1 : botCap;
  return Math.max(1, Math.min(botCap, helperCap));
}

/** Supreme custom roles are solid only — strip gradient unless the owner is Hesitation Ruler. */
export async function ensureSolidCustomRoleColor(
  role: Role,
  opts?: { allowGradient?: boolean },
): Promise<void> {
  if (opts?.allowGradient) return;
  const primary = role.colors?.primaryColor ?? role.color ?? 0xe2dbb9;
  if (role.colors?.secondaryColor == null && role.colors?.tertiaryColor == null) {
    return;
  }
  try {
    await role.edit({
      colors: {
        primaryColor: primary,
        secondaryColor: null,
        tertiaryColor: null,
      },
      reason: "Supreme custom roles use solid colors only",
    });
  } catch (err) {
    console.warn("[customRoles] Could not normalize role to solid color:", err);
  }
}

/** Move a custom role under Helper if it sits at or above that role. */
export async function ensureCustomRoleBelowStaff(
  guild: Guild,
  role: Role,
): Promise<void> {
  const target = customRoleTargetPosition(guild);
  if (role.position <= target) return;
  try {
    await role.setPosition(target, {
      reason: "Keep custom role below Helper",
    });
    console.log(
      `[customRoles] Moved ${role.name} (${role.id}) below Helper`,
    );
  } catch (err) {
    console.warn("[customRoles] Could not lower role below Helper:", err);
  }
}

/** Lower every tracked custom role so none sit above Helper. */
export async function lowerAllCustomRolesBelowHelper(opts: {
  guilds: { cache: { values(): Iterable<Guild> } };
}): Promise<void> {
  for (const guild of opts.guilds.cache.values()) {
    await guild.roles.fetch().catch(() => null);
    const rows = await listCustomRoles(guild.id);
    for (const row of rows) {
      const role =
        guild.roles.cache.get(row.discordRoleId) ??
        (await guild.roles.fetch(row.discordRoleId).catch(() => null));
      if (!role) continue;
      await ensureCustomRoleBelowStaff(guild, role);
    }
  }
}

/**
 * Ensure the Supreme member owns a Discord custom role + DB row.
 * Creates one if missing; re-attaches an existing role after expiry/leave strip.
 */
export async function ensureOwnerCustomRole(
  member: GuildMember,
): Promise<{ row: CustomRoleRow; role: Role }> {
  const guild = member.guild;
  const existing = await getCustomRoleByOwner(guild.id, member.id);
  if (existing) {
    const role = await guild.roles.fetch(existing.discordRoleId).catch(() => null);
    if (role) {
      await ensureCustomRoleBelowStaff(guild, role);
      await ensureSolidCustomRoleColor(role, {
        allowGradient: canUseCustomRoleGradient(member),
      });
      if (!member.roles.cache.has(role.id)) {
        await member.roles
          .add(role, "Supreme custom role — reattach to owner")
          .catch((err) =>
            console.warn("[customRoles] Could not reattach role to owner:", err),
          );
      }
      return { row: existing, role };
    }
    // Discord role deleted — recreate
    await deleteCustomRoleRecord(guild.id, member.id);
  }

  const me = guild.members.me;
  if (!me?.permissions.has("ManageRoles")) {
    throw new Error("I need **Manage Roles** to create custom roles.");
  }

  const baseName = member.displayName.slice(0, 100) || "Custom Role";
  const role = await guild.roles.create({
    name: baseName,
    colors: { primaryColor: 0xe2dbb9 },
    reason: `Supreme custom role for ${member.user.tag}`,
    mentionable: false,
    hoist: false,
  });

  try {
    await role.setPosition(customRoleTargetPosition(guild), {
      reason: "Supreme custom role placement (below staff)",
    });
  } catch (err) {
    console.warn("[customRoles] Could not position new role:", err);
  }

  await member.roles.add(role, "Supreme custom role — owner").catch((err) => {
    console.warn("[customRoles] Could not add role to owner:", err);
  });

  await ensureSolidCustomRoleColor(role, {
    allowGradient: canUseCustomRoleGradient(member),
  });

  const row = await insertCustomRole({
    guildId: guild.id,
    ownerId: member.id,
    discordRoleId: role.id,
  });
  return { row, role };
}
