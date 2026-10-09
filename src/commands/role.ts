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
  type GuildMember,
  type Interaction,
  type Message,
  type ModalSubmitInteraction,
  type Role,
  type StringSelectMenuInteraction,
} from "discord.js";
import sharp from "sharp";
import { canUseCustomRoleGradient, hasSupremeAccess } from "../config/rolePrivileges.js";
import {
  canManageDiscordRole,
  deleteCustomRoleRecord,
  ensureOwnerCustomRole,
  ensureSolidCustomRoleColor,
  getCustomRoleByDiscordId,
  getCustomRoleByOwner,
  listCustomRoleMembersForUser,
  listCustomRoles,
  recordRoleGive,
  removeRoleMemberRecord,
  type CustomRoleRow,
} from "../services/customRoles.js";
import { getWeeklyBoostTotalsByRole } from "../services/roleBoosts.js";

const OVERVIEW_COLOR_FALLBACK = 0x143b96;
/** Sidebar color for `!role setup` overview embed. */
const SETUP_EMBED_COLOR = 0x143b96;
const EDIT_COLOR = 0x143b96;
const REMOVE_COLOR = 0x143b96;
const GIVE_COLOR = 0x143b96;
const PAGE_SIZE = 10;
const ICON_UPLOAD_MS = 60_000;
const ICON_MAX_BYTES = 256_000;

/** Removeme UI state keyed by `guildId:userId:messageId`. */
const removemeSelected = new Map<string, string>();

/** Last selected role ids on the Manage Roles UI. */
const manageSelected = new Map<string, string[]>();

/** Active icon-upload collectors keyed by `guildId:userId`. */
const pendingIconUploads = new Map<string, { stop: () => void }>();

function hexOf(n: number): string {
  return `#${n.toString(16).padStart(6, "0").toUpperCase()}`;
}

function parseHex(raw: string): number | null {
  const cleaned = raw.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 16);
}

function iconPendingKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function isImageAttachment(name: string | null, contentType: string | null): boolean {
  if (contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(name ?? "");
}

async function prepareRoleIconBuffer(input: Buffer): Promise<Buffer> {
  let out = await sharp(input)
    .rotate()
    .resize(128, 128, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  if (out.length > ICON_MAX_BYTES) {
    out = await sharp(input)
      .rotate()
      .resize(64, 64, { fit: "cover", position: "centre" })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  if (out.length > ICON_MAX_BYTES) {
    throw new Error("Image is still too large after resize.");
  }
  return out;
}

async function requireSupremeMember(
  message: Message<true>,
): Promise<GuildMember | null> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member || !hasSupremeAccess(member)) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(REMOVE_COLOR)
          .setDescription(
            "You must have **Supreme** or **Mythic** to manage a custom role.",
          ),
      ],
    });
    return null;
  }
  return member;
}

function overviewButtons(ownerId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`crole:edit:${ownerId}`)
        .setLabel("Edit Role")
        .setEmoji("📝")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`crole:members:${ownerId}`)
        .setLabel("View Members")
        .setEmoji("👤")
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`crole:vis:open:${ownerId}`)
        .setLabel("Manage Roles")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`crole:boostlogs:${ownerId}`)
        .setLabel("Boost Logs")
        .setEmoji("👀")
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`crole:delete:${ownerId}`)
        .setLabel("Delete Role")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildOverviewEmbed(
  member: GuildMember,
  role: Role,
): EmbedBuilder {
  const primary =
    role.colors?.primaryColor || role.color || OVERVIEW_COLOR_FALLBACK;
  const secondary = role.colors?.secondaryColor;
  const ruler = canUseCustomRoleGradient(member);
  const colorLine =
    ruler && secondary
      ? `🎡 **Color:** ${hexOf(primary)} → ${hexOf(secondary)} _(gradient)_`
      : `🎡 **Color:** ${hexOf(primary)} _(solid)_`;
  const iconUrl = role.iconURL({ size: 256 });
  const embed = new EmbedBuilder()
    .setColor(SETUP_EMBED_COLOR)
    .setAuthor({
      name: "Role Information",
      iconURL: member.displayAvatarURL({ size: 64 }),
    })
    .setDescription(
      [
        `⭐ **Name:** ***${role.name}***`,
        colorLine,
        `😍 **Icon:** ${iconUrl ? "Shown on right" : "_None_"}`,
      ].join("\n"),
    );
  if (iconUrl) embed.setThumbnail(iconUrl);
  return embed;
}

async function sendSetup(
  message: Message<true>,
  member: GuildMember,
): Promise<void> {
  const { role } = await ensureOwnerCustomRole(member);
  await message.reply({
    embeds: [buildOverviewEmbed(member, role)],
    components: overviewButtons(member.id),
  });
}

/** Resolve give target: mention → reply → id arg. */
async function resolveGiveTarget(
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

async function handleGive(
  message: Message<true>,
  member: GuildMember,
  args: string[],
): Promise<void> {
  const { role } = await ensureOwnerCustomRole(member);
  if (!canManageDiscordRole(message.guild, role)) {
    await message.reply(
      "I can't assign your role — move my bot role **above** your custom role.",
    );
    return;
  }

  const target = await resolveGiveTarget(message, args);
  if (!target) {
    await message.reply(
      "Who should get your role? Usage: `!role give @user` (or reply to them).",
    );
    return;
  }
  if (target.id === member.id) {
    await message.reply("You already own that role.");
    return;
  }
  if (target.user.bot) {
    await message.reply("You can't give your role to a bot.");
    return;
  }

  if (target.roles.cache.has(role.id)) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(GIVE_COLOR)
          .setDescription(
            `${target.displayName} already has **${role.name}**`,
          ),
      ],
    });
    return;
  }

  // Same Discord role for owner + recipients — do not rewrite colors here
  // (that was stripping the owner's gradient for everyone).

  await target.roles.add(role, `Custom role given by ${member.user.tag}`);
  await recordRoleGive({
    guildId: message.guildId,
    discordRoleId: role.id,
    userId: target.id,
    givenBy: member.id,
  });

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(GIVE_COLOR)
        .setDescription(
          [
            `<@${target.id}> was __given__ your role`,
            "Use `!role removeme` to remove your role",
          ].join("\n"),
        ),
    ],
    allowedMentions: { users: [target.id] },
  });
}

type Removable = { row: CustomRoleRow; role: Role };

async function listRemovableRoles(
  guild: Guild,
  member: GuildMember,
): Promise<Removable[]> {
  const all = await listCustomRoles(guild.id);
  const out: Removable[] = [];
  for (const row of all) {
    if (row.ownerId === member.id) continue;
    if (!member.roles.cache.has(row.discordRoleId)) continue;
    const role = await guild.roles.fetch(row.discordRoleId).catch(() => null);
    if (role) out.push({ row, role });
  }
  out.sort((a, b) => a.role.name.localeCompare(b.role.name));
  return out;
}

function removemeKey(
  guildId: string,
  userId: string,
  messageId: string,
): string {
  return `${guildId}:${userId}:${messageId}`;
}

function buildRemovemePayload(
  member: GuildMember,
  roles: Removable[],
  page: number,
  selectedRoleId: string | null,
): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<
    ButtonBuilder | StringSelectMenuBuilder
  >[];
} {
  const totalPages = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = roles.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const lines =
    slice.length === 0
      ? ["_You don't have any shared custom roles to remove._"]
      : slice.map((r) => {
          const mark = selectedRoleId === r.role.id ? "✅" : "✅";
          return `${mark} <@&${r.role.id}> **(Displayed)**`;
        });

  const embed = new EmbedBuilder()
    .setColor(REMOVE_COLOR)
    .setAuthor({
      name: "Remove Role",
      iconURL: member.displayAvatarURL({ size: 64 }),
    })
    .setDescription(
      [
        "ℹ️ **Select the role you would like to remove**",
        `🛡️ **Available Roles: ${roles.length}**`,
        "",
        ...lines,
      ].join("\n"),
    );

  const components: ActionRowBuilder<
    ButtonBuilder | StringSelectMenuBuilder
  >[] = [];

  if (slice.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`crole:rm:select:${safePage}`)
          .setPlaceholder("Select Role To Remove")
          .addOptions(
            slice.map((r) => ({
              label: r.role.name.slice(0, 100),
              value: r.role.id,
              description: "Remove this custom role from yourself",
            })),
          ),
      ),
    );
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`crole:rm:prev:${safePage}`)
        .setLabel("Previous")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`crole:rm:page:${safePage}`)
        .setLabel(`${safePage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`crole:rm:next:${safePage}`)
        .setLabel("Next")
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Success)
        .setDisabled(safePage >= totalPages - 1),
    ),
  );

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("crole:rm:manage")
        .setLabel("Manage")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(
          selectedRoleId
            ? `crole:rm:confirm:${selectedRoleId}`
            : "crole:rm:confirm:none",
        )
        .setLabel("Remove Role")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!selectedRoleId),
    ),
  );

  return { embed, components };
}

async function handleRemoveme(message: Message<true>): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    await message.reply("Could not load your member profile.");
    return;
  }

  const roles = await listRemovableRoles(message.guild, member);
  const { embed, components } = buildRemovemePayload(member, roles, 0, null);
  const sent = await message.reply({ embeds: [embed], components });
  // Seed map so pagination knows the message (selection stored later)
  removemeSelected.set(removemeKey(message.guildId, member.id, sent.id), "");
}

type AcquiredRole = { row: CustomRoleRow; role: Role; hidden: boolean };

async function listAcquiredCustomRoles(
  guild: Guild,
  member: GuildMember,
): Promise<AcquiredRole[]> {
  const [allRoles, memberships] = await Promise.all([
    listCustomRoles(guild.id),
    listCustomRoleMembersForUser(guild.id, member.id),
  ]);
  const byDiscordId = new Map(allRoles.map((r) => [r.discordRoleId, r]));
  const seen = new Set<string>();
  const out: AcquiredRole[] = [];
  const ownerActive = new Map<string, boolean>();

  const isOwnerSupremeActive = async (ownerId: string): Promise<boolean> => {
    if (ownerActive.has(ownerId)) return ownerActive.get(ownerId)!;
    const owner = await guild.members.fetch(ownerId).catch(() => null);
    const active = !!owner && hasSupremeAccess(owner);
    ownerActive.set(ownerId, active);
    return active;
  };

  const push = async (discordRoleId: string, forceHidden?: boolean) => {
    if (seen.has(discordRoleId)) return;
    const row = byDiscordId.get(discordRoleId);
    if (!row || row.ownerId === member.id) return;
    // Inactive Supreme owners: role stays linked but cannot be displayed.
    if (!(await isOwnerSupremeActive(row.ownerId))) return;
    const role = await guild.roles.fetch(discordRoleId).catch(() => null);
    if (!role) return;
    seen.add(discordRoleId);
    const hidden =
      forceHidden ?? !member.roles.cache.has(discordRoleId);
    out.push({ row, role, hidden });
  };

  for (const m of memberships) {
    await push(m.discordRoleId);
  }
  for (const row of allRoles) {
    if (member.roles.cache.has(row.discordRoleId)) {
      await push(row.discordRoleId, false);
    }
  }

  out.sort((a, b) => a.role.name.localeCompare(b.role.name));
  return out;
}

function manageKey(
  guildId: string,
  userId: string,
  messageId: string,
): string {
  return `${guildId}:${userId}:${messageId}`;
}

function buildManageRolesPayload(
  member: GuildMember,
  roles: AcquiredRole[],
  page: number,
): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
} {
  const totalPages = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = roles.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const lines =
    slice.length === 0
      ? ["_You don't have any gifted custom roles yet._"]
      : slice.map((r) => {
          const mark = r.hidden ? "☐" : "✅";
          const status = r.hidden ? "**(Hidden)**" : "**(Displayed)**";
          return `${mark} <@&${r.role.id}> ${status}`;
        });

  const embed = new EmbedBuilder()
    .setColor(SETUP_EMBED_COLOR)
    .setAuthor({
      name: "Manage Roles",
      iconURL: member.displayAvatarURL({ size: 64 }),
    })
    .setDescription(
      [
        `🛡️ **Available Roles: ${roles.length}**`,
        "",
        ...lines,
      ].join("\n"),
    );

  const components: ActionRowBuilder<
    ButtonBuilder | StringSelectMenuBuilder
  >[] = [];

  if (slice.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`crole:vis:select:${safePage}`)
      .setPlaceholder("Select roles to display or hide")
      .setMinValues(1)
      .setMaxValues(slice.length)
      .addOptions(
        slice.map((r) => ({
          label: r.role.name.slice(0, 100),
          value: r.role.id,
          description: r.hidden ? "Currently hidden" : "Currently displayed",
        })),
      );
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    );
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`crole:vis:prev:${safePage}`)
        .setLabel("Previous")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`crole:vis:page:${safePage}`)
        .setLabel(`${safePage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`crole:vis:next:${safePage}`)
        .setLabel("Next")
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Success)
        .setDisabled(safePage >= totalPages - 1),
    ),
  );

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("crole:vis:setup")
        .setLabel("Manage")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("crole:vis:remove")
        .setLabel("Remove Role")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(roles.length === 0),
    ),
  );

  return { embed, components };
}

async function sendManageRolesMessage(
  message: Message<true>,
  member: GuildMember,
): Promise<void> {
  const roles = await listAcquiredCustomRoles(message.guild, member);
  const { embed, components } = buildManageRolesPayload(member, roles, 0);
  const sent = await message.reply({ embeds: [embed], components });
  manageSelected.set(manageKey(message.guildId, member.id, sent.id), []);
}

async function handleManageRoles(message: Message<true>): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    await message.reply("Could not load your member profile.");
    return;
  }
  await sendManageRolesMessage(message, member);
}

async function refreshManageRoles(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  page: number,
): Promise<void> {
  const guild = interaction.guild!;
  const member = await guild.members.fetch(interaction.user.id);
  const roles = await listAcquiredCustomRoles(guild, member);
  const { embed, components } = buildManageRolesPayload(member, roles, page);
  await interaction.update({ embeds: [embed], components });
}

async function toggleAcquiredRoleVisibility(
  member: GuildMember,
  roleId: string,
): Promise<"shown" | "hidden" | "error" | "inactive"> {
  const guild = member.guild;
  const record = await getCustomRoleByDiscordId(guild.id, roleId);
  if (!record || record.ownerId === member.id) return "error";

  const owner = await guild.members.fetch(record.ownerId).catch(() => null);
  if (!owner || !hasSupremeAccess(owner)) return "inactive";

  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role || !canManageDiscordRole(guild, role)) return "error";

  const showing = member.roles.cache.has(roleId);
  if (showing) {
    await member.roles.remove(role, "Custom role hidden via !role manage");
    await recordRoleGive({
      guildId: guild.id,
      discordRoleId: roleId,
      userId: member.id,
      givenBy: record.ownerId,
    });
    return "hidden";
  }

  await member.roles.add(role, "Custom role shown via !role manage");
  await recordRoleGive({
    guildId: guild.id,
    discordRoleId: roleId,
    userId: member.id,
    givenBy: record.ownerId,
  });
  return "shown";
}

async function handleManageRolesInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return;

  const parts = interaction.customId.split(":");
  // crole:vis:open:ownerId | select:page | prev:page | next:page | setup | remove

  if (interaction.isButton() && parts[2] === "open") {
    if (!(await assertButtonOwner(interaction))) return;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const roles = await listAcquiredCustomRoles(interaction.guild, member);
    const { embed, components } = buildManageRolesPayload(member, roles, 0);
    await interaction.update({ embeds: [embed], components });
    manageSelected.set(
      manageKey(interaction.guildId!, member.id, interaction.message.id),
      [],
    );
    return;
  }

  if (interaction.isStringSelectMenu() && parts[2] === "select") {
    const page = Number(parts[3] ?? "0") || 0;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const ids = interaction.values;
    manageSelected.set(
      manageKey(interaction.guildId!, member.id, interaction.message.id),
      ids,
    );
    for (const roleId of ids) {
      try {
        await toggleAcquiredRoleVisibility(member, roleId);
      } catch (err) {
        console.warn("[crole] visibility toggle failed:", err);
      }
    }
    await refreshManageRoles(interaction, page);
    return;
  }

  if (!interaction.isButton()) return;

  if (parts[2] === "prev") {
    const page = Math.max(0, (Number(parts[3] ?? "0") || 0) - 1);
    await refreshManageRoles(interaction, page);
    return;
  }

  if (parts[2] === "next") {
    const page = (Number(parts[3] ?? "0") || 0) + 1;
    await refreshManageRoles(interaction, page);
    return;
  }

  if (parts[2] === "setup") {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!hasSupremeAccess(member)) {
      await interaction.reply({
        content:
          "Only **Supreme** or **Mythic** can edit a custom role. Use `!role setup` if you have one of those roles.",
        ephemeral: true,
      });
      return;
    }
    const { role } = await ensureOwnerCustomRole(member);
    await interaction.update({
      embeds: [buildOverviewEmbed(member, role)],
      components: overviewButtons(member.id),
    });
    return;
  }

  if (parts[2] === "remove") {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const key = manageKey(
      interaction.guildId!,
      member.id,
      interaction.message.id,
    );
    const selected = manageSelected.get(key) ?? [];
    if (selected.length === 0) {
      await interaction.reply({
        content: "Select a role first, then click **Remove Role**.",
        ephemeral: true,
      });
      return;
    }

    const owned = await getCustomRoleByOwner(interaction.guildId!, member.id);
    let removed = 0;
    for (const roleId of selected) {
      if (owned?.discordRoleId === roleId) continue;
      const record = await getCustomRoleByDiscordId(
        interaction.guildId!,
        roleId,
      );
      if (!record) continue;
      const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
      if (role && member.roles.cache.has(roleId)) {
        if (!canManageDiscordRole(interaction.guild, role)) continue;
        await member.roles
          .remove(role, "Custom role removed via !role manage")
          .catch(() => null);
      }
      await removeRoleMemberRecord({
        guildId: interaction.guildId!,
        discordRoleId: roleId,
        userId: member.id,
      });
      removed += 1;
    }

    manageSelected.set(key, []);
    if (removed === 0) {
      await interaction.reply({
        content: "Couldn't remove that role — try another.",
        ephemeral: true,
      });
      return;
    }
    await refreshManageRoles(interaction, 0);
  }
}

type OverviewMode = "creators" | "users" | "boosts";

function parseOverviewMode(raw: string | undefined): OverviewMode {
  if (raw === "users") return "users";
  if (raw === "creators") return "creators";
  return "boosts";
}

function overviewModeLabel(mode: OverviewMode): string {
  if (mode === "users") return "👤 Most Users";
  if (mode === "boosts") return "⚡ Most Boosts";
  return "🛡️ Creators";
}

type OverviewEntry = {
  row: CustomRoleRow;
  role: Role;
  memberCount: number;
};

async function collectOverviewEntries(
  guild: Guild,
  fetchMembers: boolean,
): Promise<OverviewEntry[]> {
  const rows = await listCustomRoles(guild.id);
  await guild.roles.fetch().catch(() => null);
  if (fetchMembers) {
    await guild.members.fetch().catch(() => null);
  }

  const out: OverviewEntry[] = [];
  for (const row of rows) {
    const owner = await guild.members.fetch(row.ownerId).catch(() => null);
    // Hide roles from inactive (expired) Supreme owners until they regain Supreme.
    if (!owner || !hasSupremeAccess(owner)) continue;
    const role =
      guild.roles.cache.get(row.discordRoleId) ??
      (await guild.roles.fetch(row.discordRoleId).catch(() => null));
    if (!role) continue;
    out.push({
      row,
      role,
      memberCount: role.members.size,
    });
  }
  return out;
}

function sortOverviewEntries(
  entries: OverviewEntry[],
  mode: OverviewMode,
  boostCounts?: Map<string, number>,
): OverviewEntry[] {
  const copy = [...entries];
  if (mode === "users") {
    copy.sort(
      (a, b) =>
        b.memberCount - a.memberCount ||
        a.role.name.localeCompare(b.role.name, undefined, {
          sensitivity: "base",
        }),
    );
  } else if (mode === "boosts") {
    copy.sort(
      (a, b) =>
        (boostCounts?.get(b.role.id) ?? 0) -
          (boostCounts?.get(a.role.id) ?? 0) ||
        a.role.name.localeCompare(b.role.name, undefined, {
          sensitivity: "base",
        }),
    );
  } else {
    copy.sort((a, b) =>
      a.role.name.localeCompare(b.role.name, undefined, {
        sensitivity: "base",
      }),
    );
  }
  return copy;
}

async function fetchBoostCountMap(guildId: string): Promise<Map<string, number>> {
  const totals = await getWeeklyBoostTotalsByRole(guildId);
  return new Map(totals.map((t) => [t.discordRoleId, t.count]));
}

function buildRoleOverviewPayload(
  guild: Guild,
  entries: OverviewEntry[],
  mode: OverviewMode,
  page: number,
  boostCounts?: Map<string, number>,
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
} {
  const sorted = sortOverviewEntries(entries, mode, boostCounts);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = sorted.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const lines =
    slice.length === 0
      ? ["_No custom roles yet._"]
      : slice.map((e, i) => {
          const n = safePage * PAGE_SIZE + i + 1;
          if (mode === "users") {
            return `${n}. <@&${e.role.id}> - \`${e.memberCount}\` Users`;
          }
          if (mode === "boosts") {
            const count = boostCounts?.get(e.role.id) ?? 0;
            return `${n}. <@&${e.role.id}> - \`${count}\` Boost${count === 1 ? "" : "s"} (<@${e.row.ownerId}>)`;
          }
          return `${n}. <@&${e.role.id}> - <@${e.row.ownerId}>`;
        });

  const modeDescription =
    mode === "users"
      ? "View roles sorted by user count (highest first)"
      : mode === "boosts"
        ? "View roles sorted by weekly boosts (highest first)"
        : "View a list of roles and their creators";

  const embed = new EmbedBuilder()
    .setColor(SETUP_EMBED_COLOR)
    .setAuthor({
      name: `Role Overview (${safePage + 1}/${totalPages})`,
      iconURL: guild.iconURL({ size: 64 }) ?? undefined,
    })
    .setDescription(
      [
        modeDescription,
        "",
        mode === "boosts" ? "⚡ **Boost Leaderboard**" : "🛡️ **Roles**",
        ...lines,
      ].join("\n"),
    );
  if (mode === "boosts") {
    embed.setFooter({
      text: "Weekly #1 earns Hesitation Ruler at reset (Monday UTC) — gradient unlock then",
    });
  }

  const modeSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("crole:ov:mode")
      .setPlaceholder(overviewModeLabel(mode))
      .addOptions(
        {
          label: "Creators",
          value: "creators",
          emoji: "🛡️",
          description: "Who owns each custom role",
          default: mode === "creators",
        },
        {
          label: "Most Users",
          value: "users",
          emoji: "👤",
          description: "Roles with the most members",
          default: mode === "users",
        },
        {
          label: "Most Boosts",
          value: "boosts",
          emoji: "⚡",
          description: "Weekly boost leaderboard",
          default: mode === "boosts",
        },
      ),
  );

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`crole:ov:prev:${mode}:${safePage}`)
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(`crole:ov:page:${mode}:${safePage}`)
      .setLabel(`${safePage + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`crole:ov:next:${mode}:${safePage}`)
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Success)
      .setDisabled(safePage >= totalPages - 1),
  );

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] =
    [modeSelect, nav];

  if (mode === "users") {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`crole:ov:load:${mode}:${safePage}`)
          .setLabel("Load Users")
          .setEmoji("👤")
          .setStyle(ButtonStyle.Primary),
      ),
    );
  }

  return {
    embeds: [embed],
    components,
  };
}

async function handleRoleOverview(message: Message<true>): Promise<void> {
  const mode: OverviewMode = "boosts";
  const entries = await collectOverviewEntries(message.guild, false);
  const boostCounts = await fetchBoostCountMap(message.guild.id);
  const payload = buildRoleOverviewPayload(
    message.guild,
    entries,
    mode,
    0,
    boostCounts,
  );
  await message.reply(payload);
}

async function refreshRoleOverviewMessage(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  mode: OverviewMode,
  page: number,
  fetchMembers: boolean,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }

  const entries = await collectOverviewEntries(guild, fetchMembers);
  const boostCounts =
    mode === "boosts" ? await fetchBoostCountMap(guild.id) : undefined;
  const payload = buildRoleOverviewPayload(
    guild,
    entries,
    mode,
    page,
    boostCounts,
  );
  await interaction.editReply(payload);
}

async function handleOverviewInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: "Use this in a server.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const mode = parseOverviewMode(interaction.values[0]);
    await refreshRoleOverviewMessage(
      interaction,
      mode,
      0,
      mode === "users",
    );
    return;
  }

  const parts = interaction.customId.split(":");
  // crole:ov:prev|next|page|load:mode:page
  const action = parts[2];
  const mode = parseOverviewMode(parts[3]);
  const page = Number(parts[4] ?? "0");
  if (!Number.isInteger(page) || page < 0) return;

  if (action === "page") {
    await interaction.deferUpdate();
    return;
  }

  if (action === "prev") {
    await refreshRoleOverviewMessage(
      interaction,
      mode,
      Math.max(0, page - 1),
      mode === "users",
    );
    return;
  }

  if (action === "next") {
    await refreshRoleOverviewMessage(
      interaction,
      mode,
      page + 1,
      mode === "users",
    );
    return;
  }

  if (action === "load") {
    await refreshRoleOverviewMessage(interaction, mode, page, true);
    await interaction.followUp({
      content: "Member counts refreshed.",
      ephemeral: true,
    });
    return;
  }
}

export async function handleRoleCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const sub = (args[0] ?? "setup").toLowerCase();
  const rest = args.slice(1);

  if (sub === "setup" || sub === "info" || sub === "view") {
    const member = await requireSupremeMember(message);
    if (!member) return;
    await sendSetup(message, member);
    return;
  }

  if (sub === "manage" || sub === "hide" || sub === "display") {
    await handleManageRoles(message);
    return;
  }

  if (sub === "overview" || sub === "list" || sub === "all") {
    await handleRoleOverview(message);
    return;
  }

  if (sub === "give" || sub === "add" || sub === "share") {
    const member = await requireSupremeMember(message);
    if (!member) return;
    await handleGive(message, member, rest);
    return;
  }

  if (sub === "removeme" || sub === "remove" || sub === "leave") {
    await handleRemoveme(message);
    return;
  }

  // Unknown / mistyped subcommand — stay silent (no help dump).
}

async function loadOwnerRole(
  interaction: Interaction,
): Promise<{ member: GuildMember; role: Role; row: CustomRoleRow } | null> {
  if (!interaction.inGuild() || !interaction.guild || !interaction.member) {
    return null;
  }
  const member =
    typeof interaction.member.roles === "object" &&
    "cache" in interaction.member
      ? (interaction.member as GuildMember)
      : await interaction.guild.members.fetch(interaction.user.id);

  if (!hasSupremeAccess(member)) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: "Only **Supreme** or **Mythic** can manage a custom role.",
        ephemeral: true,
      });
    }
    return null;
  }

  const ensured = await ensureOwnerCustomRole(member);
  return { member, role: ensured.role, row: ensured.row };
}

function editMenuComponents(
  member: GuildMember,
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const ownerId = member.id;
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`crole:edit:select:${ownerId}`)
        .setPlaceholder("Select what to edit...")
        .addOptions(
          {
            label: "Name",
            description: "Edit role name",
            value: "name",
            emoji: "⭐",
          },
          {
            label: "Color",
            description: canUseCustomRoleGradient(member)
              ? "Solid or gradient role color"
              : "Edit solid role color",
            value: "color",
            emoji: "🎡",
          },
          {
            label: "Icon",
            description: "Upload an image for the role icon",
            value: "icon",
            emoji: "😍",
          },
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`crole:back:${ownerId}`)
        .setLabel("Back To Main Menu")
        .setEmoji("↩️")
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

async function showEditMenu(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  member: GuildMember,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(EDIT_COLOR)
    .setAuthor({
      name: "Editing Role",
      iconURL: member.displayAvatarURL({ size: 64 }),
    })
    .setDescription("👆 **Select what you would like to edit**");

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await interaction.update({
      embeds: [embed],
      components: editMenuComponents(member),
    });
  }
}

async function showOverviewMessage(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  member: GuildMember,
  role: Role,
): Promise<void> {
  await interaction.update({
    embeds: [buildOverviewEmbed(member, role)],
    components: overviewButtons(member.id),
  });
}

function ownerIdFromCustomId(customId: string): string | null {
  // crole:edit:USER | crole:back:USER | crole:edit:select:USER | crole:delete:confirm (no owner)
  const parts = customId.split(":");
  if (parts[0] !== "crole") return null;
  if (parts[1] === "edit" && parts[2] === "select") return parts[3] ?? null;
  if (parts[1] === "vis" && parts[2] === "open") return parts[3] ?? null;
  if (parts[1] === "modal") return null;
  if (parts[1] === "rm") return null;
  if (parts[1] === "vis") return null;
  if (parts[1] === "delete" && (parts[2] === "confirm" || parts[2] === "cancel")) {
    return null;
  }
  return parts[2] ?? null;
}

async function assertButtonOwner(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<boolean> {
  const ownerId = ownerIdFromCustomId(interaction.customId);
  if (!ownerId) return true;
  if (interaction.user.id === ownerId) return true;
  await interaction.reply({
    content: "Only the **owner** of this custom role can use that.",
    ephemeral: true,
  });
  return false;
}

async function handleOwnerButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!(await assertButtonOwner(interaction))) return;

  const loaded = await loadOwnerRole(interaction);
  if (!loaded) return;
  const { member, role } = loaded;
  const action = interaction.customId.split(":")[1];

  if (action === "edit") {
    await showEditMenu(interaction, member);
    return;
  }

  if (action === "back") {
    await showOverviewMessage(interaction, member, role);
    return;
  }

  if (action === "members") {
    await interaction.deferReply({ ephemeral: true });
    await interaction.guild!.members.fetch().catch(() => null);
    const holders = interaction
      .guild!.members.cache.filter((m) => m.roles.cache.has(role.id))
      .map((m) => m)
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
        }),
      );

    const removable = holders.filter((m) => m.id !== member.id);
    const sample = holders.slice(0, 30);

    const components: ActionRowBuilder<
      ButtonBuilder | StringSelectMenuBuilder
    >[] = [];

    if (removable.length > 0) {
      components.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`crole:members:rm:${member.id}`)
            .setPlaceholder("Remove a member from your role…")
            .addOptions(
              removable.slice(0, 25).map((m) => ({
                label: m.displayName.slice(0, 100),
                value: m.id,
                description: `@${m.user.username}`.slice(0, 100),
              })),
            ),
        ),
      );
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(role.colors?.primaryColor || role.color || EDIT_COLOR)
          .setAuthor({
            name: "Role Members",
            iconURL: member.displayAvatarURL({ size: 64 }),
          })
          .setDescription(
            holders.length === 0
              ? "_Nobody has this role._"
              : [
                  `**${holders.length}** member${holders.length === 1 ? "" : "s"}`,
                  "",
                  sample.map((m) => `• <@${m.id}>`).join("\n"),
                  holders.length > 30
                    ? `\n_…and ${holders.length - 30} more_`
                    : "",
                  removable.length > 0
                    ? "\n_Select someone below to remove them (you can't remove yourself)._"
                    : "\n_No one else has this role to remove._",
                ].join("\n"),
          ),
      ],
      components,
    });
    return;
  }

  if (action === "boostlogs") {
    const owner = await interaction.guild!.members
      .fetch(loaded.row.ownerId)
      .catch(() => null);
    const boosted = owner?.premiumSince;
    await interaction.reply({
      ephemeral: true,
      embeds: [
        new EmbedBuilder()
          .setColor(EDIT_COLOR)
          .setAuthor({
            name: "Boost Logs",
            iconURL: member.displayAvatarURL({ size: 64 }),
          })
          .setDescription(
            [
              `👀 **Owner:** <@${loaded.row.ownerId}>`,
              boosted
                ? `🚀 Boosting since <t:${Math.floor(boosted.getTime() / 1000)}:D>`
                : "🚀 Owner is **not** currently boosting this server.",
              "",
              "_Full boost history for shared members isn’t tracked yet._",
            ].join("\n"),
          ),
      ],
    });
    return;
  }

  if (action === "delete") {
    await interaction.reply({
      ephemeral: true,
      embeds: [
        new EmbedBuilder()
          .setColor(REMOVE_COLOR)
          .setDescription(
            `Delete **${role.name}**? This removes the role from everyone.`,
          ),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`crole:delete:confirm:${member.id}`)
            .setLabel("Confirm Delete")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`crole:delete:cancel:${member.id}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }
}

async function handleDeleteConfirm(
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split(":");
  const ownerId = parts[3];
  if (ownerId && interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Only the **owner** of this custom role can use that.",
      ephemeral: true,
    });
    return;
  }

  if (parts[2] === "cancel") {
    await interaction.update({
      content: "Cancelled.",
      embeds: [],
      components: [],
    });
    return;
  }

  const loaded = await loadOwnerRole(interaction);
  if (!loaded) return;
  const { member, role, row } = loaded;

  if (!canManageDiscordRole(interaction.guild!, role)) {
    await interaction.update({
      content: "I can't delete that role — check my role position.",
      embeds: [],
      components: [],
    });
    return;
  }

  await deleteCustomRoleRecord(interaction.guildId!, member.id);
  await role.delete(`Custom role deleted by ${interaction.user.tag}`).catch(
    (err) => console.error("[crole] delete failed:", err),
  );

  await interaction.update({
    content: `Deleted custom role **${role.name}** (\`${row.discordRoleId}\`).`,
    embeds: [],
    components: [],
  });
}

async function handleEditSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!(await assertButtonOwner(interaction))) return;

  const loaded = await loadOwnerRole(interaction);
  if (!loaded) return;
  const { role, member } = loaded;
  const choice = interaction.values[0];
  const ownerId = interaction.user.id;

  if (choice === "name") {
    const modal = new ModalBuilder()
      .setCustomId(`crole:modal:name:${ownerId}`)
      .setTitle("Edit Role Name")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("name")
            .setLabel("New role name")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setValue(role.name.slice(0, 100))
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  if (choice === "color") {
    const primary =
      role.colors?.primaryColor || role.color || OVERVIEW_COLOR_FALLBACK;
    const secondary = role.colors?.secondaryColor;
    const ruler = canUseCustomRoleGradient(member);
    const rows = [
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("primary")
          .setLabel(ruler ? "Primary color (hex)" : "Solid color (hex)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("#E2DBB9")
          .setValue(hexOf(primary))
          .setRequired(true),
      ),
    ];
    if (ruler) {
      rows.push(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("secondary")
            .setLabel("Secondary color (hex, optional)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Leave blank for solid")
            .setValue(secondary ? hexOf(secondary) : "")
            .setRequired(false),
        ),
      );
    }
    const modal = new ModalBuilder()
      .setCustomId(`crole:modal:color:${ownerId}`)
      .setTitle(ruler ? "Edit Role Gradient" : "Edit Role Color")
      .addComponents(...rows);
    await interaction.showModal(modal);
    return;
  }

  if (choice === "icon") {
    await startIconUpload(interaction, role);
  }
}

async function startIconUpload(
  interaction: StringSelectMenuInteraction,
  role: Role,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "Icon upload only works in a server.",
      ephemeral: true,
    });
    return;
  }

  if (!canManageDiscordRole(guild, role)) {
    await interaction.reply({
      content: "I can't edit that role — move my bot role above it.",
      ephemeral: true,
    });
    return;
  }

  const key = iconPendingKey(guild.id, interaction.user.id);
  const existing = pendingIconUploads.get(key);
  if (existing) existing.stop();

  let dm;
  try {
    dm = await interaction.user.createDM();
    await dm.send({
      content: [
        `📤 **Upload a role icon** for **${role.name}** in **${guild.name}**`,
        "Send an **image** here within **60 seconds** (PNG, JPG, WebP, or GIF).",
        "Square crops work best — I'll resize it for Discord.",
        "Type `clear` to remove the current icon, or `cancel` to abort.",
        "",
        "_(Server Boost Level 2+ is required for role icons.)_",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("[crole] Could not DM user for icon upload:", err);
    await interaction.reply({
      ephemeral: true,
      content:
        "I couldn't DM you. Enable **Allow direct messages from server members** for this server, then try **Icon** again.",
    });
    return;
  }

  await interaction.reply({
    ephemeral: true,
    content: "Check your DMs — send me the image there (or `clear` / `cancel`).",
  });

  const collector = dm.createMessageCollector({
    filter: (m) => {
      if (m.author.id !== interaction.user.id) return false;
      const text = m.content.trim().toLowerCase();
      if (text === "cancel" || text === "clear" || text === "remove") return true;
      return m.attachments.some((a) =>
        isImageAttachment(a.name, a.contentType),
      );
    },
    time: ICON_UPLOAD_MS,
    max: 1,
  });

  pendingIconUploads.set(key, { stop: () => collector.stop("replaced") });

  collector.on("collect", (msg) => {
    void (async () => {
      const text = msg.content.trim().toLowerCase();

      if (text === "cancel") {
        await dm.send("Icon upload cancelled.").catch(() => {});
        return;
      }

      if (text === "clear" || text === "remove") {
        try {
          await role.setIcon(
            null,
            `Custom role icon cleared by ${msg.author.tag}`,
          );
          await dm.send("Role icon **removed**.").catch(() => {});
        } catch (err) {
          console.warn("[crole] clearIcon failed:", err);
          await dm
            .send(
              "Couldn't clear the icon. Make sure my role is above yours and the server has Boost Level 2+.",
            )
            .catch(() => {});
        }
        return;
      }

      const attachment = [...msg.attachments.values()].find((a) =>
        isImageAttachment(a.name, a.contentType),
      );
      if (!attachment) {
        await dm.send("No image found on that message.").catch(() => {});
        return;
      }

      try {
        const res = await fetch(attachment.url);
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        const raw = Buffer.from(await res.arrayBuffer());
        const icon = await prepareRoleIconBuffer(raw);
        await role.setIcon(icon, `Custom role icon by ${msg.author.tag}`);
        await dm.send("Role icon updated from your upload.").catch(() => {});
      } catch (err) {
        console.warn("[crole] setIcon from upload failed:", err);
        const detail =
          err instanceof Error && err.message.includes("too large")
            ? " That image is too large even after resize — try a simpler PNG."
            : " The server usually needs **Boost Level 2+**, and my role must sit above yours.";
        await dm.send(`Couldn't set the icon.${detail}`).catch(() => {});
      }
    })();
  });

  collector.on("end", (_collected, reason) => {
    pendingIconUploads.delete(key);
    if (reason === "time") {
      void dm
        .send("Icon upload timed out — pick **Icon** again in the server to retry.")
        .catch(() => {});
    }
  });
}

async function handleModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const ownerId = interaction.customId.split(":")[3];
  if (ownerId && interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Only the **owner** of this custom role can use that.",
      ephemeral: true,
    });
    return;
  }

  const loaded = await loadOwnerRole(interaction);
  if (!loaded) return;
  const { role } = loaded;

  if (!canManageDiscordRole(interaction.guild!, role)) {
    await interaction.reply({
      content: "I can't edit that role — move my bot role above it.",
      ephemeral: true,
    });
    return;
  }

  const kind = interaction.customId.split(":")[2];

  if (kind === "name") {
    const name = interaction.fields.getTextInputValue("name").trim().slice(0, 100);
    if (!name) {
      await interaction.reply({ content: "Name can't be empty.", ephemeral: true });
      return;
    }
    await role.setName(name, `Custom role rename by ${interaction.user.tag}`);
    await interaction.reply({
      ephemeral: true,
      content: `Name set to **${name}**.`,
    });
    return;
  }

  if (kind === "color") {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const ruler = canUseCustomRoleGradient(member);
    const primary = parseHex(interaction.fields.getTextInputValue("primary"));
    if (primary == null) {
      await interaction.reply({
        content: "Color must be a 6-digit hex like `#E2DBB9`.",
        ephemeral: true,
      });
      return;
    }

    let secondary: number | null = null;
    if (ruler) {
      const rawSecondary = interaction.fields
        .getTextInputValue("secondary")
        ?.trim();
      if (rawSecondary) {
        secondary = parseHex(rawSecondary);
        if (secondary == null) {
          await interaction.reply({
            content: "Secondary color must be a 6-digit hex like `#FF00AA`.",
            ephemeral: true,
          });
          return;
        }
      }
    }

    await role.edit({
      colors: {
        primaryColor: primary,
        secondaryColor: secondary,
        tertiaryColor: null,
      },
      reason: `Custom role color by ${interaction.user.tag}`,
    });
    if (!ruler || !secondary) {
      await ensureSolidCustomRoleColor(role);
    }

    await interaction.reply({
      ephemeral: true,
      content:
        ruler && secondary
          ? `Gradient set to **${hexOf(primary)}** → **${hexOf(secondary)}**.`
          : `Solid color set to **${hexOf(primary)}**.`,
    });
    return;
  }

  // Legacy emoji-icon modal removed — icons are uploaded as images now.
}

async function refreshRemoveme(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  page: number,
  selectedRoleId: string | null,
): Promise<void> {
  const guild = interaction.guild!;
  const member = await guild.members.fetch(interaction.user.id);
  const roles = await listRemovableRoles(guild, member);
  const { embed, components } = buildRemovemePayload(
    member,
    roles,
    page,
    selectedRoleId,
  );
  await interaction.update({ embeds: [embed], components });
  if (selectedRoleId) {
    removemeSelected.set(
      removemeKey(guild.id, member.id, interaction.message.id),
      selectedRoleId,
    );
  }
}

async function handleRemovemeInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return;

  // Only the user who ran !role removeme can use the controls
  if (interaction.message.interactionMetadata?.user.id) {
    // Message was from a component on a bot reply — author of original is not always available
  }
  const msg = interaction.message;
  // Prefer: only allow if the reply referenced them OR they're the only one — Socialize allows the command author.
  // We store keys with userId; verify message was replied to this user via mention in embeds isn't reliable.
  // Check: interaction.user must match the member who can remove — anyone can open removeme for themselves.
  // For button clicks, ensure the message author is the bot and we don't care who clicked as long as
  // they're removing from themselves — yes, only affects interaction.user's roles.

  const parts = interaction.customId.split(":");
  // crole:rm:select:page | crole:rm:prev:page | crole:rm:next:page | crole:rm:confirm:roleId | crole:rm:manage

  if (interaction.isStringSelectMenu() && parts[2] === "select") {
    const page = Number(parts[3] ?? "0") || 0;
    const selected = interaction.values[0] ?? null;
    await refreshRemoveme(interaction, page, selected);
    return;
  }

  if (!interaction.isButton()) return;

  if (parts[2] === "prev") {
    const page = Math.max(0, (Number(parts[3] ?? "0") || 0) - 1);
    const key = removemeKey(
      interaction.guildId!,
      interaction.user.id,
      interaction.message.id,
    );
    const selected = removemeSelected.get(key) || null;
    await refreshRemoveme(interaction, page, selected || null);
    return;
  }

  if (parts[2] === "next") {
    const page = (Number(parts[3] ?? "0") || 0) + 1;
    const key = removemeKey(
      interaction.guildId!,
      interaction.user.id,
      interaction.message.id,
    );
    const selected = removemeSelected.get(key) || null;
    await refreshRemoveme(interaction, page, selected || null);
    return;
  }

  if (parts[2] === "manage") {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!hasSupremeAccess(member)) {
      await interaction.reply({
        content: "Only **Supreme** or **Mythic** can manage a custom role. Use `!role setup` if you have one of those roles.",
        ephemeral: true,
      });
      return;
    }
    const { role } = await ensureOwnerCustomRole(member);
    await interaction.reply({
      ephemeral: true,
      embeds: [buildOverviewEmbed(member, role)],
      components: overviewButtons(member.id),
    });
    return;
  }

  if (parts[2] === "confirm") {
    const roleId = parts[3];
    if (!roleId || roleId === "none") {
      await interaction.reply({
        content: "Select a role first.",
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const owned = await getCustomRoleByOwner(interaction.guildId!, member.id);
    if (owned?.discordRoleId === roleId) {
      await interaction.reply({
        content: "That’s your own role — use **Delete Role** in `!role setup` instead.",
        ephemeral: true,
      });
      return;
    }

    const record = await getCustomRoleByDiscordId(
      interaction.guildId!,
      roleId,
    );
    if (!record) {
      await interaction.reply({
        content: "That isn’t a tracked custom role.",
        ephemeral: true,
      });
      return;
    }

    if (!member.roles.cache.has(roleId)) {
      await interaction.reply({
        content: "You don’t have that role.",
        ephemeral: true,
      });
      return;
    }

    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role || !canManageDiscordRole(interaction.guild, role)) {
      await interaction.reply({
        content: "I can’t remove that role — check my role position.",
        ephemeral: true,
      });
      return;
    }

    await member.roles.remove(role, `Custom role removed via !role removeme`);
    await removeRoleMemberRecord({
      guildId: interaction.guildId!,
      discordRoleId: roleId,
      userId: member.id,
    });

    removemeSelected.delete(
      removemeKey(interaction.guildId!, member.id, msg.id),
    );
    await refreshRemoveme(interaction, 0, null);
    await interaction.followUp({
      content: `Removed <@&${roleId}> from you.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  }
}

async function handleMembersRemoveSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const ownerId = interaction.customId.split(":")[3];
  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Only the **owner** of this custom role can use that.",
      ephemeral: true,
    });
    return;
  }

  const targetId = interaction.values[0];
  if (!targetId) {
    await interaction.reply({
      content: "No member selected.",
      ephemeral: true,
    });
    return;
  }

  if (targetId === interaction.user.id) {
    await interaction.reply({
      content: "You can't remove yourself from your own role.",
      ephemeral: true,
    });
    return;
  }

  const loaded = await loadOwnerRole(interaction);
  if (!loaded) return;
  const { role } = loaded;

  if (!canManageDiscordRole(interaction.guild!, role)) {
    await interaction.reply({
      content: "I can't manage that role — move my bot role above it.",
      ephemeral: true,
    });
    return;
  }

  const target = await interaction.guild!.members
    .fetch(targetId)
    .catch(() => null);
  if (!target || !target.roles.cache.has(role.id)) {
    await interaction.reply({
      content: "That member doesn't have your role anymore.",
      ephemeral: true,
    });
    return;
  }

  try {
    await target.roles.remove(
      role,
      `Removed from custom role by owner ${interaction.user.tag}`,
    );
    await removeRoleMemberRecord({
      guildId: interaction.guildId!,
      discordRoleId: role.id,
      userId: target.id,
    });
    await interaction.reply({
      ephemeral: true,
      content: `Removed <@${target.id}> from **${role.name}**.`,
      allowedMentions: { users: [] },
    });
  } catch (err) {
    console.error("[crole] members remove failed:", err);
    await interaction.reply({
      ephemeral: true,
      content: "Couldn't remove that member — check my role permissions.",
    });
  }
}

/**
 * Global interaction router for Supreme custom roles (`crole:*`).
 * @returns true if handled
 */
export async function onCustomRoleInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;

  if (
    interaction.isButton() &&
    interaction.customId.startsWith("crole:")
  ) {
    if (interaction.customId.startsWith("crole:ov:")) {
      await handleOverviewInteraction(interaction);
      return true;
    }
    if (interaction.customId.startsWith("crole:rm:")) {
      await handleRemovemeInteraction(interaction);
      return true;
    }
    if (interaction.customId.startsWith("crole:vis:")) {
      await handleManageRolesInteraction(interaction);
      return true;
    }
    if (
      interaction.customId.startsWith("crole:delete:confirm") ||
      interaction.customId.startsWith("crole:delete:cancel")
    ) {
      await handleDeleteConfirm(interaction);
      return true;
    }
    await handleOwnerButton(interaction);
    return true;
  }

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId.startsWith("crole:")
  ) {
    if (interaction.customId === "crole:ov:mode") {
      await handleOverviewInteraction(interaction);
      return true;
    }
    if (interaction.customId.startsWith("crole:rm:")) {
      await handleRemovemeInteraction(interaction);
      return true;
    }
    if (interaction.customId.startsWith("crole:vis:")) {
      await handleManageRolesInteraction(interaction);
      return true;
    }
    if (interaction.customId.startsWith("crole:members:rm:")) {
      await handleMembersRemoveSelect(interaction);
      return true;
    }
    if (interaction.customId.startsWith("crole:edit:select")) {
      await handleEditSelect(interaction);
      return true;
    }
    return true;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("crole:modal:")
  ) {
    await handleModal(interaction);
    return true;
  }

  return false;
}
