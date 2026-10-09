import { EmbedBuilder, type Message } from "discord.js";
import { ACTIONS } from "../config/actions.js";
import { COMS_CATALOG } from "../config/commandCatalog.js";
import {
  getAllowedActions,
  hasElite,
  hasMythic,
  hasSupreme,
  hasVip,
  isServerBooster,
} from "../config/rolePrivileges.js";
import { config } from "../config.js";
import { isStaffMember } from "../utils/staff.js";
import { getOrCreateStats } from "../services/xp.js";

const COMS_COLOR = 0x143b96;

function codeList(names: string[]): string {
  if (names.length === 0) return "_None_";
  return names.map((n) => `\`${n}\``).join(", ");
}

/**
 * Privilege-aware command list (Socialize-style).
 * Restricted to the level/credits channel.
 * Entries come from `commandCatalog.ts` — update that file when adding commands.
 */
export async function handleComsCommand(
  message: Message<true>,
): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    await message.reply("Could not load your member profile.");
    return;
  }

  const staff = isStaffMember(member);
  if (message.channelId !== config.levelCommandChannelId) {
    await message.reply(
      `Use \`!coms\` in <#${config.levelCommandChannelId}> only.`,
    );
    return;
  }

  const userStats = await getOrCreateStats(message.guildId, member.id);
  const allowed = getAllowedActions(member, userStats.level);
  const gifCmds = ACTIONS.filter((a) => allowed.has(a.name)).map((a) => a.name);
  const lockedCount = ACTIONS.length - gifCmds.length;
  const chatStar =
    member.roles.cache.has(config.topMessengerRoleId) ||
    member.roles.cache.has(config.lounge2ChatStarRoleId);
  const supreme = hasSupreme(member) || hasMythic(member) || staff;
  const mythic = hasMythic(member) || staff;

  const canSee = (audience: typeof COMS_CATALOG[number]["audience"]): boolean => {
    if (!audience || audience === "everyone") return true;
    if (audience === "chatstar") return chatStar || staff;
    if (audience === "supreme") return supreme;
    if (audience === "mythic") return mythic;
    if (audience === "staff") return staff;
    return true;
  };

  const line = (e: (typeof COMS_CATALOG)[number]) =>
    `${e.usage} — ${e.blurb}`;

  const personal = COMS_CATALOG.filter(
    (e) => e.section === "personal" && canSee(e.audience),
  ).map(line);
  const stats = COMS_CATALOG.filter(
    (e) => e.section === "stats" && canSee(e.audience),
  ).map(line);
  const games = COMS_CATALOG.filter(
    (e) => e.section === "games" && canSee(e.audience),
  ).map(line);
  const staffLines = COMS_CATALOG.filter(
    (e) => e.section === "staff" && canSee(e.audience),
  ).map(line);

  const sections: string[] = [];

  sections.push(
    [
      "👑 **GIF Commands**",
      gifCmds.length > 0 ? codeList(gifCmds) : "_None unlocked_",
      lockedCount > 0
        ? `_(+${lockedCount} locked — Booster / Elite / Supreme unlock more)_`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  sections.push(["🎨 **Personalization**", ...personal].join("\n"));
  sections.push(["📊 **Statistics**", ...stats].join("\n"));
  sections.push(
    [
      "🎮 **Games**",
      `_Auto-spawn in ${config.gamesChannelIds.map((id) => `<#${id}>`).join(" · ")} · spawners can start games in any channel_`,
      ...games,
    ].join("\n"),
  );

  if (staffLines.length > 0) {
    sections.push(["🛡️ **Staff**", ...staffLines].join("\n"));
  }

  const perks: string[] = [];
  if (isServerBooster(member)) perks.push("Booster");
  if (hasVip(member)) perks.push("VIP");
  if (hasElite(member)) perks.push("Elite");
  if (hasSupreme(member)) perks.push("Supreme");
  if (hasMythic(member)) perks.push("Mythic");
  if (staff) perks.push("Staff");

  const embed = new EmbedBuilder()
    .setColor(COMS_COLOR)
    .setTitle("⚙️ Available Commands")
    .setDescription(sections.join("\n\n"))
    .setFooter({
      text:
        perks.length > 0
          ? `Your access: ${perks.join(" · ")}`
          : "Your access: Default",
    })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}
