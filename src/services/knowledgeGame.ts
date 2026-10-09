import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type GuildMember,
  type Interaction,
  type Message,
  type TextChannel,
} from "discord.js";
import { GAME_EMBED_COLOR } from "../config.js";
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_META,
  pickKnowledgeQuestionForCategory,
  pickRandomKnowledgeCategory,
  type KnowledgeCategory,
  type KnowledgeQuestion,
} from "../data/knowledgeQuestions.js";
import { buildGameWinPayload } from "./gameWin.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";

const SPIN_FRAME_MS = 200;
const SPIN_TOTAL_MS = 3_200;
const ANSWER_MS = 45_000;
const OPTION_COUNT = 4;

const QUIZ_ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets/quiz",
);
/** Same attachment name every frame so `attachment://` stays valid on edits. */
const THUMB_NAME = "quiz-category.png";

type ActiveKnowledgeRound = {
  channelId: string;
  guildId: string;
  messageId: string;
  question: KnowledgeQuestion;
  /** Shuffled answer labels in button order. */
  options: string[];
  correctIndex: number;
  /** Answer indexes already marked wrong (grayed for everyone). */
  wrongIndexes: Set<number>;
  revealed: boolean;
  ended: boolean;
  endsAtUnix: number;
  spinTimeout: ReturnType<typeof setTimeout> | null;
  answerTimeout: ReturnType<typeof setTimeout> | null;
  channel: TextChannel;
  message: Message | null;
};

const rounds = new Map<string, ActiveKnowledgeRound>();

export function getActiveKnowledgeRound(
  channelId: string,
): ActiveKnowledgeRound | undefined {
  return rounds.get(channelId);
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function buildOptions(q: KnowledgeQuestion): {
  options: string[];
  correctIndex: number;
} {
  const options = shuffleInPlace([q.correct, ...q.wrong]);
  return { options, correctIndex: options.indexOf(q.correct) };
}

function categoryThumbPath(category: KnowledgeCategory): string {
  const file = KNOWLEDGE_CATEGORY_META[category].thumbFile;
  return path.join(QUIZ_ASSETS, file);
}

function categoryAttachment(category: KnowledgeCategory): AttachmentBuilder {
  return new AttachmentBuilder(categoryThumbPath(category), {
    name: THUMB_NAME,
  });
}

function spinEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setTitle("Knowledge Quiz")
    .setDescription("_Picking a category…_")
    .setThumbnail(`attachment://${THUMB_NAME}`)
    .setFooter({ text: "One try per person · First correct wins a point" });
}

function questionEmbed(
  round: ActiveKnowledgeRound,
  opts: { expired?: boolean; winnerId?: string } = {},
): EmbedBuilder {
  const lines = [`**${round.question.question}**`];

  if (opts.winnerId) {
    lines.push(
      "",
      ltrLine(
        `✅ ${ltrIsolate(`<@${opts.winnerId}>`)} got it — **${round.question.correct}**`,
      ),
    );
  } else if (opts.expired) {
    lines.push("", `⏰ Time's up — answer was **${round.question.correct}**`);
  } else {
    lines.push("", `Ends <t:${round.endsAtUnix}:R>`);
  }

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setTitle("Knowledge Quiz")
    .setDescription(lines.join("\n"))
    .setThumbnail(`attachment://${THUMB_NAME}`)
    .setFooter({ text: "One try per person · First correct wins a point" });
}

function answerButtons(
  round: ActiveKnowledgeRound,
  opts: { lockAll?: boolean; highlightCorrect?: boolean } = {},
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < OPTION_COUNT; i++) {
    const label = round.options[i] ?? "?";
    const wrong = round.wrongIndexes.has(i);
    const isCorrect = i === round.correctIndex;

    let style: ButtonStyle = ButtonStyle.Primary;
    let disabled = opts.lockAll === true || wrong;

    if (opts.highlightCorrect && isCorrect) {
      style = ButtonStyle.Success;
      disabled = true;
    } else if (wrong || (opts.lockAll && !isCorrect)) {
      style = ButtonStyle.Secondary;
      disabled = true;
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`knowledge:pick:${i}`)
        .setLabel(label.slice(0, 80))
        .setStyle(style)
        .setDisabled(disabled),
    );
  }
  return row;
}

function clearRoundTimers(round: ActiveKnowledgeRound): void {
  if (round.spinTimeout) clearTimeout(round.spinTimeout);
  if (round.answerTimeout) clearTimeout(round.answerTimeout);
  round.spinTimeout = null;
  round.answerTimeout = null;
}

async function finishKnowledgeRound(
  round: ActiveKnowledgeRound,
  opts: { winnerId?: string; expired?: boolean } = {},
): Promise<void> {
  if (round.ended) return;
  round.ended = true;
  clearRoundTimers(round);
  rounds.delete(round.channelId);

  try {
    if (round.message) {
      await round.message.edit({
        embeds: [
          questionEmbed(round, {
            winnerId: opts.winnerId,
            expired: opts.expired,
          }),
        ],
        components: [
          answerButtons(round, {
            lockAll: true,
            highlightCorrect: true,
          }),
        ],
        files: [categoryAttachment(round.question.category)],
      });
    }
  } catch (err) {
    console.warn("[knowledgeGame] Failed to finalize embed:", err);
  }
}

async function revealQuestion(round: ActiveKnowledgeRound): Promise<void> {
  if (round.ended || round.revealed) return;
  round.revealed = true;
  round.endsAtUnix = Math.floor((Date.now() + ANSWER_MS) / 1000);

  try {
    if (round.message) {
      await round.message.edit({
        embeds: [questionEmbed(round)],
        components: [answerButtons(round)],
        files: [categoryAttachment(round.question.category)],
      });
    }
  } catch (err) {
    console.warn("[knowledgeGame] Failed to reveal question:", err);
    await finishKnowledgeRound(round, { expired: true });
    return;
  }

  round.answerTimeout = setTimeout(() => {
    void finishKnowledgeRound(round, { expired: true });
  }, ANSWER_MS);
}

async function runCategorySpin(round: ActiveKnowledgeRound): Promise<void> {
  const finalCategory = round.question.category;
  const start = Date.now();
  let frame = 0;

  const tick = async () => {
    if (round.ended) return;

    const elapsed = Date.now() - start;
    const spinning = elapsed < SPIN_TOTAL_MS;
    const displayCategory = spinning
      ? KNOWLEDGE_CATEGORIES[frame % KNOWLEDGE_CATEGORIES.length]!
      : finalCategory;

    if (spinning) frame++;

    try {
      await round.message?.edit({
        embeds: [spinEmbed()],
        files: [categoryAttachment(displayCategory)],
      });
    } catch (err) {
      console.warn("[knowledgeGame] Category spin frame failed:", err);
    }

    if (spinning) {
      round.spinTimeout = setTimeout(() => void tick(), SPIN_FRAME_MS);
    } else if (!round.revealed && !round.ended) {
      void revealQuestion(round);
    }
  };

  await tick();
}

export async function startKnowledgeRound(
  channel: TextChannel,
): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const category = pickRandomKnowledgeCategory();
  const question = pickKnowledgeQuestionForCategory(category);
  const { options, correctIndex } = buildOptions(question);

  const round: ActiveKnowledgeRound = {
    channelId: channel.id,
    guildId: channel.guild.id,
    messageId: "",
    question,
    options,
    correctIndex,
    wrongIndexes: new Set(),
    revealed: false,
    ended: false,
    endsAtUnix: 0,
    spinTimeout: null,
    answerTimeout: null,
    channel,
    message: null,
  };

  const firstCategory = KNOWLEDGE_CATEGORIES[0]!;
  const sent = await channel.send({
    embeds: [spinEmbed()],
    components: [],
    files: [categoryAttachment(firstCategory)],
  });
  round.messageId = sent.id;
  round.message = sent;
  rounds.set(channel.id, round);

  void runCategorySpin(round);

  console.log(
    `[knowledgeGame] Started in ${channel.id} — ${question.category}: ${question.question}`,
  );
  return true;
}

export async function onKnowledgeGameInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("knowledge:pick:")) return false;

  const pickRaw = interaction.customId.split(":")[2];
  const pick = Number(pickRaw);
  if (!Number.isInteger(pick) || pick < 0 || pick >= OPTION_COUNT) return true;

  const round = rounds.get(interaction.channelId);
  if (!round || round.ended || !round.revealed) {
    await interaction.reply({
      content: "This knowledge round isn't open yet (or already ended).",
      ephemeral: true,
    });
    return true;
  }

  if (round.wrongIndexes.has(pick)) {
    await interaction.reply({
      content: "That answer is already out — pick a different one!",
      ephemeral: true,
    });
    return true;
  }

  if (pick !== round.correctIndex) {
    round.wrongIndexes.add(pick);
    await interaction.update({
      embeds: [questionEmbed(round)],
      components: [answerButtons(round)],
      files: [categoryAttachment(round.question.category)],
    });
    await interaction
      .followUp({
        content: "❌ Wrong — try another option!",
        ephemeral: true,
      })
      .catch(() => {});
    return true;
  }

  // Correct — lock, award point, finish.
  round.ended = true;
  clearRoundTimers(round);
  rounds.delete(round.channelId);

  await interaction.update({
    embeds: [questionEmbed(round, { winnerId: interaction.user.id })],
    components: [
      answerButtons(round, { lockAll: true, highlightCorrect: true }),
    ],
    files: [categoryAttachment(round.question.category)],
  });

  const payload = await buildGameWinPayload({
    guildId: round.guildId,
    userId: interaction.user.id,
    guild: interaction.guild,
    channel: round.channel,
    member:
      interaction.member && "guild" in interaction.member
        ? (interaction.member as GuildMember)
        : null,
  });
  await round.channel
    .send(payload)
    .catch((err) => console.error("[knowledgeGame] win announce failed:", err));

  console.log(
    `[knowledgeGame] ${interaction.user.tag} won in ${round.channelId}`,
  );
  return true;
}
