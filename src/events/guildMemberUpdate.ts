import type { GuildMember, PartialGuildMember } from "discord.js";
import { ROLE_IDS } from "../config/rolePrivileges.js";
import {
  isNewServerBoost,
  scheduleBoostAnnounceFallback,
} from "../services/boostAnnounce.js";
import { announceHelperPromotion } from "../services/helperPromo.js";
import {
  getActiveBotGrant,
  revokeBotSupreme,
} from "../services/supremeGrants.js";
import { reequipCustomRoleHolders } from "../services/customRoles.js";
import { tryHandleNicknameGameUpdate } from "../services/nicknameGame.js";

/**
 * - New server boost → schedule delayed fallback (system message posts first).
 * - Helper role gained → promo embed in helper channel.
 * - Nickname race win check.
 * - Bot-tracked Supreme removed early → unequip custom role / clear grant.
 * - Supreme gained again → re-equip linked custom role + prior recipients.
 */
export async function onGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  if (isNewServerBoost(oldMember, newMember)) {
    console.log(
      `[boost] Member update boost signal for ${newMember.user.tag} — ` +
        `waiting for system message (fallback in 5s)`,
    );
    scheduleBoostAnnounceFallback(newMember);
  }

  await announceHelperPromotion(oldMember, newMember).catch((err) =>
    console.error("[helperPromo] announce failed:", err),
  );

  await tryHandleNicknameGameUpdate(oldMember, newMember).catch((err) =>
    console.error("[nicknameGame] update handler failed:", err),
  );

  const supremeId = ROLE_IDS.supreme;
  if (!supremeId) return;

  const had =
    oldMember.roles?.cache?.has(supremeId) ??
    (Array.isArray(oldMember.roles)
      ? oldMember.roles.includes(supremeId)
      : false);
  const has = newMember.roles.cache.has(supremeId);

  if (!had && has) {
    await reequipCustomRoleHolders(
      newMember.guild,
      newMember.id,
      "Supreme restored — re-equip custom role",
    ).catch((err) =>
      console.warn("[supreme] Custom role re-equip on role add failed:", err),
    );
    return;
  }

  if (!had || has) return;

  const grant = await getActiveBotGrant(newMember.guild.id, newMember.id).catch(
    () => null,
  );
  if (!grant) {
    // Manual Supreme — leave custom role alone.
    return;
  }

  await revokeBotSupreme(
    newMember.guild,
    newMember.id,
    "Bot Supreme removed early — custom role unequipped",
  );
}
