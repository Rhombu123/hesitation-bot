import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import { config } from "./config.js";
import {
  startShopPromoTicker,
  stopShopPromoTicker,
} from "./services/shopPromo.js";
import { replyWithSignedShopLink } from "./commands/shop.js";
import { startShopHttpServer } from "./http/shopServer.js";
import { closePostgres, pingPostgres } from "./db/postgres.js";
import {
  closeRedis,
  connectRedis,
  pingRedis,
  claimEventOnce,
  claimDiscordGatewayEpoch,
  isDiscordGatewayOwner,
} from "./db/redis.js";
import { onGuildMemberAdd } from "./events/guildMemberAdd.js";
import { onGuildMemberRemove } from "./events/guildMemberRemove.js";
import { onGuildMemberUpdate } from "./events/guildMemberUpdate.js";
import { onUserUpdateForServerTag } from "./services/serverTagRole.js";
import { onMessageCreate } from "./events/messageCreate.js";
import { onVoiceStateUpdate } from "./events/voiceStateUpdate.js";
import { onLevelUpDmInteraction } from "./services/levelUp.js";
import { onCreditsRedeemInteraction } from "./commands/credits.js";
import { onActionsLbInteraction } from "./commands/actionsLb.js";
import { onChatStarInteraction } from "./commands/edit.js";
import { onLevelNotifyInteraction } from "./commands/level.js";
import { onLootInteraction } from "./commands/loot.js";
import { onInventoryInteraction } from "./commands/inventory.js";
import { onProfileRolesInteraction } from "./services/profileRoles.js";
import { onCustomRoleInteraction } from "./commands/role.js";
import { onGamesInteraction } from "./commands/games.js";
import { onReputationInteraction } from "./commands/rep.js";
import { onColorGameInteraction } from "./services/colorGame.js";
import { onCrateGameInteraction } from "./services/crateGame.js";
import { onDiceGameInteraction } from "./services/diceGame.js";
import { onKnowledgeGameInteraction } from "./services/knowledgeGame.js";
import { onLightGameInteraction } from "./services/lightGame.js";
import { onReactGameReaction } from "./services/reactGame.js";
import { onStarboardReaction } from "./services/starboard.js";
import { onVoteGameInteraction } from "./services/voteGame.js";
import {
  seedVoiceSessions,
  startVoiceXpTicker,
  stopVoiceXpTicker,
} from "./services/voiceXp.js";
import {
  startTopMessengerMidnightSync,
  stopTopMessengerMidnightSync,
  syncAllTopMessengerRoles,
} from "./services/topMessengerRole.js";
import {
  startSupremeExpiryTicker,
  stopSupremeExpiryTicker,
} from "./services/supremeGrants.js";
import { ensureDonorInfoPost } from "./services/donorInfo.js";
import { ensureAppealsInfoPosts } from "./services/appealsInfo.js";
import { resolveAppealsGuildId } from "./utils/appealsGuild.js";
import { syncLootRoleColors } from "./services/lootRoleSync.js";
import { lowerAllCustomRolesBelowHelper } from "./services/customRoles.js";
import {
  startTimedRoleExpiryTicker,
  stopTimedRoleExpiryTicker,
} from "./services/timedRoleGrants.js";
import {
  startXpBoosterExpiryTicker,
  stopXpBoosterExpiryTicker,
} from "./services/xpBoosters.js";
import {
  bindWeeklyLeaderClient,
  ensureWeeklyLeaderboardPosts,
  startDailyLeaderboardRefresh,
  startWeeklyLeaderRoleSync,
  stopDailyLeaderboardRefresh,
  stopWeeklyLeaderRoleSync,
  syncAllWeeklyLeaderRoles,
} from "./services/weeklyLeaderboards.js";
import {
  stopBumpReminderTimers,
  restoreBumpReminders,
} from "./services/bumpReminder.js";
import { onJailInteraction, restoreActiveJails } from "./services/jail.js";
import { resyncAllLevelsFromXp } from "./services/xp.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

/** Health + role shop + Stripe webhook (Railway PORT). */
const port = Number(process.env.PORT ?? 8080);
const healthServer = startShopHttpServer(port, client);

client.on(Events.Error, (err) => {
  console.error("[discord] Client error:", err);
});
client.on(Events.Warn, (msg) => {
  console.warn("[discord] Warn:", msg);
});
client.on(Events.ShardDisconnect, (event, shardId) => {
  console.warn(
    `[discord] Shard ${shardId} disconnected:`,
    event.code,
    event.reason,
  );
});
client.on(Events.ShardReconnecting, (shardId) => {
  console.warn(`[discord] Shard ${shardId} reconnecting…`);
});
client.on(Events.ShardResume, (shardId) => {
  console.log(`[discord] Shard ${shardId} resumed`);
});

client.once(Events.ClientReady, (c) => {
  console.log(
    `[ready] Logged in as ${c.user.tag} — ${c.guilds.cache.size} guild(s), prefix "${config.prefix}"`,
  );
  if (!config.levelUpChannelId) {
    console.warn(
      "[ready] LEVEL_UP_CHANNEL_ID is not set — level-up announcements are disabled until you add it.",
    );
  }
  console.log(`[ready] Chat Star Lounge 1 role: ${config.topMessengerRoleId}`);
  console.log(`[ready] Chat Star Lounge 2 role: ${config.lounge2ChatStarRoleId}`);
  console.log(
    `[ready] Lounges: #1 ${config.lounge1ChannelId} · #2 ${config.lounge2ChannelId}`,
  );
  if (config.chatStarAllowManual) {
    console.log(
      "[ready] CHAT_STAR_ALLOW_MANUAL=true — bot will not strip Chat Star from extra holders.",
    );
  } else {
    console.log(
      "[ready] Chat Star is exclusive per lounge — yesterday's !ltop N #1 keeps it until the next local midnight.",
    );
  }
  console.log(`[ready] Supabase: ${config.supabaseUrl}`);
  console.log(
    config.klipyApiKey
      ? "[ready] Klipy: configured"
      : "[ready] Klipy: KLIPY_API_KEY not set — action GIFs will fail until you add it.",
  );

  c.user.setPresence({
    status: "online",
    activities: [
      {
        type: ActivityType.Custom,
        name: "Custom Status",
        state: "Hesitation Official Discord Bot",
      },
    ],
  });

  seedVoiceSessions(c);
  startVoiceXpTicker(c);
  console.log("[ready] Voice XP ticker started.");

  startTopMessengerMidnightSync(c);
  void syncAllTopMessengerRoles(c).catch((err) =>
    console.error("[ready] Top messenger role sync failed:", err),
  );

  startWeeklyLeaderRoleSync(c);
  startDailyLeaderboardRefresh(c);
  startSupremeExpiryTicker(c);
  startTimedRoleExpiryTicker(c);
  startXpBoosterExpiryTicker(c);
  startShopPromoTicker(c);
  bindWeeklyLeaderClient(c);
  void syncAllWeeklyLeaderRoles(c).catch((err) =>
    console.error("[ready] Weekly Genius/Popular role sync failed:", err),
  );
  // Do NOT clear find inventory here — it races Collector award on Monday.
  // Inventory is cleared only after weekly roles sync awards Collector.
  void ensureWeeklyLeaderboardPosts(c, "genius").catch((err) =>
    console.error("[ready] Genius leaderboard posts failed:", err),
  );
  void ensureWeeklyLeaderboardPosts(c, "popular").catch((err) =>
    console.error("[ready] Popular leaderboard posts failed:", err),
  );

  void restoreBumpReminders(c).catch((err) =>
    console.error("[ready] Bump reminder restore failed:", err),
  );

  void resyncAllLevelsFromXp()
    .then((n) => {
      if (n > 0) console.log(`[ready] Resynced levels for ${n} user(s) to Arcane curve.`);
    })
    .catch((err) => console.error("[ready] Level resync failed:", err));

  void restoreActiveJails(c).catch((err) =>
    console.error("[ready] Jail restore failed:", err),
  );

  void ensureDonorInfoPost(c).catch((err) =>
    console.error("[ready] Donor info embed failed:", err),
  );

  void resolveAppealsGuildId(c)
    .then(() => ensureAppealsInfoPosts(c))
    .catch((err) => console.error("[ready] Appeals info posts failed:", err));

  void lowerAllCustomRolesBelowHelper(c).catch((err) =>
    console.error("[ready] Custom role position sync failed:", err),
  );

  void syncLootRoleColors(c).catch((err) =>
    console.error("[ready] Loot role color sync failed:", err),
  );
});

client.on(Events.MessageCreate, (message) => {
  void onMessageCreate(message).catch((err) =>
    console.error("[messageCreate]", err),
  );
});

client.on(Events.GuildMemberAdd, (member) => {
  void onGuildMemberAdd(member).catch((err) =>
    console.error("[guildMemberAdd]", err),
  );
});

client.on(Events.GuildMemberRemove, (member) => {
  void onGuildMemberRemove(member).catch((err) =>
    console.error("[guildMemberRemove]", err),
  );
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  void onGuildMemberUpdate(oldMember, newMember).catch((err) =>
    console.error("[guildMemberUpdate]", err),
  );
});

client.on(Events.UserUpdate, (oldUser, newUser) => {
  void onUserUpdateForServerTag(client, oldUser, newUser).catch((err) =>
    console.error("[userUpdate/serverTag]", err),
  );
});

client.on(Events.InteractionCreate, (interaction) => {
  void (async () => {
    // Only one replica may handle a given interaction (deploy overlap / multi-replica).
    if (!(await claimEventOnce("ix", interaction.id))) return;

    if (await replyWithSignedShopLink(interaction)) return;
    if (await onColorGameInteraction(interaction)) return;
    if (await onLightGameInteraction(interaction)) return;
    if (await onCrateGameInteraction(interaction)) return;
    if (await onDiceGameInteraction(interaction)) return;
    if (await onKnowledgeGameInteraction(interaction)) return;
    if (await onVoteGameInteraction(interaction)) return;
    if (await onJailInteraction(interaction)) return;
    if (await onLevelUpDmInteraction(interaction)) return;
    if (await onLevelNotifyInteraction(interaction)) return;
    if (await onCreditsRedeemInteraction(interaction)) return;
    if (await onReputationInteraction(interaction)) return;
    if (await onCustomRoleInteraction(interaction)) return;
    if (await onGamesInteraction(interaction)) return;
    if (await onActionsLbInteraction(interaction)) return;
    if (await onLootInteraction(interaction)) return;
    if (await onProfileRolesInteraction(interaction)) return;
    if (await onInventoryInteraction(interaction)) return;
    await onChatStarInteraction(interaction);
  })().catch((err) => console.error("[interactionCreate]", err));
});

client.on(Events.MessageReactionAdd, (reaction, user) => {
  void (async () => {
    if (await onReactGameReaction(reaction, user)) return;
    await onStarboardReaction(reaction, user);
  })().catch((err) => console.error("[messageReactionAdd]", err));
});

client.on(Events.MessageReactionRemove, (reaction, user) => {
  void onStarboardReaction(reaction, user).catch((err) =>
    console.error("[messageReactionRemove]", err),
  );
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  onVoiceStateUpdate(oldState, newState);
});

client.on(Events.Error, (err) => {
  console.error("[client] Gateway error:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled promise rejection:", reason);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] Received ${signal}, cleaning up...`);
  stopVoiceXpTicker();
  stopTopMessengerMidnightSync();
  stopWeeklyLeaderRoleSync();
  stopDailyLeaderboardRefresh();
  stopSupremeExpiryTicker();
  stopTimedRoleExpiryTicker();
  stopXpBoosterExpiryTicker();
  stopShopPromoTicker();
  stopBumpReminderTimers();
  healthServer.close();
  await client.destroy().catch(() => {});
  await Promise.all([closeRedis(), closePostgres()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log("[startup] Connecting to Redis + Postgres…");
try {
  await connectRedis();
  await Promise.all([pingRedis(), pingPostgres()]);
  console.log("[startup] Redis + Postgres ready.");
} catch (err) {
  console.error("[startup] Redis/Postgres failed:", err);
  process.exit(1);
}

console.log("[startup] Claiming Discord gateway epoch (kills older hosts)…");
const gatewayEpoch = await claimDiscordGatewayEpoch();
console.log(`[startup] Gateway epoch ${gatewayEpoch}`);

const epochWatch = setInterval(() => {
  void (async () => {
    try {
      if (await isDiscordGatewayOwner(gatewayEpoch)) return;
      console.error(
        "[gateway] Lost Discord epoch to a newer deploy — destroying this client so only one bot replies.",
      );
      clearInterval(epochWatch);
      await client.destroy().catch(() => {});
      process.exit(0);
    } catch (err) {
      console.error("[gateway] Epoch check failed:", err);
    }
  })();
}, 3_000);
epochWatch.unref?.();

console.log("[startup] Connecting to Discord…");
const loginWatchdog = setTimeout(() => {
  if (!client.isReady()) {
    console.error(
      "[startup] Discord still not ready after 45s — exiting so Railway restarts.",
    );
    process.exit(1);
  }
}, 45_000);

try {
  await client.login(config.token);
  clearTimeout(loginWatchdog);
  console.log(
    `[startup] client.login() resolved (ready=${client.isReady()})`,
  );
} catch (err) {
  clearTimeout(loginWatchdog);
  console.error(
    "[startup] Failed to log in. Check DISCORD_TOKEN and make sure the " +
      "MESSAGE CONTENT + SERVER MEMBERS privileged intents are enabled in the Discord Developer Portal.",
    err,
  );
  process.exit(1);
}
