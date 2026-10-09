import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type GuildMember,
} from "discord.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NUMBER_EMOJI_IDS } from "../utils/customEmojis.js";
import { msUntilNextDailyReset } from "../utils/helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDAL_PATH = join(__dirname, "../../assets/chatstar-medal.png");

const CHAT_STAR_YELLOW = 0x143b96;

const PERKS: ReadonlyArray<{ emoji: string; text: string }> = [
  { emoji: "😈", text: "**Custom role** with unique appearance" },
  { emoji: "🎨", text: "**Custom colors** (solid or gradient)" },
  { emoji: "⭐", text: "**Crown icon** for your Chat Star role" },
  { emoji: "✨", text: "**Sparkle reactions** when people ping you" },
  { emoji: "🏆", text: "**Recognition** as yesterday’s lounge #1" },
  { emoji: "📣", text: "**Show off** your Chat Star in the lounges" },
  { emoji: "🕹️", text: "**Customize anytime** with the buttons below" },
  { emoji: "⏳", text: "**Hold the crown** until the next daily reset" },
];

function numEmoji(n: number): string {
  const id = NUMBER_EMOJI_IDS[n];
  return id ? `<:n${n}:${id}>` : `**${n}.**`;
}

function editorRows() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("chatstar:icon")
        .setLabel("Icon")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("😈"),
      new ButtonBuilder()
        .setCustomId("chatstar:color")
        .setLabel("Color")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎨"),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("chatstar:save")
        .setLabel("Save")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
    ),
  ];
}

/**
 * Congrats DM when someone newly receives Lounge Chat Star / King of Lounge.
 */
export async function sendChatStarAwardDm(
  member: GuildMember,
  loungeLabel: string,
): Promise<void> {
  const expiresAt = Math.floor(
    (Date.now() + msUntilNextDailyReset()) / 1000,
  );

  const perkLines = PERKS.map(
    (p, i) => `${numEmoji(i + 1)} ${p.emoji} ${p.text}`,
  ).join("\n");

  let medal: AttachmentBuilder | null = null;
  try {
    medal = new AttachmentBuilder(readFileSync(MEDAL_PATH), {
      name: "chatstar-medal.png",
    });
  } catch (err) {
    console.warn("[chatstar] Medal asset missing:", err);
  }

  const embed = new EmbedBuilder()
    .setColor(CHAT_STAR_YELLOW)
    .setAuthor({ name: "🌌 Congratulations!" })
    .setDescription(
      [
        `👑 You are now the **Leader** of **${loungeLabel}!**`,
        "",
        "💥 **You've unlocked the following perks!**",
        perkLines,
        "",
        `Your role expires <t:${expiresAt}:R>`,
      ].join("\n"),
    )
    .setFooter({
      text: "Use the buttons below to customize your royal appearance!",
    })
    .setTimestamp();

  if (medal) {
    embed.setThumbnail("attachment://chatstar-medal.png");
  }

  try {
    await member.send({
      embeds: [embed],
      components: editorRows(),
      ...(medal ? { files: [medal] } : {}),
    });
  } catch (err) {
    console.warn(
      `[chatstar] Could not DM ${member.user.tag} (DMs closed?):`,
      err,
    );
  }
}
