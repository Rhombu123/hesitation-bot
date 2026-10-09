import {
  AttachmentBuilder,
  EmbedBuilder,
  type GuildMember,
  type Message,
} from "discord.js";
import { EMBED_COLOR } from "../config.js";
import { type ActionDef } from "../config/actions.js";
import {
  actionDeniedRequirement,
  canUseAction,
  hasSupremeAccess,
  ROLE_IDS,
} from "../config/rolePrivileges.js";
import { fetchActionGifAttachment, COUNTABLE_ACTION_GIF_LIMIT } from "../services/actionGifs.js";
import { incrementActionReceived } from "../services/actionStats.js";
import { getOrCreateStats } from "../services/xp.js";
import { rejectUnlessActionChannel } from "../utils/actionChannel.js";
import { isStaffMember } from "../utils/staff.js";

const DENY_COLOR = 0x143b96;

/** Resolve who receives the action: mention → reply author → arg ID. */
async function resolveActionTarget(
  message: Message<true>,
  args: string[],
): Promise<GuildMember | null> {
  const mentioned = message.mentions.members?.first();
  if (mentioned) return mentioned;

  if (message.reference?.messageId) {
    const replied = await message.channel.messages
      .fetch(message.reference.messageId)
      .catch(() => null);
    if (replied && !replied.author.bot) {
      return message.guild.members.fetch(replied.author.id).catch(() => null);
    }
  }

  const raw = args[0]?.replace(/[<@!>]/g, "");
  if (raw && /^\d{15,21}$/.test(raw)) {
    return message.guild.members.fetch(raw).catch(() => null);
  }

  return null;
}

/** Build a one-off action def for Supreme/Mythic freeform `!anything @user`. */
export function buildCustomActionDef(cmd: string): ActionDef {
  const name = cmd.toLowerCase();
  let verb: string;
  if (/(?:s|x|z|ch|sh)$/.test(name)) verb = `${name}es`;
  else if (/[^aeiou]y$/.test(name)) verb = `${name.slice(0, -1)}ies`;
  else verb = `${name}s`;

  return {
    name,
    verb,
    noun: verb,
    emoji: "✨",
    label: name.charAt(0).toUpperCase() + name.slice(1),
  };
}

export function canUseCustomAction(member: GuildMember): boolean {
  return hasSupremeAccess(member) || isStaffMember(member);
}

export async function handleActionCommand(
  message: Message<true>,
  action: ActionDef,
  args: string[],
  opts: { countStats?: boolean } = {},
): Promise<void> {
  if (await rejectUnlessActionChannel(message)) return;

  const countStats = opts.countStats !== false;

  const actor =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!actor) {
    await message.reply("Could not load your member profile. Try again.");
    return;
  }

  if (countStats) {
    if (!canUseAction(actor, action.name, 0)) {
      const stats = await getOrCreateStats(message.guildId, actor.id);
      if (!canUseAction(actor, action.name, stats.level)) {
        const requirement = actionDeniedRequirement(action.name, actor);
        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(DENY_COLOR)
              .setDescription(
                `You must have ${requirement} to run this command`,
              ),
          ],
          allowedMentions: { parse: [] },
        });
        return;
      }
    }
  } else if (!canUseCustomAction(actor)) {
    await message.guild.roles.fetch().catch(() => null);
    const mythic = ROLE_IDS.mythic
      ? message.guild.roles.cache.get(ROLE_IDS.mythic)
      : undefined;
    const supreme = ROLE_IDS.supreme
      ? message.guild.roles.cache.get(ROLE_IDS.supreme)
      : undefined;
    const req = mythic
      ? `<@&${mythic.id}>`
      : supreme
        ? `<@&${supreme.id}>`
        : "**Supreme / Mythic**";
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(DENY_COLOR)
          .setDescription(`You must have ${req} to run this command`),
      ],
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Start GIF download while we resolve the target / update stats.
  // Countable actions: only sample the API's top 10 for this action
  // (avoids unrelated fallbacks like hug GIFs on !kill).
  const gifPromise = fetchActionGifAttachment(action.name, {
    useCustomPool: countStats,
    ...(countStats
      ? { topOnly: true, limit: COUNTABLE_ACTION_GIF_LIMIT }
      : {}),
  });

  const target = await resolveActionTarget(message, args);
  if (!target) {
    await message.reply(
      `Who should get that? Usage: \`!${action.name} @user\` (or reply to their message)`,
    );
    return;
  }

  if (target.id === actor.id) {
    await message.reply(
      `You can't \`!${action.name}\` yourself — pick someone else.`,
    );
    return;
  }

  const lines = [
    `**${actor.displayName}** ${action.verb} **${target.displayName}**! ${action.emoji}`,
  ];

  const [count, gif] = await Promise.all([
    countStats
      ? incrementActionReceived(message.guildId, target.id, action.name)
      : Promise.resolve(null),
    gifPromise,
  ]);

  if (count != null) {
    lines.push(
      `**${target.displayName}** has now received **${count}** ${action.noun}!`,
    );
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(lines.join("\n"));

  const files: AttachmentBuilder[] = [];
  if (gif) {
    files.push(new AttachmentBuilder(gif.buffer, { name: gif.name }));
    // Hosted by Discord — avoids broken embeds when Klipy CDN / Discord proxy fails.
    embed.setImage(`attachment://${gif.name}`);
  }

  await message.channel.send({
    content: `<@${target.id}>`,
    embeds: [embed],
    files,
    allowedMentions: { users: [target.id] },
  });
}
