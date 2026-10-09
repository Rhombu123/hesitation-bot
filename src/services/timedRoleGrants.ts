import type { Client, Guild, GuildMember } from "discord.js";
import { hasSupremeAccess, ROLE_IDS } from "../config/rolePrivileges.js";
import { newId, supabase } from "../db/supabase.js";
import { destroyOwnerCustomRole } from "./customRoles.js";
import { hasActiveStripeShopSub } from "./stripeSubscriptions.js";

export const PAID_ROLE_DURATION_MS = 30 * 24 * 60 * 60_000;

export type PaidRoleKind = "vip" | "elite" | "mythic";

export type TimedRoleGrantRow = {
  id: string;
  guildId: string;
  userId: string;
  roleKind: PaidRoleKind;
  expiresAt: string;
  grantedAt: string;
  active: boolean;
};

function roleIdFor(kind: PaidRoleKind): string {
  const id =
    kind === "vip"
      ? ROLE_IDS.vip
      : kind === "elite"
        ? ROLE_IDS.elite
        : ROLE_IDS.mythic;
  if (!id) throw new Error(`${kind.toUpperCase()} role ID is not configured.`);
  return id;
}

function labelFor(kind: PaidRoleKind): string {
  if (kind === "vip") return "VIP";
  if (kind === "elite") return "Elite";
  return "Mythic";
}

export async function getTimedRoleGrant(
  guildId: string,
  userId: string,
  roleKind: PaidRoleKind,
): Promise<TimedRoleGrantRow | null> {
  const { data, error } = await supabase
    .from("TimedRoleGrants")
    .select("*")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("roleKind", roleKind)
    .maybeSingle();
  if (error) throw new Error(`[supabase:getTimedRoleGrant] ${error.message}`);
  return (data as TimedRoleGrantRow | null) ?? null;
}

/**
 * Bot grants VIP / Elite / Mythic for 30 days (credits redeem / Stripe).
 * Re-buying while active extends from the current expiry.
 */
export async function grantTimedPaidRole(
  member: GuildMember,
  roleKind: PaidRoleKind,
  opts: { durationMs?: number; reason?: string } = {},
): Promise<TimedRoleGrantRow> {
  const roleId = roleIdFor(roleKind);
  const me = member.guild.members.me;
  if (!me?.permissions.has("ManageRoles")) {
    throw new Error("I need **Manage Roles** to grant paid roles.");
  }

  const duration = opts.durationMs ?? PAID_ROLE_DURATION_MS;
  const existing = await getTimedRoleGrant(
    member.guild.id,
    member.id,
    roleKind,
  );
  const now = Date.now();
  const base =
    existing?.active && new Date(existing.expiresAt).getTime() > now
      ? new Date(existing.expiresAt).getTime()
      : now;
  const expiresAt = new Date(base + duration).toISOString();

  let row: TimedRoleGrantRow;
  if (existing) {
    const { data, error } = await supabase
      .from("TimedRoleGrants")
      .update({
        expiresAt,
        grantedAt: new Date().toISOString(),
        active: true,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      throw new Error(`[supabase:grantTimedPaidRole.update] ${error.message}`);
    }
    row = data as TimedRoleGrantRow;
  } else {
    const { data, error } = await supabase
      .from("TimedRoleGrants")
      .insert({
        id: newId(),
        guildId: member.guild.id,
        userId: member.id,
        roleKind,
        expiresAt,
        active: true,
      })
      .select("*")
      .single();
    if (error) {
      throw new Error(`[supabase:grantTimedPaidRole.insert] ${error.message}`);
    }
    row = data as TimedRoleGrantRow;
  }

  if (!member.roles.cache.has(roleId)) {
    const label = labelFor(roleKind);
    await member.roles.add(
      roleId,
      opts.reason ?? `Credits redeem: ${label} (30 days)`,
    );
  }

  return row;
}

export async function deactivateTimedRoleGrant(
  guildId: string,
  userId: string,
  roleKind: PaidRoleKind,
): Promise<void> {
  await supabase
    .from("TimedRoleGrants")
    .update({ active: false })
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("roleKind", roleKind)
    .eq("active", true);
}

export async function revokeTimedPaidRole(
  guild: Guild,
  userId: string,
  roleKind: PaidRoleKind,
  reason: string,
): Promise<void> {
  await deactivateTimedRoleGrant(guild.id, userId, roleKind);

  const roleId = roleIdFor(roleKind);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member && member.roles.cache.has(roleId)) {
    await member.roles
      .remove(roleId, reason)
      .catch((err) =>
        console.warn(`[paidRole] Remove ${roleKind} failed:`, err),
      );
  }

  // Mythic unlocks custom roles — delete theirs unless they still have Supreme.
  if (roleKind === "mythic") {
    const refreshed = await guild.members.fetch(userId).catch(() => null);
    if (refreshed && hasSupremeAccess(refreshed)) {
      console.log(
        `[paidRole] Revoked Mythic for ${userId} but kept custom role (still Supreme).`,
      );
    } else {
      await destroyOwnerCustomRole(guild, userId, reason).catch((err) =>
        console.warn("[paidRole] Custom role destroy failed:", err),
      );
    }
  }

  console.log(
    `[paidRole] Revoked bot ${roleKind} for ${userId} in ${guild.id}: ${reason}`,
  );
}

export async function processExpiredTimedRoleGrants(
  client: Client,
): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("TimedRoleGrants")
    .select("*")
    .eq("active", true)
    .lte("expiresAt", now);
  if (error) {
    throw new Error(
      `[supabase:processExpiredTimedRoleGrants] ${error.message}`,
    );
  }

  let n = 0;
  for (const grant of (data as TimedRoleGrantRow[]) ?? []) {
    const guild = await client.guilds.fetch(grant.guildId).catch(() => null);
    if (!guild) {
      await deactivateTimedRoleGrant(
        grant.guildId,
        grant.userId,
        grant.roleKind,
      );
      continue;
    }

    // Recurring Stripe for this tier (Mythic also covers via supreme sub check
    // only for mythic roleKind — VIP/Elite use their own tier).
    const recurringTiers =
      grant.roleKind === "mythic"
        ? (["mythic"] as const)
        : ([grant.roleKind] as const);
    const recurring = await hasActiveStripeShopSub(
      grant.userId,
      recurringTiers,
    );
    if (recurring) {
      const member = await guild.members.fetch(grant.userId).catch(() => null);
      if (member) {
        await grantTimedPaidRole(member, grant.roleKind, {
          reason: `Stripe subscription renewal (${grant.roleKind})`,
        });
        console.log(
          `[paidRole] Extended expired ${grant.roleKind} for ${grant.userId} — active Stripe subscription.`,
        );
        continue;
      }
    }

    const label = labelFor(grant.roleKind);
    await revokeTimedPaidRole(
      guild,
      grant.userId,
      grant.roleKind,
      `Bot ${label} expired (30 days)`,
    );
    n += 1;
  }
  return n;
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let expiryInterval: ReturnType<typeof setInterval> | null = null;

export function startTimedRoleExpiryTicker(client: Client): void {
  stopTimedRoleExpiryTicker();
  const run = () => {
    void processExpiredTimedRoleGrants(client)
      .then((n) => {
        if (n > 0) {
          console.log(`[paidRole] Expired ${n} VIP/Elite/Mythic grant(s).`);
        }
      })
      .catch((err) => console.error("[paidRole] Expiry tick failed:", err));
  };
  expiryTimer = setTimeout(() => {
    run();
    expiryInterval = setInterval(run, 60 * 60_000);
  }, 25_000);
  console.log("[paidRole] VIP/Elite/Mythic expiry ticker scheduled.");
}

export function stopTimedRoleExpiryTicker(): void {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  if (expiryInterval) {
    clearInterval(expiryInterval);
    expiryInterval = null;
  }
}
