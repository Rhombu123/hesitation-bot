import type { GuildMember, PartialGuildMember } from "discord.js";
import {
  deactivateSupremeGrant,
  getActiveBotGrant,
  handleSupremeOwnerLeave,
} from "../services/supremeGrants.js";
import { getCustomRoleByOwner } from "../services/customRoles.js";

/**
 * On leave: strip owned custom role from everyone (role kept), clear bot grant.
 * They must obtain Supreme again after rejoining.
 */
export async function onGuildMemberRemove(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const guild = member.guild;
  const userId = member.id;

  const owned = await getCustomRoleByOwner(guild.id, userId).catch(() => null);
  if (owned) {
    await handleSupremeOwnerLeave(guild, userId);
    return;
  }

  const grant = await getActiveBotGrant(guild.id, userId).catch(() => null);
  if (grant) {
    await deactivateSupremeGrant(guild.id, userId);
    console.log(
      `[supreme] Cleared bot grant for ${userId} on leave (no custom role).`,
    );
  }
}
