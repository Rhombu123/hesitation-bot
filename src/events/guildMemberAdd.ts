import type { GuildMember } from "discord.js";
import { restoreLevelRolesOnRejoin } from "../services/levelRoles.js";
import { onMemberJoinAntiRaid } from "../services/antiRaid.js";

/**
 * Progress (XP, currency points, reputation) is keyed by Discord user ID and
 * is never deleted on leave. On rejoin we only need to restore Discord roles
 * that were stripped when they left.
 */
export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  await onMemberJoinAntiRaid(member).catch((err) =>
    console.error("[antiRaid]", err),
  );
  await restoreLevelRolesOnRejoin(member);
}
