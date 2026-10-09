import type { Client, Guild, GuildMember } from "discord.js";
import { hasMythic, ROLE_IDS } from "../config/rolePrivileges.js";
import { newId, supabase } from "../db/supabase.js";
import {
  destroyOwnerCustomRole,
  reequipCustomRoleHolders,
  stripCustomRoleHolders,
} from "./customRoles.js";
import { hasActiveStripeShopSub } from "./stripeSubscriptions.js";

export const SUPREME_BOT_DURATION_MS = 30 * 24 * 60 * 60_000;

export type SupremeGrantRow = {
  id: string;
  guildId: string;
  userId: string;
  source: "bot" | "manual";
  expiresAt: string | null;
  grantedAt: string;
  grantedBy: string | null;
  active: boolean;
};

export async function getSupremeGrant(
  guildId: string,
  userId: string,
): Promise<SupremeGrantRow | null> {
  const { data, error } = await supabase
    .from("SupremeGrants")
    .select("*")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .maybeSingle();
  if (error) throw new Error(`[supabase:getSupremeGrant] ${error.message}`);
  return (data as SupremeGrantRow | null) ?? null;
}

/** Active bot-tracked grant (has a 30-day clock). */
export async function getActiveBotGrant(
  guildId: string,
  userId: string,
): Promise<SupremeGrantRow | null> {
  const row = await getSupremeGrant(guildId, userId);
  if (!row || !row.active || row.source !== "bot") return null;
  return row;
}

/**
 * Bot grants Supreme for 30 days (credits redeem / `!givesupreme`).
 * Manual Discord role adds create no row → never auto-expire.
 */
export async function grantBotSupreme(
  member: GuildMember,
  opts: { grantedBy?: string; durationMs?: number } = {},
): Promise<SupremeGrantRow> {
  const roleId = ROLE_IDS.supreme;
  if (!roleId) throw new Error("SUPREME_ROLE_ID is not configured.");

  const me = member.guild.members.me;
  if (!me?.permissions.has("ManageRoles")) {
    throw new Error("I need **Manage Roles** to grant Supreme.");
  }

  const duration = opts.durationMs ?? SUPREME_BOT_DURATION_MS;
  const existing = await getSupremeGrant(member.guild.id, member.id);
  const now = Date.now();
  const base =
    existing?.active &&
    existing.source === "bot" &&
    existing.expiresAt &&
    new Date(existing.expiresAt).getTime() > now
      ? new Date(existing.expiresAt).getTime()
      : now;
  const expiresAt = new Date(base + duration).toISOString();

  let row: SupremeGrantRow;
  if (existing) {
    const { data, error } = await supabase
      .from("SupremeGrants")
      .update({
        source: "bot",
        expiresAt,
        grantedAt: new Date().toISOString(),
        grantedBy: opts.grantedBy ?? null,
        active: true,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`[supabase:grantBotSupreme.update] ${error.message}`);
    row = data as SupremeGrantRow;
  } else {
    const { data, error } = await supabase
      .from("SupremeGrants")
      .insert({
        id: newId(),
        guildId: member.guild.id,
        userId: member.id,
        source: "bot",
        expiresAt,
        grantedBy: opts.grantedBy ?? null,
        active: true,
      })
      .select("*")
      .single();
    if (error) throw new Error(`[supabase:grantBotSupreme.insert] ${error.message}`);
    row = data as SupremeGrantRow;
  }

  if (!member.roles.cache.has(roleId)) {
    await member.roles.add(roleId, `Bot Supreme grant (30 days)`);
  }

  // Restore the same linked custom role on the owner + prior recipients.
  await reequipCustomRoleHolders(
    member.guild,
    member.id,
    "Supreme re-granted — restore custom role",
  ).catch((err) =>
    console.warn("[supreme] Custom role re-equip failed:", err),
  );

  return row;
}

export async function deactivateSupremeGrant(
  guildId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("SupremeGrants")
    .update({ active: false })
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("active", true);
}

/**
 * Month ended (or early revoke of a bot grant):
 * - Remove Supreme Discord role
 * - Delete the owner's custom role (Discord + DB), unless they still have Mythic
 * - Deactivate the grant
 */
export async function revokeBotSupreme(
  guild: Guild,
  userId: string,
  reason: string,
): Promise<void> {
  // Deactivate first so GuildMemberUpdate does not re-enter.
  await deactivateSupremeGrant(guild.id, userId);

  const roleId = ROLE_IDS.supreme;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member && roleId && member.roles.cache.has(roleId)) {
    await member.roles
      .remove(roleId, reason)
      .catch((err) => console.warn("[supreme] Remove Supreme failed:", err));
  }

  // Keep custom role if they still hold Mythic after Supreme is removed.
  const stillMythic = member ? hasMythic(member) : false;
  if (stillMythic) {
    console.log(
      `[supreme] Revoked Supreme for ${userId} but kept custom role (still Mythic).`,
    );
  } else {
    await destroyOwnerCustomRole(guild, userId, reason).catch((err) =>
      console.warn("[supreme] Custom role destroy failed:", err),
    );
  }

  console.log(`[supreme] Revoked bot Supreme for ${userId} in ${guild.id}: ${reason}`);
}

/**
 * Member left: strip their custom role from everyone, clear bot grant.
 * Discord already removes their roles; they must obtain Supreme again on return.
 * Custom role object is kept.
 */
export async function handleSupremeOwnerLeave(
  guild: Guild,
  userId: string,
): Promise<void> {
  await stripCustomRoleHolders(
    guild,
    userId,
    "Supreme owner left — custom role stripped from holders",
  );
  await deactivateSupremeGrant(guild.id, userId);
}

export async function listExpiredBotGrants(): Promise<SupremeGrantRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("SupremeGrants")
    .select("*")
    .eq("active", true)
    .eq("source", "bot")
    .not("expiresAt", "is", null)
    .lte("expiresAt", now);
  if (error) throw new Error(`[supabase:listExpiredBotGrants] ${error.message}`);
  return (data as SupremeGrantRow[]) ?? [];
}

/** Process all expired bot grants across guilds the client is in. */
export async function processExpiredSupremeGrants(
  client: Client,
): Promise<number> {
  const expired = await listExpiredBotGrants();
  let n = 0;
  for (const grant of expired) {
    const guild = await client.guilds.fetch(grant.guildId).catch(() => null);
    if (!guild) {
      await deactivateSupremeGrant(grant.guildId, grant.userId);
      continue;
    }

    // Recurring Stripe Supreme/Mythic — extend instead of revoking.
    const recurring = await hasActiveStripeShopSub(grant.userId, [
      "supreme",
      "mythic",
    ]);
    if (recurring) {
      const member = await guild.members.fetch(grant.userId).catch(() => null);
      if (member) {
        await grantBotSupreme(member, {
          grantedBy: "stripe-renewal",
          durationMs: SUPREME_BOT_DURATION_MS,
        });
        console.log(
          `[supreme] Extended expired grant for ${grant.userId} — active Stripe subscription.`,
        );
        continue;
      }
    }

    await revokeBotSupreme(
      guild,
      grant.userId,
      "Bot Supreme expired (30 days)",
    );
    n += 1;
  }
  return n;
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let expiryInterval: ReturnType<typeof setInterval> | null = null;

export function startSupremeExpiryTicker(client: Client): void {
  stopSupremeExpiryTicker();
  const run = () => {
    void processExpiredSupremeGrants(client)
      .then((n) => {
        if (n > 0) console.log(`[supreme] Expired ${n} bot Supreme grant(s).`);
      })
      .catch((err) => console.error("[supreme] Expiry tick failed:", err));
  };
  // First pass shortly after boot, then hourly.
  expiryTimer = setTimeout(() => {
    run();
    expiryInterval = setInterval(run, 60 * 60_000);
  }, 15_000);
  console.log("[supreme] 30-day bot-grant expiry ticker scheduled.");
}

export function stopSupremeExpiryTicker(): void {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  if (expiryInterval) {
    clearInterval(expiryInterval);
    expiryInterval = null;
  }
}
