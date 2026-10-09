import { EmbedBuilder, type Message } from "discord.js";
import { ROLE_IDS } from "../config/rolePrivileges.js";
import { announceDonation } from "../services/donationAnnounce.js";
import {
  getActiveBotGrant,
  grantBotSupreme,
  revokeBotSupreme,
} from "../services/supremeGrants.js";
import {
  getTimedRoleGrant,
  grantTimedPaidRole,
  revokeTimedPaidRole,
  type PaidRoleKind,
} from "../services/timedRoleGrants.js";
import { isStaffMember } from "../utils/staff.js";

type GiveKind = "vip" | "elite" | "supreme" | "mythic";

async function resolveTargetMember(
  message: Message<true>,
  args: string[],
): Promise<import("discord.js").GuildMember | null> {
  let target =
    message.mentions.members?.filter((m) => m.id !== message.author.id).first() ??
    null;
  if (!target) {
    const raw = args[0]?.replace(/[<@!>]/g, "");
    if (raw && /^\d{15,21}$/.test(raw)) {
      target = await message.guild.members.fetch(raw).catch(() => null);
    }
  }
  return target;
}

function parsePaidKind(raw: string | undefined): GiveKind | null {
  const k = (raw ?? "").toLowerCase();
  if (k === "vip") return "vip";
  if (k === "elite") return "elite";
  if (k === "supreme") return "supreme";
  if (k === "mythic") return "mythic";
  return null;
}

function roleIdFor(kind: GiveKind): string {
  switch (kind) {
    case "vip":
      return ROLE_IDS.vip;
    case "elite":
      return ROLE_IDS.elite;
    case "supreme":
      return ROLE_IDS.supreme;
    case "mythic":
      return ROLE_IDS.mythic;
  }
}

function labelFor(kind: GiveKind): string {
  switch (kind) {
    case "vip":
      return "VIP";
    case "elite":
      return "Elite";
    case "supreme":
      return "Supreme";
    case "mythic":
      return "Mythic";
  }
}

/**
 * Staff: `!give vip|elite|supreme|mythic @user` — bot-tracked paid role for 30 days.
 * Also supports legacy `!givesupreme @user`.
 */
export async function handleGiveCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const author =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!author || !isStaffMember(author)) {
    await message.reply("Staff only.");
    return;
  }

  const kind = parsePaidKind(args[0]);
  if (!kind) {
    await message.reply(
      "Usage: `!give vip @user` · `!give elite @user` · `!give supreme @user` · `!give mythic @user`",
    );
    return;
  }

  await grantPaidTier(message, kind, args.slice(1));
}

/** Legacy alias: `!givesupreme @user` */
export async function handleGiveSupremeCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const author =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!author || !isStaffMember(author)) {
    await message.reply("Staff only.");
    return;
  }
  await grantPaidTier(message, "supreme", args);
}

async function grantPaidTier(
  message: Message<true>,
  kind: GiveKind,
  targetArgs: string[],
): Promise<void> {
  const roleId = roleIdFor(kind);
  const label = labelFor(kind);

  if (!roleId) {
    await message.reply(`${label} role ID is not configured.`);
    return;
  }

  const target = await resolveTargetMember(message, targetArgs);
  if (!target) {
    await message.reply(`Usage: \`!give ${kind} @user\``);
    return;
  }

  try {
    let expiresAt: string | null;
    if (kind === "supreme") {
      const grant = await grantBotSupreme(target, {
        grantedBy: message.author.id,
      });
      expiresAt = grant.expiresAt;
    } else {
      const grant = await grantTimedPaidRole(target, kind as PaidRoleKind);
      expiresAt = grant.expiresAt;
    }

    await announceDonation(target, kind).catch((err) =>
      console.error(`[give ${kind}] donation announce failed:`, err),
    );

    const exp = expiresAt
      ? `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`
      : "unknown";

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x143b96)
          .setDescription(
            [
              `Gave <@&${roleId}> to <@${target.id}> for **30 days** (bot-tracked).`,
              `Expires ${exp}.`,
              "",
              "_Manual Discord role adds are not tracked and never auto-expire._",
            ].join("\n"),
          ),
      ],
      allowedMentions: { users: [target.id] },
    });
  } catch (err) {
    console.error(`[give ${kind}]`, err);
    await message.reply(
      err instanceof Error ? err.message : `Failed to grant ${label}.`,
    );
  }
}

/**
 * Staff: `!revoke vip|elite|supreme|mythic @user` — revoke bot-tracked paid role early.
 */
export async function handleRevokeCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const author =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!author || !isStaffMember(author)) {
    await message.reply("Staff only.");
    return;
  }

  const kind = parsePaidKind(args[0]);
  if (!kind) {
    await message.reply(
      "Usage: `!revoke vip @user` · `!revoke elite @user` · `!revoke supreme @user` · `!revoke mythic @user`",
    );
    return;
  }

  await revokePaidTier(message, kind, args.slice(1));
}

/** Legacy alias: `!removesupreme @user` */
export async function handleRemoveSupremeCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const author =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!author || !isStaffMember(author)) {
    await message.reply("Staff only.");
    return;
  }
  await revokePaidTier(message, "supreme", args);
}

/**
 * Staff: `!remove vip|elite|mythic @user` — legacy alias for timed paid revoke.
 * Supreme still works via `!remove supreme` / `!revoke supreme`.
 */
export async function handleRemovePaidCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const author =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!author || !isStaffMember(author)) {
    await message.reply("Staff only.");
    return;
  }

  const kind = parsePaidKind(args[0]);
  if (!kind) {
    await message.reply(
      "Usage: `!remove vip @user` · `!remove elite @user` · `!remove supreme @user` · `!remove mythic @user`\n(Or use `!revoke …`)",
    );
    return;
  }

  await revokePaidTier(message, kind, args.slice(1));
}

async function revokePaidTier(
  message: Message<true>,
  kind: GiveKind,
  targetArgs: string[],
): Promise<void> {
  const roleId = roleIdFor(kind);
  const label = labelFor(kind);

  if (!roleId) {
    await message.reply(`${label} role ID is not configured.`);
    return;
  }

  const target = await resolveTargetMember(message, targetArgs);
  if (!target) {
    await message.reply(`Usage: \`!revoke ${kind} @user\``);
    return;
  }

  if (kind === "supreme") {
    const grant = await getActiveBotGrant(message.guildId, target.id).catch(
      () => null,
    );
    if (!grant) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x143b96)
            .setDescription(
              [
                `<@${target.id}> has no **bot-tracked** Supreme grant.`,
                "Only `!give supreme` / credits / Stripe Supreme can be removed with this command.",
                "If they have Supreme from a manual role add, remove the Discord role yourself.",
              ].join("\n"),
            ),
        ],
        allowedMentions: { users: [target.id] },
      });
      return;
    }

    try {
      await revokeBotSupreme(
        message.guild,
        target.id,
        `Removed by ${message.author.tag} via !revoke supreme`,
      );
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x143b96)
            .setDescription(
              [
                `Removed <@&${ROLE_IDS.supreme}> from <@${target.id}>.`,
                "Custom role holders were stripped (role kept for when they get Supreme again).",
              ].join("\n"),
            ),
        ],
        allowedMentions: { users: [target.id] },
      });
    } catch (err) {
      console.error("[revoke supreme]", err);
      await message.reply(
        err instanceof Error ? err.message : "Failed to remove Supreme.",
      );
    }
    return;
  }

  const timedKind = kind as PaidRoleKind;
  const grant = await getTimedRoleGrant(
    message.guildId,
    target.id,
    timedKind,
  ).catch(() => null);
  if (!grant?.active) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x143b96)
          .setDescription(
            [
              `<@${target.id}> has no **bot-tracked** ${label} grant.`,
              `Only \`!give ${kind}\` / credits / Stripe ${label} can be removed with this command.`,
            ].join("\n"),
          ),
      ],
      allowedMentions: { users: [target.id] },
    });
    return;
  }

  try {
    await revokeTimedPaidRole(
      message.guild,
      target.id,
      timedKind,
      `Removed by ${message.author.tag} via !revoke ${kind}`,
    );
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x143b96)
          .setDescription(`Removed <@&${roleId}> from <@${target.id}>.`),
      ],
      allowedMentions: { users: [target.id] },
    });
  } catch (err) {
    console.error(`[revoke ${kind}]`, err);
    await message.reply(
      err instanceof Error ? err.message : `Failed to remove ${label}.`,
    );
  }
}
