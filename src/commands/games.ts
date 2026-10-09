import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type GuildMember,
  type Interaction,
  type Message,
  type TextChannel,
} from "discord.js";
import { EMBED_COLOR, GAMES_SPAWN_ROLE_IDS, config } from "../config.js";
import { hasSupremeAccess } from "../config/rolePrivileges.js";
import {
  claimCooldownMs,
  cooldownRemainingMs,
} from "../db/redis.js";
import { randomInt } from "../utils/helpers.js";
import {
  GAME_SPAWN_OPTIONS,
  getRecentChatterIds,
  isChannelGameActive,
  spawnGameByKind,
  type GameKind,
} from "../services/gameAutoSpawn.js";
import {
  rejectUnlessGamesDropLounge,
  isGamesDropLounge,
} from "../utils/gamesChannel.js";
import { canSpawnGames, hasSeniorMod, NO_SPAWN_GAMES_PERMISSION } from "../utils/staff.js";
import { isAppealsGuild } from "../utils/appealsGuild.js";

const SUPREME_GAME_COOLDOWN_MS = 30 * 60_000;
/** Yellow — matches Socialize “Game Drop Is Recharging” embed. */
const RECHARGE_EMBED_COLOR = 0xf0b232;
const GAMES_SELECT_PREFIX = "games:spawn:";

function canDropGames(member: GuildMember): boolean {
  if (hasSupremeAccess(member) || canSpawnGames(member) || hasSeniorMod(member)) {
    return true;
  }
  return member.roles.cache.some((role) => GAMES_SPAWN_ROLE_IDS.has(role.id));
}

function supremeSpawnRedisKey(
  guildId: string,
  channelId: string,
  userId: string,
): string {
  return `cd:games:${guildId}:${channelId}:${userId}`;
}

async function msUntilSupremeSpawn(
  guildId: string,
  channelId: string,
  userId: string,
): Promise<number> {
  return cooldownRemainingMs(supremeSpawnRedisKey(guildId, channelId, userId));
}

async function claimSupremeSpawnCooldown(
  guildId: string,
  channelId: string,
  userId: string,
): Promise<void> {
  await claimCooldownMs(
    supremeSpawnRedisKey(guildId, channelId, userId),
    SUPREME_GAME_COOLDOWN_MS,
  );
}

function gameListLines(): string[] {
  const items = GAME_SPAWN_OPTIONS;
  return items.map((g, i) => {
    const branch = i === items.length - 1 ? "└" : "├";
    return `${branch} ${g.emoji} **${g.label}**`;
  });
}

function buildRechargingEmbed(opts: {
  channelId: string;
  availableAtUnix: number;
  iconURL?: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(RECHARGE_EMBED_COLOR)
    .setAuthor({
      name: "Game Drop Is Recharging",
      ...(opts.iconURL ? { iconURL: opts.iconURL } : {}),
    })
    .setDescription(
      [
        `📌 **Lounge:** 📍 <#${opts.channelId}>`,
        `📅 **Available:** <t:${opts.availableAtUnix}:R>`,
      ].join("\n"),
    );
}

function buildGamesPayload(ownerId: string, iconURL?: string) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: "Supreme Game Drop",
      ...(iconURL ? { iconURL } : {}),
    })
    .setDescription(
      [
        "📌 **Drop in any channel** in this server",
        "⌛ **Cooldown:** `30 minutes` **per channel**",
        "",
        "🎮 **Choose a game to drop**",
        ...gameListLines(),
      ].join("\n"),
    );

  const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${GAMES_SELECT_PREFIX}${ownerId}`)
      .setPlaceholder("Select A Game To Drop")
      .addOptions(
        GAME_SPAWN_OPTIONS.map((g) => ({
          label: g.label,
          value: g.kind,
          emoji: g.emoji,
          description: g.description.slice(0, 100),
        })),
      ),
  );

  return { embeds: [embed], components: [select] };
}

export async function handleGamesCommand(message: Message<true>): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Games only work in server text channels.");
    return;
  }
  if (await rejectUnlessGamesDropLounge(message)) return;

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    await message.reply("Could not load your member profile.");
    return;
  }
  if (!canDropGames(member)) {
    await message.reply(NO_SPAWN_GAMES_PERMISSION);
    return;
  }

  const wait = await msUntilSupremeSpawn(
    message.guildId,
    message.channelId,
    member.id,
  );
  if (wait > 0) {
    const iconURL = message.client.user?.displayAvatarURL({ size: 128 });
    await message.reply({
      embeds: [
        buildRechargingEmbed({
          channelId: message.channelId,
          availableAtUnix: Math.floor((Date.now() + wait) / 1000),
          iconURL,
        }),
      ],
    });
    return;
  }

  const iconURL = message.client.user?.displayAvatarURL({ size: 128 });
  await message.reply(buildGamesPayload(member.id, iconURL));
}

/**
 * `!random` — spawn a random mini-game (same access + 30m cooldown as `!games`).
 */
export async function handleRandomGameCommand(
  message: Message<true>,
): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Games only work in server text channels.");
    return;
  }
  if (await rejectUnlessGamesDropLounge(message)) return;

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    await message.reply("Could not load your member profile.");
    return;
  }
  if (!canDropGames(member)) {
    await message.reply(NO_SPAWN_GAMES_PERMISSION);
    return;
  }

  const wait = await msUntilSupremeSpawn(
    message.guildId,
    message.channelId,
    member.id,
  );
  if (wait > 0) {
    const iconURL = message.client.user?.displayAvatarURL({ size: 128 });
    await message.reply({
      embeds: [
        buildRechargingEmbed({
          channelId: message.channelId,
          availableAtUnix: Math.floor((Date.now() + wait) / 1000),
          iconURL,
        }),
      ],
    });
    return;
  }

  if (isChannelGameActive(message.channelId)) {
    await message.reply("A game is already running in this channel.");
    return;
  }

  const channel = message.channel as TextChannel;
  const options = [...GAME_SPAWN_OPTIONS].sort(() => Math.random() - 0.5);
  const preferred = options[randomInt(0, options.length - 1)]!;
  const tryOrder = [
    preferred,
    ...options.filter((g) => g.kind !== preferred.kind),
  ];

  let started: GameKind | null = null;
  for (const opt of tryOrder) {
    if (isChannelGameActive(channel.id)) break;
    const ok = await trySpawnSelectedGame(channel, opt.kind, member.id);
    if (ok.ok) {
      started = opt.kind;
      break;
    }
  }

  if (!started) {
    await message.reply("Couldn't start a random game right now. Try again.");
    return;
  }

  await claimSupremeSpawnCooldown(
    message.guildId,
    message.channelId,
    member.id,
  );
}

async function trySpawnSelectedGame(
  channel: TextChannel,
  kind: GameKind,
  triggeredBy: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (isChannelGameActive(channel.id)) {
    return { ok: false, reason: "A game is already running in this channel." };
  }

  const chatterIds = getRecentChatterIds(channel.id, 5);
  const started = await spawnGameByKind(kind, channel, chatterIds);
  if (!started) {
    return { ok: false, reason: "Couldn't start that game right now." };
  }

  console.log(`[games] Supreme ${triggeredBy} spawned ${kind} in ${channel.id}`);
  return { ok: true };
}

export async function onGamesInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.isStringSelectMenu()) return false;
  if (!interaction.customId.startsWith(GAMES_SELECT_PREFIX)) return false;
  if (!interaction.inGuild() || !interaction.guild || !interaction.channel) {
    await interaction.reply({
      content: "Use this in a server.",
      ephemeral: true,
    });
    return true;
  }

  const ownerId = interaction.customId.slice(GAMES_SELECT_PREFIX.length);
  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "This panel is not for you",
      ephemeral: true,
    });
    return true;
  }

  const member = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  if (!member || !canDropGames(member)) {
    await interaction.reply({
      content: NO_SPAWN_GAMES_PERMISSION,
      ephemeral: true,
    });
    return true;
  }

  if (
    !interaction.channel.isTextBased() ||
    interaction.channel.isDMBased() ||
    !("send" in interaction.channel)
  ) {
    await interaction.reply({
      content: "Games can only be dropped in a text channel.",
      ephemeral: true,
    });
    return true;
  }

  if (isAppealsGuild(interaction.guildId)) {
    await interaction.reply({
      content: "Games are disabled in the Appeals server.",
      ephemeral: true,
    });
    return true;
  }

  if (!isGamesDropLounge(interaction.channelId)) {
    await interaction.reply({
      content: `Drop games only in <#${config.lounge1ChannelId}> or <#${config.lounge2ChannelId}>.`,
      ephemeral: true,
    });
    return true;
  }

  const wait = await msUntilSupremeSpawn(
    interaction.guildId,
    interaction.channelId,
    member.id,
  );
  if (wait > 0) {
    const iconURL = interaction.client.user?.displayAvatarURL({ size: 128 });
    await interaction.reply({
      embeds: [
        buildRechargingEmbed({
          channelId: interaction.channelId,
          availableAtUnix: Math.floor((Date.now() + wait) / 1000),
          iconURL,
        }),
      ],
      ephemeral: true,
    });
    return true;
  }

  const kind = interaction.values[0] as GameKind;
  if (!GAME_SPAWN_OPTIONS.some((g) => g.kind === kind)) {
    await interaction.reply({ content: "Unknown game.", ephemeral: true });
    return true;
  }

  await interaction.deferUpdate();

  const result = await trySpawnSelectedGame(
    interaction.channel as TextChannel,
    kind,
    interaction.user.id,
  );

  if (result.ok) {
    await claimSupremeSpawnCooldown(
      interaction.guildId,
      interaction.channelId,
      member.id,
    );
    const label =
      GAME_SPAWN_OPTIONS.find((g) => g.kind === kind)?.label ?? kind;
    await interaction.followUp({
      content: `⚡ Dropped **${label}**!`,
      ephemeral: true,
    });
    return true;
  }

  await interaction.followUp({
    content: result.reason ?? "Couldn't start that game.",
    ephemeral: true,
  });
  return true;
}
