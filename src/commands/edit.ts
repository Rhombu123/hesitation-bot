import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type Interaction,
  type Message,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { EMBED_COLOR, config } from "../config.js";

/** Draft customizations waiting for Save (per user). */
type Draft = {
  primaryColor: number;
  secondaryColor: number | null;
  tertiaryColor: number | null;
  /** Unicode emoji or custom emoji snowflake for role icon. */
  icon: string | null;
};

const drafts = new Map<string, Draft>();

/** Custom crown emojis — used by the Icon button. */
const CROWN_YELLOW_ID = "1532481460450361556";
const CROWN_BLUE_ID = "1532481493979369552";
const CROWN_RED_ID = "1532481520525250630";
const CROWN_ORANGE_ID = "1532481548371366049";

const CROWN_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  emojiId: string;
  primary: number;
}> = [
  {
    id: "yellow",
    label: "Yellow Crown",
    emojiId: CROWN_YELLOW_ID,
    primary: 0xffd700,
  },
  {
    id: "blue",
    label: "Blue Crown",
    emojiId: CROWN_BLUE_ID,
    primary: 0x3b82f6,
  },
  {
    id: "red",
    label: "Red Crown",
    emojiId: CROWN_RED_ID,
    primary: 0xe74c3c,
  },
  {
    id: "orange",
    label: "Orange Crown",
    emojiId: CROWN_ORANGE_ID,
    primary: 0xff8c00,
  },
];

/** All Chat Star role IDs (Lounge 1 + Lounge 2). */
function chatStarRoleIds(): string[] {
  const ids = [config.topMessengerRoleId, config.lounge2ChatStarRoleId].filter(
    (id): id is string => Boolean(id),
  );
  return [...new Set(ids)];
}

/** Which Chat Star role this member can customize (prefer Lounge 1 if both). */
function resolveEditableRoleId(member: {
  roles: { cache: { has: (id: string) => boolean } };
}): string | null {
  for (const id of chatStarRoleIds()) {
    if (member.roles.cache.has(id)) return id;
  }
  return null;
}

function draftKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function parseHex(raw: string): number | null {
  const cleaned = raw.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 16);
}

function hexOf(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function getOrInitDraft(
  guildId: string,
  userId: string,
  fromRole: {
    name: string;
    colors: {
      primaryColor: number;
      secondaryColor: number | null;
      tertiaryColor: number | null;
    };
  },
): Draft {
  const key = draftKey(guildId, userId);
  let draft = drafts.get(key);
  if (!draft) {
    draft = {
      primaryColor: fromRole.colors.primaryColor || 0xffffff,
      secondaryColor: fromRole.colors.secondaryColor,
      tertiaryColor: fromRole.colors.tertiaryColor,
      icon: null,
    };
    drafts.set(key, draft);
  }
  return draft;
}

function previewEmbed(draft: Draft): EmbedBuilder {
  const lines = [
    `Primary: \`${hexOf(draft.primaryColor)}\``,
    draft.secondaryColor != null
      ? `Secondary (gradient): \`${hexOf(draft.secondaryColor)}\``
      : "Secondary: _none (solid)_",
    draft.icon ? `Crown: \`${draft.icon}\`` : "Crown: _(not set)_",
  ];
  return new EmbedBuilder()
    .setColor(draft.primaryColor || EMBED_COLOR)
    .setTitle("Customize Chat Star")
    .setDescription(
      [
        "You can **customize** your **role's color and icon** below.",
        "The role name stays as it is.",
        "",
        lines.join("\n"),
      ].join("\n"),
    );
}

function editorRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("chatstar:icon")
        .setLabel("Icon")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: CROWN_YELLOW_ID }),
      new ButtonBuilder()
        .setCustomId("chatstar:color")
        .setLabel("Color")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎨"),
      new ButtonBuilder()
        .setCustomId("chatstar:save")
        .setLabel("Save")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
    ),
  ];
}

function ephemeralFlag(interaction: Interaction): boolean {
  return interaction.inGuild();
}

/**
 * Resolve guild + Chat Star role for guild or DM interactions.
 * DM buttons work when the user holds Chat Star in a mutual guild.
 */
async function requireChatStarContext(
  interaction: Interaction,
): Promise<{ guild: Guild; roleId: string } | null> {
  const deny = async () => {
    if (interaction.isRepliable()) {
      await interaction
        .reply({
          content:
            "Only someone with a **Chat Star** role (Lounge 1 or 2) can use this.",
          ephemeral: ephemeralFlag(interaction),
        })
        .catch(() => {});
    }
  };

  if (interaction.guild) {
    const member = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    const roleId = member ? resolveEditableRoleId(member) : null;
    if (!roleId) {
      await deny();
      return null;
    }
    return { guild: interaction.guild, roleId };
  }

  for (const guild of interaction.client.guilds.cache.values()) {
    const member = await guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (!member) continue;
    const roleId = resolveEditableRoleId(member);
    if (roleId) return { guild, roleId };
  }

  await deny();
  return null;
}

function canEditRole(guild: Guild, rolePosition: number): boolean {
  const me = guild.members.me;
  return Boolean(
    me?.permissions.has("ManageRoles") && rolePosition < me.roles.highest.position,
  );
}

export async function handleEditCommand(message: Message<true>): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  const editableId = member ? resolveEditableRoleId(member) : null;
  if (!editableId) {
    await message.reply(
      "You need a **Chat Star** role (Lounge 1 or Lounge 2) to use `!edit`.",
    );
    return;
  }

  const role = await message.guild.roles.fetch(editableId).catch(() => null);
  if (!role) {
    await message.reply("Chat Star role was not found on this server.");
    return;
  }

  if (!canEditRole(message.guild, role.position)) {
    await message.reply(
      "I can't edit Chat Star — give me **Manage Roles** and move my role **above** Chat Star.",
    );
    return;
  }

  const draft = getOrInitDraft(message.guildId, message.author.id, role);
  await message.reply({
    embeds: [previewEmbed(draft)],
    components: editorRows(),
  });
}

export async function onChatStarInteraction(
  interaction: Interaction,
): Promise<void> {
  if (interaction.isButton() && interaction.customId.startsWith("chatstar:")) {
    await handleButton(interaction);
    return;
  }
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "chatstar:crown_pick") {
      await handleCrownPick(interaction);
      return;
    }
  }
  if (
    interaction.isModalSubmit() &&
    interaction.customId === "chatstar:color_modal"
  ) {
    await handleColorModal(interaction);
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const ctx = await requireChatStarContext(interaction);
  if (!ctx) return;
  const { guild, roleId: editableId } = ctx;
  const role = await guild.roles.fetch(editableId).catch(() => null);
  if (!role) {
    await interaction.reply({
      content: "Chat Star role missing.",
      ephemeral: ephemeralFlag(interaction),
    });
    return;
  }

  const draft = getOrInitDraft(guild.id, interaction.user.id, role);
  const action = interaction.customId.split(":")[1];

  if (action === "icon") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("chatstar:crown_pick")
      .setPlaceholder("Pick a crown")
      .addOptions(
        CROWN_PRESETS.map((p) => ({
          label: p.label,
          value: p.id,
          emoji: { id: p.emojiId },
        })),
      );
    await interaction.reply({
      content: "Choose a **crown** — color + icon apply when you pick it:",
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      ],
      ephemeral: ephemeralFlag(interaction),
    });
    return;
  }

  if (action === "color") {
    const modal = new ModalBuilder()
      .setCustomId("chatstar:color_modal")
      .setTitle("Chat Star Colors")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("primary")
            .setLabel("Primary color (hex)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("#FF69B4")
            .setValue(hexOf(draft.primaryColor))
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("secondary")
            .setLabel("Gradient secondary (hex, blank = solid)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("#7FD3FF")
            .setValue(
              draft.secondaryColor != null ? hexOf(draft.secondaryColor) : "",
            )
            .setRequired(false),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  if (action === "save") {
    await applyDraft(interaction, guild, draft);
  }
}

/** Icon → color crown (applies color + role icon immediately). */
async function handleCrownPick(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const ctx = await requireChatStarContext(interaction);
  if (!ctx) return;
  const { guild, roleId: editableId } = ctx;
  const role = await guild.roles.fetch(editableId).catch(() => null);
  if (!role) {
    await interaction.reply({
      content: "Chat Star role missing.",
      ephemeral: ephemeralFlag(interaction),
    });
    return;
  }

  const preset = CROWN_PRESETS.find((p) => p.id === interaction.values[0]);
  if (!preset) {
    await interaction.reply({
      content: "Unknown crown.",
      ephemeral: ephemeralFlag(interaction),
    });
    return;
  }

  if (!canEditRole(guild, role.position)) {
    await interaction.reply({
      content: "I can't edit Chat Star — check my role is above it.",
      ephemeral: ephemeralFlag(interaction),
    });
    return;
  }

  const draft = getOrInitDraft(guild.id, interaction.user.id, role);
  draft.primaryColor = preset.primary;
  draft.secondaryColor = null;
  draft.tertiaryColor = null;
  draft.icon = preset.emojiId;

  await interaction.deferUpdate();

  try {
    await role.edit({
      colors: {
        primaryColor: preset.primary,
        secondaryColor: null,
        tertiaryColor: null,
      },
      reason: `Chat Star ${preset.label} by ${interaction.user.tag}`,
    });

    try {
      await role.setIcon(preset.emojiId, `Chat Star ${preset.label} icon`);
    } catch (err) {
      console.warn("[chatstar] setIcon failed (Boost Level 2 needed?):", err);
      await interaction.followUp({
        content: `Applied **${preset.label}** color (\`${hexOf(preset.primary)}\`), but role **icons** need Server Boost Level 2.`,
        ephemeral: ephemeralFlag(interaction),
      });
      return;
    }

    await interaction.followUp({
      content: `Applied **${preset.label}** — color \`${hexOf(preset.primary)}\` + crown icon.`,
      ephemeral: ephemeralFlag(interaction),
    });
    console.log(
      `[chatstar] ${interaction.user.tag} picked ${preset.label} (${hexOf(preset.primary)})`,
    );
  } catch (err) {
    console.error("[chatstar] Failed applying crown:", err);
    await interaction.followUp({
      content: `Couldn't apply **${preset.label}**. Check my Manage Roles permission and role order.`,
      ephemeral: ephemeralFlag(interaction),
    });
  }
}

async function handleColorModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const ctx = await requireChatStarContext(interaction);
  if (!ctx) return;
  const { guild, roleId: editableId } = ctx;
  const role = await guild.roles.fetch(editableId).catch(() => null);
  if (!role) {
    await interaction.reply({
      content: "Chat Star role missing.",
      ephemeral: ephemeralFlag(interaction),
    });
    return;
  }
  const draft = getOrInitDraft(guild.id, interaction.user.id, role);

  const primary = parseHex(interaction.fields.getTextInputValue("primary"));
  const secondaryRaw = interaction.fields.getTextInputValue("secondary").trim();
  const secondary = secondaryRaw ? parseHex(secondaryRaw) : null;
  if (primary === null) {
    await interaction.reply({
      content: "Primary color must be a 6-digit hex like `#FF69B4`.",
      ephemeral: ephemeralFlag(interaction),
    });
    return;
  }
  if (secondaryRaw && secondary === null) {
    await interaction.reply({
      content: "Secondary color must be a 6-digit hex or left blank.",
      ephemeral: ephemeralFlag(interaction),
    });
    return;
  }
  draft.primaryColor = primary;
  draft.secondaryColor = secondary;
  if (secondary != null) draft.tertiaryColor = null;
  await interaction.reply({
    content: `Colors updated in your draft. Press **Save** to apply.\nPrimary \`${hexOf(primary)}\`${
      secondary != null ? ` → \`${hexOf(secondary)}\`` : " (solid)"
    }`,
    ephemeral: ephemeralFlag(interaction),
  });
}

async function applyDraft(
  interaction: ButtonInteraction,
  guild: Guild,
  draft: Draft,
): Promise<void> {
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const editableId = member ? resolveEditableRoleId(member) : null;
  const role = editableId
    ? await guild.roles.fetch(editableId).catch(() => null)
    : null;
  if (!role) {
    await interaction.reply({
      content: "Chat Star role missing.",
      ephemeral: ephemeralFlag(interaction),
    });
    return;
  }

  if (!canEditRole(guild, role.position)) {
    await interaction.reply({
      content: "I can't edit that role — check my role position.",
      ephemeral: ephemeralFlag(interaction),
    });
    return;
  }

  await interaction.deferReply({ ephemeral: ephemeralFlag(interaction) });

  try {
    await role.edit({
      colors: {
        primaryColor: draft.primaryColor,
        secondaryColor: draft.secondaryColor,
        tertiaryColor: draft.tertiaryColor,
      },
      reason: `Chat Star customized by ${interaction.user.tag}`,
    });

    if (draft.icon) {
      try {
        const customMatch = draft.icon.match(/^<?a?:?(\w+):(\d+)>?$/);
        const iconValue = customMatch ? customMatch[2]! : draft.icon;
        await role.setIcon(iconValue, `Chat Star icon by ${interaction.user.tag}`);
      } catch (err) {
        console.warn("[chatstar] setIcon failed (boosts required?):", err);
        await interaction.editReply({
          content:
            "Colors saved, but **role icons** need **Server Boost Level 2** (or the emoji was invalid).",
        });
        return;
      }
    }

    await interaction.editReply({
      content: "Chat Star look saved. Everyone will see the updates.",
    });
    console.log(
      `[chatstar] ${interaction.user.tag} saved Chat Star colors ${hexOf(draft.primaryColor)}`,
    );
  } catch (err) {
    console.error("[chatstar] Failed to save role look:", err);
    await interaction.editReply({
      content:
        "Couldn't save. Discord may reject some gradient combos — try a simple primary color or a crown from **Icon**.",
    });
  }
}
