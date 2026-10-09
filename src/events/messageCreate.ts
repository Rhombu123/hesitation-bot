import { handleBlessCommand } from "../commands/bless.js";
import { handleBoostCommand } from "../commands/boost.js";
import { handleShopCommand } from "../commands/shop.js";
import { handleJailCommand, handleBailCommand, handleImmunityCommand } from "../commands/jail.js";
import { handleFindCommand } from "../commands/find.js";
import { handleGamesCommand, handleRandomGameCommand } from "../commands/games.js";
import { handleInventoryCommand } from "../commands/inventory.js";
import { handleCreditsCommand } from "../commands/credits.js";
import { handleLootCommand } from "../commands/loot.js";
import { handlePostRolesCommand } from "../commands/postRoles.js";
import { handleLeaderboardCommand } from "../commands/leaderboard.js";
import { handleLevelCommand } from "../commands/level.js";
import { handleLightCommand } from "../commands/light.js";
import { handleLtopCommand } from "../commands/ltop.js";
import { handleMessagesCommand } from "../commands/messages.js";
import { handlePointsCommand } from "../commands/points.js";
import { handlePrizesCommand } from "../commands/prizes.js";
import { handleRemoveXpCommand } from "../commands/removexp.js";
import { handleRepCommand, tryHandleGiveRep } from "../commands/rep.js";
import { handleStatCommand } from "../commands/stat.js";
import { handleActionsCommand } from "../commands/actionsLb.js";
import { handleVoteCommand } from "../commands/vote.js";
import { handleActionCommand, buildCustomActionDef, canUseCustomAction } from "../commands/action.js";
import { isActionCommand, getAction } from "../config/actions.js";
import { config } from "../config.js";
import { claimCooldownMs, claimEventOnce } from "../db/redis.js";
import { recordChatMessage } from "../services/chatMessageStats.js";
import { noteChatActivity, isChannelGameActive } from "../services/gameAutoSpawn.js";
import { tryEmojiEqGuess } from "../services/emojiEqGame.js";
import { tryEmojiRaceGuess } from "../services/emojiRaceGame.js";
import { tryFlagGuess } from "../services/flagGame.js";
import { tryWordReverseGuess } from "../services/wordReverseGame.js";
import { tryStateGuess } from "../services/stateGame.js";
import { tryLangGuess } from "../services/langGame.js";
import { addXp } from "../services/xp.js";
import { rejectUnlessActionChannel } from "../utils/actionChannel.js";
import { randomInt } from "../utils/helpers.js";
import { isStaffMember } from "../utils/staff.js";
import type { Message } from "discord.js";
import { handleAddXpCommand } from "../commands/addxp.js";
import { handleColorCommand } from "../commands/color.js";
import { handleCrateCommand } from "../commands/crate.js";
import { handleDiceCommand } from "../commands/dice.js";
import { handleEditCommand } from "../commands/edit.js";
import { handleEmojiEqCommand } from "../commands/emojiEq.js";
import { handleEmojiRaceCommand } from "../commands/emojiRace.js";
import { handleBackCommand } from "../commands/back.js";
import { handleStateCommand } from "../commands/state.js";
import { handleFlagCommand } from "../commands/flag.js";
import { handleKnowledgeCommand } from "../commands/knowledge.js";
import { handleLangCommand } from "../commands/lang.js";
import { handleComsCommand } from "../commands/coms.js";
import { handleGiveSupremeCommand, handleRemoveSupremeCommand, handleGiveCommand, handleRemovePaidCommand, handleRevokeCommand } from "../commands/giveSupreme.js";
import { handlePostApplyTagCommand } from "../commands/postApplyTag.js";
import { handlePostStaffAppCommand } from "../commands/postStaffApp.js";
import { handleLockdownCommand } from "../commands/lockdown.js";
import { handleQuoteCommand } from "../commands/quote.js";
import { handleReactCommand } from "../commands/react.js";
import { handleNickCommand } from "../commands/nick.js";
import { handleNicknameGameCommand } from "../commands/nicknameGame.js";
import { handleRoleCommand } from "../commands/role.js";
import { handleSetCommand } from "../commands/set.js";
import { handleUwuifyCommand } from "../commands/uwuify.js";
import { handleInvisibleCommand } from "../commands/invisible.js";
import { handleTrollCommand } from "../commands/troll.js";
import { tryAnnounceFromBoostSystemMessage } from "../services/boostAnnounce.js";
import { tryHandleDisboardBump } from "../services/bumpReminder.js";
import { getPingReactionSetsForUsers } from "../services/pingReactions.js";
import { tryHandleInvisibleMessage } from "../services/invisible.js";
import { tryHandleUwuifyMessage } from "../services/uwuify.js";

/** Custom autoreacts when Chat Star is pinged. */
const CHAT_STAR_PING_REACTIONS = [
  "1533948814430437517",
  "1533949066969481216",
  "1533949496285855886",
] as const;

const LEVEL_ALIASES = new Set(["level", "rank", "xp", "lvl", "lvls"]);
const MESSAGES_ALIASES = new Set(["messages", "msgs", "msg", "mcount", "messagecount"]);
const ADD_XP_ALIASES = new Set(["addxp", "axp", "givexp"]);
const REMOVE_XP_ALIASES = new Set(["removexp", "rxp", "takexp"]);
const STAT_ALIASES = new Set(["stat", "stats"]);
const ACTIONS_LB_ALIASES = new Set([
  "actions",
  "actionlb",
  "actionslb",
  "top",
]);

/**
 * Economy / gambling-style commands — never treat as Supreme custom actions.
 * Silent no-op (no reply) when used.
 */
const CUSTOM_ACTION_BLOCKLIST = new Set([
  "dep",
  "with",
  "explore",
  "chance",
  "cf",
  "war",
  "give",
  "rob",
  "lb",
  "bal",
  "bj",
  "mines",
  "stack",
]);
const EDIT_ALIASES = new Set(["edit", "editrole", "chatstar"]);
const ROLE_ALIASES = new Set(["role", "roles", "crole"]);
const FLAG_ALIASES = new Set(["flag", "flaggame", "flags", "guessflag"]);
const LANG_ALIASES = new Set(["lang", "language", "languages", "guesslang"]);
const COLOR_ALIASES = new Set(["color", "colour", "colors", "colours", "colorgame"]);
const LIGHT_ALIASES = new Set([
  "green",
  "light",
  "stoplight",
  "traffic",
]);
const REACT_ALIASES = new Set(["react", "firstreact", "reactgame", "ftr"]);
const NICK_CHANGE_ALIASES = new Set([
  "nick",
  "nickname",
  "setnick",
  "changenick",
]);
const NICK_GAME_ALIASES = new Set([
  "nickgame",
  "nicknamegame",
  "namenick",
]);
const COMS_ALIASES = new Set(["coms", "commands", "cmds", "help"]);
const QUOTE_ALIASES = new Set(["quote", "makequote", "q"]);
const UWUIFY_ALIASES = new Set(["uwuify", "uwu", "owoify"]);
const INVISIBLE_ALIASES = new Set(["invisible", "invis", "ghost"]);
const TROLL_ALIASES = new Set(["troll", "trolls"]);
const VOTE_ALIASES = new Set([
  "vote",
  "voting",
  "votemachine",
  "repvote",
  "whodeserves",
]);
const CRATE_ALIASES = new Set(["crate", "lootcrate", "mysteriouscrate"]);
const EMOJI_EQ_ALIASES = new Set([
  "eq",
  "equation",
  "emojieq",
  "emojimath",
]);
const BACK_ALIASES = new Set(["back", "backwards", "wordrev", "reverse"]);
const STATE_ALIASES = new Set(["state", "statement", "typephrase"]);
const EMOJI_RACE_ALIASES = new Set(["emoji", "emojirace", "raceemoji"]);
const DICE_ALIASES = new Set(["dice", "roll", "diceroll"]);
const KNOWLEDGE_ALIASES = new Set([
  "knowledge",
  "trivia",
  "quiz",
  "gk",
  "generalknowledge",
]);
const REP_ALIASES = new Set(["rep", "reputation", "reps"]);
const POINTS_ALIASES = new Set(["points", "point", "balance", "currency"]);
const PRIZES_ALIASES = new Set([
  "prizes",
  "prize",
  "rewards",
  "reward",
  "rarities",
  "rarity",
]);
const CREDITS_ALIASES = new Set(["credits", "credit", "redeem"]);
const LOOT_ALIASES = new Set(["loot", "loots", "lootroles"]);
const FIND_ALIASES = new Set(["find", "search", "lootfind"]);
const INVENTORY_ALIASES = new Set(["inventory", "inv", "items", "bag"]);
const SET_ALIASES = new Set(["set", "pingreact", "setreact"]);
const BOOST_ALIASES = new Set(["boost", "roleboost", "boostrole"]);
const SHOP_ALIASES = new Set(["shop", "roleshop", "buydonor"]);
const BLESS_ALIASES = new Set(["bless", "blessing"]);
const JAIL_ALIASES = new Set(["jail"]);
const BAIL_ALIASES = new Set(["bail", "unjail"]);
const IMMUNITY_ALIASES = new Set(["immunity", "jailimmunity"]);
const GAMES_ALIASES = new Set(["games", "game", "gamedrop", "dropgame"]);
const RANDOM_GAME_ALIASES = new Set(["random", "rng", "randomgame"]);
const GAMES_LB_ALIASES = new Set([
  "gameslb",
  "gamesleaderboard",
  "glb",
  "pointslb",
  "pointsleaderboard",
  "genius",
  "geniuslb",
  "weeklypoints",
]);
const POPULAR_ALIASES = new Set([
  "popular",
  "popularlb",
  "mostpopular",
  "replb",
  "weeklyrep",
]);
const LEADERBOARD_ALIASES = new Set([
  "leaderboard",
  "levels",
  "toplevel",
]);

function messageXpCooldownKey(guildId: string, userId: string): string {
  return `cd:msgxp:${guildId}:${userId}`;
}

function actionCooldownRedisKey(key: string): string {
  return `cd:action:${key}`;
}

async function runCommand(
  name: string,
  message: Message<true>,
  handler: () => Promise<void>,
): Promise<void> {
  try {
    await handler();
  } catch (err) {
    console.error(`[command:${name}] failed for ${message.author.tag}:`, err);
    await message
      .reply("Something went wrong while running that command. Please try again in a moment.")
      .catch(() => {});
  }
}

/**
 * When someone is @mentioned, apply their `.set` ping reaction emojis
 * (Elite+ presets). Explicit mentions only — not reply pings.
 */
async function reactIfPingReactionSet(message: Message<true>): Promise<void> {
  // Explicit @mentions only (including self-pings) — not reply-to pings.
  const explicitIds = [
    ...new Set(
      [...message.content.matchAll(/<@!?(\d{15,21})>/g)].map((m) => m[1]!),
    ),
  ];

  if (explicitIds.length === 0) return;

  const sets = await getPingReactionSetsForUsers(message.guildId, explicitIds);
  if (sets.size === 0) return;

  const applied = new Set<string>();
  for (const userId of explicitIds) {
    const emojis = sets.get(userId);
    if (!emojis) continue;
    for (const emoji of emojis) {
      if (applied.has(emoji.react)) continue;
      applied.add(emoji.react);
      await message.react(emoji.react).catch((err) =>
        console.warn(`[set] Failed to react ${emoji.react}:`, err),
      );
    }
  }
}

async function reactIfChatStarMentioned(message: Message<true>): Promise<void> {
  const chatStarIds = [
    config.topMessengerRoleId,
    config.lounge2ChatStarRoleId,
  ].filter((id): id is string => Boolean(id));
  if (chatStarIds.length === 0) return;

  const rolePinged = chatStarIds.some((id) => message.mentions.roles.has(id));

  // Only explicit @mentions in the message text — not reply-to pings.
  const explicitIds = new Set(
    [...message.content.matchAll(/<@!?(\d{15,21})>/g)].map((m) => m[1]!),
  );

  let shouldReact = rolePinged;
  if (!shouldReact && explicitIds.size > 0) {
    for (const userId of explicitIds) {
      let member =
        message.mentions.members?.get(userId) ??
        message.guild.members.cache.get(userId) ??
        null;
      if (!member || !chatStarIds.some((id) => member!.roles.cache.has(id))) {
        member = await message.guild.members.fetch(userId).catch(() => null);
      }
      if (member && chatStarIds.some((id) => member!.roles.cache.has(id))) {
        shouldReact = true;
        break;
      }
    }
  }

  if (!shouldReact) return;

  for (const emoji of CHAT_STAR_PING_REACTIONS) {
    await message.react(emoji).catch((err) =>
      console.warn(`[chatstar] Failed to react ${emoji}:`, err),
    );
  }
}

export async function onMessageCreate(message: Message): Promise<void> {
  // Note: intentionally NOT requiring message.member — it can be null for
  // uncached members, which previously made commands silently no-op.
  if (!message.inGuild()) return;

  if (message.author.bot) {
    void tryHandleDisboardBump(message.client, message as Message<true>).catch(
      (err) => console.error("[bump] bump-bot handler failed:", err),
    );
    if (await tryAnnounceFromBoostSystemMessage(message)) return;
    return;
  }

  // Only one replica may process a given user message (deploy overlap / multi-replica).
  if (!(await claimEventOnce("msg", message.id))) return;

  // Server boost system messages → perk announce channel
  if (await tryAnnounceFromBoostSystemMessage(message)) return;

  // Sparkle reactions when Chat Star is pinged
  void reactIfChatStarMentioned(message).catch((err) =>
    console.error("[chatstar] ping reactions failed:", err),
  );

  // Custom ping reactions from `.set` (Supreme / Mythic)
  void reactIfPingReactionSet(message).catch((err) =>
    console.error("[set] ping reactions failed:", err),
  );

  // Lounge invisible / uwuify: delete + webhook-repost (before commands).
  try {
    const invisible = await tryHandleInvisibleMessage(message);
    if (invisible) {
      try {
        await recordChatMessage(
          message.guildId,
          message.author.id,
          message.channelId,
        );
        const amount = randomInt(config.messageXpMin, config.messageXpMax);
        await addXp(
          message.client,
          message.guildId,
          message.author.id,
          amount,
          message.member,
        );
      } catch (err) {
        console.error("[invisible] failed to record stats/XP:", err);
      }
      return;
    }
  } catch (err) {
    console.error("[invisible] intercept failed:", err);
  }

  try {
    const uwuified = await tryHandleUwuifyMessage(message);
    if (uwuified) {
      try {
        await recordChatMessage(
          message.guildId,
          message.author.id,
          message.channelId,
        );
        const amount = randomInt(config.messageXpMin, config.messageXpMax);
        await addXp(
          message.client,
          message.guildId,
          message.author.id,
          amount,
          message.member,
        );
      } catch (err) {
        console.error("[uwuify] failed to record stats/XP:", err);
      }
      return;
    }
  } catch (err) {
    console.error("[uwuify] intercept failed:", err);
  }

  const content = message.content.trim();

  // +rep / -rep (no prefix — matches Socialize-style screenshots)
  if (/^[+\-]rep(?:utation)?(?:\s|$)/i.test(content)) {
    await runCommand("+/-rep", message, async () => {
      const handled = await tryHandleGiveRep(message);
      if (!handled) {
        await message.reply("Couldn't parse that reputation command.");
      }
    });
    return;
  }

  // `.rep` / `.rep @user` (Socialize-style period prefix for check only)
  if (/^\.rep(?:utation|s)?(?:\s|$)/i.test(content)) {
    const without = content.slice(1).trim();
    const [, ...args] = without.split(/\s+/);
    await runCommand("rep", message, () => handleRepCommand(message, args));
    return;
  }

  // `.set 💬💞` — Supreme / Mythic ping reaction presets
  if (/^\.set(?:\s|$)/i.test(content)) {
    const without = content.slice(1).trim();
    const [, ...args] = without.split(/\s+/);
    await runCommand("set", message, () => handleSetCommand(message, args));
    return;
  }

  if (content.startsWith(config.prefix)) {
    const without = content.slice(config.prefix.length).trim();
    const [cmdRaw, ...args] = without.split(/\s+/);
    const cmd = (cmdRaw ?? "").toLowerCase();

    if (LEVEL_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleLevelCommand(message, args));
      return;
    }
    if (REP_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleRepCommand(message, args));
      return;
    }
    if (POINTS_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handlePointsCommand(message, args));
      return;
    }
    if (PRIZES_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handlePrizesCommand(message));
      return;
    }
    if (CREDITS_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleCreditsCommand(message, args));
      return;
    }
    if (LOOT_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleLootCommand(message));
      return;
    }
    if (FIND_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleFindCommand(message));
      return;
    }
    if (INVENTORY_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleInventoryCommand(message, args));
      return;
    }
    if (SET_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleSetCommand(message, args));
      return;
    }
    if (GAMES_LB_ALIASES.has(cmd) || POPULAR_ALIASES.has(cmd)) {
      await message.reply(
        `Weekly boards live in <#${config.geniusLeaderboardChannelId}> (Genius) and <#${config.popularLeaderboardChannelId}> (Most Popular) — update live.`,
      );
      return;
    }
    if (MESSAGES_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleMessagesCommand(message, args));
      return;
    }
    if (ADD_XP_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleAddXpCommand(message, args));
      return;
    }
    if (REMOVE_XP_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleRemoveXpCommand(message, args));
      return;
    }
    if (ACTIONS_LB_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleActionsCommand(message, args));
      return;
    }
    if (STAT_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleStatCommand(message, args));
      return;
    }
    if (EDIT_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleEditCommand(message));
      return;
    }
    if (ROLE_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleRoleCommand(message, args));
      return;
    }
    if (BOOST_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleBoostCommand(message, args));
      return;
    }
    if (SHOP_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleShopCommand(message));
      return;
    }
    if (BLESS_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleBlessCommand(message, args));
      return;
    }
    if (JAIL_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleJailCommand(message, args));
      return;
    }
    if (BAIL_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleBailCommand(message, args));
      return;
    }
    if (IMMUNITY_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () =>
        handleImmunityCommand(message, args),
      );
      return;
    }
    if (GAMES_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleGamesCommand(message));
      return;
    }
    if (RANDOM_GAME_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleRandomGameCommand(message));
      return;
    }
    if (cmd === "give") {
      await runCommand(cmd, message, () => handleGiveCommand(message, args));
      return;
    }
    if (cmd === "givesupreme" || cmd === "grantsupreme") {
      await runCommand(cmd, message, () =>
        handleGiveSupremeCommand(message, args),
      );
      return;
    }
    if (cmd === "revoke") {
      await runCommand(cmd, message, () => handleRevokeCommand(message, args));
      return;
    }
    if (
      cmd === "removesupreme" ||
      cmd === "takesupreme" ||
      cmd === "revokesupreme"
    ) {
      await runCommand(cmd, message, () =>
        handleRemoveSupremeCommand(message, args),
      );
      return;
    }
    if (cmd === "remove" || cmd === "removepaid") {
      await runCommand(cmd, message, () =>
        handleRemovePaidCommand(message, args),
      );
      return;
    }
    if (cmd === "ltop") {
      await runCommand(cmd, message, () => handleLtopCommand(message, args));
      return;
    }
    if (cmd === "postapplytag" || cmd === "applytag") {
      await runCommand(cmd, message, () =>
        handlePostApplyTagCommand(message),
      );
      return;
    }
    if (cmd === "poststaffapp" || cmd === "staffapp") {
      await runCommand(cmd, message, () =>
        handlePostStaffAppCommand(message),
      );
      return;
    }
    if (cmd === "postroles" || cmd === "postrole" || cmd === "rolespanel") {
      await runCommand(cmd, message, () => handlePostRolesCommand(message));
      return;
    }
    if (cmd === "lockdown" || cmd === "raidlock") {
      await runCommand(cmd, message, () =>
        handleLockdownCommand(message, args, "lockdown"),
      );
      return;
    }
    if (cmd === "unlock" || cmd === "raidunlock") {
      await runCommand(cmd, message, () =>
        handleLockdownCommand(message, args, "unlock"),
      );
      return;
    }
    if (cmd === "raidstatus" || cmd === "raid") {
      await runCommand(cmd, message, () =>
        handleLockdownCommand(message, args, "status"),
      );
      return;
    }
    if (LEADERBOARD_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleLeaderboardCommand(message));
      return;
    }
    if (FLAG_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleFlagCommand(message));
      return;
    }
    if (LANG_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleLangCommand(message));
      return;
    }
    if (COLOR_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleColorCommand(message));
      return;
    }
    if (LIGHT_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleLightCommand(message));
      return;
    }
    if (VOTE_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleVoteCommand(message));
      return;
    }
    if (CRATE_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleCrateCommand(message));
      return;
    }
    if (EMOJI_EQ_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleEmojiEqCommand(message));
      return;
    }
    if (BACK_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleBackCommand(message));
      return;
    }
    if (STATE_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleStateCommand(message));
      return;
    }
    if (EMOJI_RACE_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleEmojiRaceCommand(message));
      return;
    }
    if (DICE_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleDiceCommand(message));
      return;
    }
    if (KNOWLEDGE_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleKnowledgeCommand(message));
      return;
    }
    if (REACT_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleReactCommand(message));
      return;
    }
    if (NICK_CHANGE_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleNickCommand(message, args));
      return;
    }
    if (NICK_GAME_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleNicknameGameCommand(message));
      return;
    }
    if (COMS_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleComsCommand(message));
      return;
    }
    if (QUOTE_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleQuoteCommand(message));
      return;
    }
    if (UWUIFY_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleUwuifyCommand(message, args));
      return;
    }
    if (INVISIBLE_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () =>
        handleInvisibleCommand(message, args),
      );
      return;
    }
    if (TROLL_ALIASES.has(cmd)) {
      await runCommand(cmd, message, () => handleTrollCommand(message));
      return;
    }
    if (isActionCommand(cmd)) {
      if (await rejectUnlessActionChannel(message)) return;
      const action = getAction(cmd)!;
      const key = `${message.guildId}:${message.author.id}:${action.name}`;
      const author =
        message.member ??
        (await message.guild.members
          .fetch({ user: message.author.id, force: true })
          .catch(() => null));
      const staff = author ? isStaffMember(author) : false;
      if (!staff) {
        const claim = await claimCooldownMs(
          actionCooldownRedisKey(key),
          config.actionCooldownMs,
        );
        if (!claim.ok) {
          const secs = Math.ceil(claim.retryInMs / 1000);
          await message
            .reply(
              `Slow down — \`!${action.name}\` has a **${secs}s** cooldown.`,
            )
            .catch(() => {});
          return;
        }
      }

      await runCommand(cmd, message, () =>
        handleActionCommand(message, action, args),
      );
      return;
    }

    // Supreme freeform actions: any unknown !word @user (not counted).
    // Built-ins above (!loot, !level, …) always win first.
    if (/^[a-z][a-z0-9_-]{0,31}$/.test(cmd)) {
      // Economy-style commands — never GIF-act, never reply.
      if (CUSTOM_ACTION_BLOCKLIST.has(cmd)) {
        return;
      }

      const author =
        message.member ??
        (await message.guild.members
          .fetch({ user: message.author.id, force: true })
          .catch(() => null));
      if (author && canUseCustomAction(author)) {
        if (await rejectUnlessActionChannel(message)) return;
        const key = `${message.guildId}:${message.author.id}:custom:${cmd}`;
        const staff = isStaffMember(author);
        if (!staff) {
          const claim = await claimCooldownMs(
            actionCooldownRedisKey(key),
            config.actionCooldownMs,
          );
          if (!claim.ok) {
            const secs = Math.ceil(claim.retryInMs / 1000);
            await message
              .reply(
                `Slow down — \`!${cmd}\` has a **${secs}s** cooldown.`,
              )
              .catch(() => {});
            return;
          }
        }

        const action = buildCustomActionDef(cmd);
        await runCommand(cmd, message, () =>
          handleActionCommand(message, action, args, { countStats: false }),
        );
        return;
      }

      // Looks like a freeform action (mention / reply / user id) but no Supreme.
      const looksLikeAction =
        Boolean(message.mentions.members?.size) ||
        Boolean(message.reference?.messageId) ||
        /^\d{15,21}$/.test(args[0]?.replace(/[<@!>]/g, "") ?? "");
      if (looksLikeAction) {
        await message
          .reply(
            `\`!${cmd}\` is a **custom action** — you need **Supreme / Mythic** (or staff) to use freeform commands.`,
          )
          .catch(() => {});
        return;
      }
    }
    // Unknown "!" prefixed message falls through and still counts toward stats.
  }

  // Every non-command message counts toward the daily leaderboard + totals.
  // Chat Star is awarded only at local midnight from each lounge's yesterday #1 —
  // do not transfer mid-day when live rankings change.
  void recordChatMessage(
    message.guildId,
    message.author.id,
    message.channelId,
  ).catch((err) =>
    console.error("[messageCreate] failed to record message counts:", err),
  );

  // Correct flag / language / emoji guess ends the round — skip normal message XP.
  if (isChannelGameActive(message.channelId)) {
    try {
      const wonFlag = await tryFlagGuess(message);
      if (wonFlag) return;
    } catch (err) {
      console.error("[messageCreate] flag guess failed:", err);
    }
    try {
      const wonLang = await tryLangGuess(message);
      if (wonLang) return;
    } catch (err) {
      console.error("[messageCreate] lang guess failed:", err);
    }
    try {
      const wonEq = await tryEmojiEqGuess(message);
      if (wonEq) return;
    } catch (err) {
      console.error("[messageCreate] emoji equation guess failed:", err);
    }
    try {
      const wonWord = await tryWordReverseGuess(message);
      if (wonWord) return;
    } catch (err) {
      console.error("[messageCreate] word reverse guess failed:", err);
    }
    try {
      const wonState = await tryStateGuess(message);
      if (wonState) return;
    } catch (err) {
      console.error("[messageCreate] state guess failed:", err);
    }
    try {
      const wonEmojiRace = await tryEmojiRaceGuess(message);
      if (wonEmojiRace) return;
    } catch (err) {
      console.error("[messageCreate] emoji race guess failed:", err);
    }
  }

  // Track activity for auto flag-game spawn (3+ unique chatters recently).
  void noteChatActivity(message).catch((err) =>
    console.error("[messageCreate] flag activity tracking failed:", err),
  );

  const claim = await claimCooldownMs(
    messageXpCooldownKey(message.guildId, message.author.id),
    config.messageCooldownMs,
  );
  if (!claim.ok) return;

  const amount = randomInt(config.messageXpMin, config.messageXpMax);
  await addXp(
    message.client,
    message.guildId,
    message.author.id,
    amount,
    message.member,
  );
}
