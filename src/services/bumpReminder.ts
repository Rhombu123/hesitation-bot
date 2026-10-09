import {
  EmbedBuilder,
  type Client,
  type Message,
  type TextChannel,
} from "discord.js";
import { EMBED_COLOR, config } from "../config.js";
import { addXp } from "./xp.js";
import {
  deleteBumpReminder,
  listBumpReminders,
  upsertBumpReminder,
} from "./bumpReminderState.js";

/** Official DISBOARD bot application id. */
export const DISBOARD_BOT_ID = "302050872383242240";
/** Official Discadia companion bot application id. */
export const DISCADIA_BOT_ID = "1222548162741538938";

/** Discord danger red — matches typical bot error embeds. */
const ERROR_EMBED_COLOR = 0xed4245;

export const BUMP_COOLDOWN_MS = 2 * 60 * 60_000;

type GuildBumpState = {
  reminderTimeout: ReturnType<typeof setTimeout> | null;
};

const stateByGuild = new Map<string, GuildBumpState>();

function getState(guildId: string): GuildBumpState {
  let state = stateByGuild.get(guildId);
  if (!state) {
    state = { reminderTimeout: null };
    stateByGuild.set(guildId, state);
  }
  return state;
}

export function isBumpReminderConfigured(): boolean {
  return Boolean(config.bumpDetectChannelId && config.bumpReminderChannelId);
}

function collectMessageText(message: Message): string {
  const parts: string[] = [];
  if (message.content) parts.push(message.content);
  for (const embed of message.embeds) {
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    if (embed.footer?.text) parts.push(embed.footer.text);
  }
  return parts.join("\n").toLowerCase();
}

function isBumpWatchChannel(channelId: string): boolean {
  return (
    channelId === config.bumpDetectChannelId ||
    channelId === config.bumpReminderChannelId
  );
}

/** True when DISBOARD confirms a successful bump (not cooldown/error). */
export function isDisboardBumpSuccess(message: Message): boolean {
  if (message.author.id !== DISBOARD_BOT_ID) return false;

  const text = collectMessageText(message);
  if (!text) return false;

  if (
    /please wait|try again in|cooldown|couldn't|could not|error|failed|already bumped|next bump/.test(
      text,
    )
  ) {
    return false;
  }

  if (
    /bump done|bumped!|see you in|successfully bumped|check back in|disboard\.org\/server/.test(
      text,
    )
  ) {
    return true;
  }

  const fromBump =
    message.interactionMetadata?.user != null ||
    message.interaction?.commandName === "bump";
  if (fromBump && /bump|disboard/.test(text)) {
    return true;
  }

  return false;
}

/** True when Discadia confirms a successful bump. */
export function isDiscadiaBumpSuccess(message: Message): boolean {
  if (message.author.id !== DISCADIA_BOT_ID) return false;

  const text = collectMessageText(message);
  if (!text) return false;

  if (
    /already bumped|please try again|must be owner|manage guild|permission|couldn't|could not|error|failed/.test(
      text,
    )
  ) {
    return false;
  }

  return /successfully bumped|has been bumped|bump(?:ed)? successfully/.test(
    text,
  );
}

/** True when Discadia reports the server was already bumped (cooldown). */
export function isDiscadiaAlreadyBumped(message: Message): boolean {
  if (message.author.id !== DISCADIA_BOT_ID) return false;

  const text = collectMessageText(message);
  if (!text) return false;

  return /already bumped|bumped recently/.test(text);
}

function buildDiscadiaAlreadyBumpedEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(ERROR_EMBED_COLOR)
    .setDescription(
      "⚠️ **Already bumped on Discadia**\n\nThis server has already been bumped on Discadia. Please try again later.",
    );
}

async function deleteBumpBotMessage(message: Message): Promise<void> {
  try {
    if (!message.deletable) {
      console.warn(
        `[bump] Cannot delete ${message.author.id} message ${message.id} (missing Manage Messages?).`,
      );
      return;
    }
    await message.delete();
  } catch (err) {
    console.warn(
      `[bump] Failed to delete bump bot message ${message.id}:`,
      err,
    );
  }
}

function buildReminderEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("⏰ Time to bump again!")
    .setDescription(
      [
        "The bump cooldown is over — help keep the server growing.",
        "",
        `Use \`/bump\` to earn **${config.bumpXpReward} XP**!`,
      ].join("\n"),
    );
}

function buildBumpThanksEmbed(bumperId: string, xp: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(
      `Thanks <@${bumperId}> for bumping!\n\n**+${xp} XP**`,
    );
}

async function postBumpReminder(client: Client, guildId: string): Promise<void> {
  const channelId = config.bumpReminderChannelId;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) {
      console.warn(`[bump] Reminder channel ${channelId} is not a text channel.`);
      return;
    }

    await (channel as TextChannel).send({ embeds: [buildReminderEmbed()] });
    console.log(`[bump] Posted reminder in guild ${guildId}.`);
  } catch (err) {
    console.error("[bump] Failed to post reminder:", err);
  }
}

function scheduleBumpReminderAt(
  client: Client,
  guildId: string,
  nextReminderAt: Date,
): void {
  const state = getState(guildId);
  if (state.reminderTimeout) {
    clearTimeout(state.reminderTimeout);
    state.reminderTimeout = null;
  }

  const delayMs = nextReminderAt.getTime() - Date.now();
  if (delayMs <= 0) {
    void (async () => {
      await postBumpReminder(client, guildId);
      await deleteBumpReminder(guildId).catch((err) =>
        console.warn(`[bump] Clear reminder state failed for ${guildId}:`, err),
      );
    })();
    return;
  }

  state.reminderTimeout = setTimeout(() => {
    state.reminderTimeout = null;
    void (async () => {
      await postBumpReminder(client, guildId);
      await deleteBumpReminder(guildId).catch((err) =>
        console.warn(`[bump] Clear reminder state failed for ${guildId}:`, err),
      );
    })();
  }, delayMs);

  console.log(
    `[bump] Reminder scheduled for guild ${guildId} in ${Math.ceil(delayMs / 60_000)} min.`,
  );
}

async function scheduleBumpReminder(
  client: Client,
  guildId: string,
): Promise<void> {
  const nextReminderAt = new Date(Date.now() + BUMP_COOLDOWN_MS);
  await upsertBumpReminder(guildId, nextReminderAt);
  scheduleBumpReminderAt(client, guildId, nextReminderAt);
}

/** Restore pending bump reminders after restart/redeploy. */
export async function restoreBumpReminders(client: Client): Promise<void> {
  if (!isBumpReminderConfigured()) return;

  try {
    const rows = await listBumpReminders();
    if (rows.length === 0) return;

    for (const row of rows) {
      scheduleBumpReminderAt(
        client,
        row.guildId,
        new Date(row.nextReminderAt),
      );
    }
    console.log(`[bump] Restored ${rows.length} pending reminder(s) from DB.`);
  } catch (err) {
    console.error("[bump] Failed to restore reminders:", err);
  }
}

export function stopBumpReminderTimers(): void {
  for (const state of stateByGuild.values()) {
    if (state.reminderTimeout) clearTimeout(state.reminderTimeout);
  }
  stateByGuild.clear();
}

async function handleDisboardBumpSuccess(
  client: Client,
  message: Message<true>,
): Promise<void> {
  console.log(
    `[bump] Detected successful Disboard bump in #${message.channelId} (guild ${message.guildId})`,
  );

  const bumperId =
    message.interactionMetadata?.user.id ?? message.interaction?.user.id;
  if (!bumperId) {
    console.warn("[bump] Success message without interaction user — skipping XP.");
    await scheduleBumpReminder(client, message.guildId).catch((err) =>
      console.error("[bump] Schedule reminder failed:", err),
    );
    await deleteBumpBotMessage(message);
    return;
  }

  try {
    const member = await message.guild.members.fetch(bumperId).catch(() => null);
    await addXp(client, message.guildId, bumperId, config.bumpXpReward, member);

    const replyChannel = message.channel.isTextBased()
      ? (message.channel as TextChannel)
      : null;
    if (replyChannel) {
      await replyChannel
        .send({
          embeds: [buildBumpThanksEmbed(bumperId, config.bumpXpReward)],
          allowedMentions: { users: [bumperId] },
        })
        .catch((err) => console.warn("[bump] Thank-you message failed:", err));
    }
  } catch (err) {
    console.error("[bump] XP reward failed:", err);
  }

  await scheduleBumpReminder(client, message.guildId).catch((err) =>
    console.error("[bump] Schedule reminder failed:", err),
  );
  await deleteBumpBotMessage(message);
}

async function handleDiscadiaBumpSuccess(message: Message<true>): Promise<void> {
  console.log(
    `[bump] Detected successful Discadia bump in #${message.channelId} (guild ${message.guildId})`,
  );
  await deleteBumpBotMessage(message);
}

async function handleDiscadiaAlreadyBumped(
  message: Message<true>,
): Promise<void> {
  console.log(
    `[bump] Discadia already-bumped in #${message.channelId} (guild ${message.guildId})`,
  );

  const replyChannel = message.channel.isTextBased()
    ? (message.channel as TextChannel)
    : null;

  await deleteBumpBotMessage(message);

  if (replyChannel) {
    await replyChannel
      .send({ embeds: [buildDiscadiaAlreadyBumpedEmbed()] })
      .catch((err) =>
        console.warn("[bump] Discadia already-bumped notice failed:", err),
      );
  }
}

/**
 * Handle Disboard / Discadia bump bot messages in the bump channels:
 * - Disboard success → XP + reminder + delete confirmation
 * - Discadia success → delete confirmation
 * - Discadia already bumped → delete error + send our own error embed
 */
export async function tryHandleDisboardBump(
  client: Client,
  message: Message<true>,
): Promise<boolean> {
  if (!isBumpReminderConfigured()) return false;
  if (!isBumpWatchChannel(message.channelId)) return false;

  if (message.author.id === DISBOARD_BOT_ID) {
    if (!isDisboardBumpSuccess(message)) return false;
    await handleDisboardBumpSuccess(client, message);
    return true;
  }

  if (message.author.id === DISCADIA_BOT_ID) {
    if (isDiscadiaAlreadyBumped(message)) {
      await handleDiscadiaAlreadyBumped(message);
      return true;
    }
    if (isDiscadiaBumpSuccess(message)) {
      await handleDiscadiaBumpSuccess(message);
      return true;
    }
    return false;
  }

  return false;
}
