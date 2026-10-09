import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type GuildMember,
  type Interaction,
  type Message,
  type TextChannel,
} from "discord.js";

/** Blue accent matching the Age / Gender / Region banners. */
export const PROFILE_ROLES_EMBED_COLOR = 0x3b9eff;

const ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets",
);

const PREFIX = "profileroles";

type ProfileCategory = "gender" | "age" | "region";

type ProfileRoleOption = {
  roleId: string;
  label: string;
  emojiId?: string;
};

const CATEGORIES: Record<
  ProfileCategory,
  {
    bannerFile: string;
    placeholder: string;
    options: ProfileRoleOption[];
  }
> = {
  gender: {
    bannerFile: "roles-gender-banner.png",
    placeholder: "Select your gender role",
    options: [
      {
        roleId: "1549812814800232509",
        label: "Male",
        emojiId: "1549306936623636520",
      },
      {
        roleId: "1549812861872636117",
        label: "Female",
        emojiId: "1549307059927785532",
      },
      {
        roleId: "1549914213395468320",
        label: "Other",
        emojiId: "1549933515418771527",
      },
    ],
  },
  age: {
    bannerFile: "roles-age-banner.png",
    placeholder: "Select your age role",
    options: [
      {
        roleId: "1549812755899355206",
        label: "18-",
        emojiId: "1547834298923622511",
      },
      {
        roleId: "1549812712538775613",
        label: "18+",
        emojiId: "1547834148448772106",
      },
    ],
  },
  region: {
    bannerFile: "roles-region-banner.png",
    placeholder: "Select your region role",
    options: [
      {
        roleId: "1549812935755440290",
        label: "North America",
        emojiId: "1547834386924183642",
      },
      {
        roleId: "1549812988637347840",
        label: "South America",
        emojiId: "1547834386924183642",
      },
      {
        roleId: "1549813052147368038",
        label: "Europe",
        emojiId: "1547834386924183642",
      },
      {
        roleId: "1549813019943378965",
        label: "Asia",
        emojiId: "1547834386924183642",
      },
      {
        roleId: "1549813102730813510",
        label: "Africa",
        emojiId: "1547834386924183642",
      },
      {
        roleId: "1549813171919786045",
        label: "Oceania",
        emojiId: "1547834386924183642",
      },
    ],
  },
};

function selectCustomId(category: ProfileCategory): string {
  return `${PREFIX}:${category}`;
}

function parseSelectCustomId(id: string): ProfileCategory | null {
  const parts = id.split(":");
  if (parts[0] !== PREFIX || parts.length !== 2) return null;
  const category = parts[1];
  if (
    category !== "gender" &&
    category !== "age" &&
    category !== "region"
  ) {
    return null;
  }
  return category;
}

function buildSelectRow(
  category: ProfileCategory,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const def = CATEGORIES[category];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(selectCustomId(category))
    .setPlaceholder(def.placeholder)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      def.options.map((opt) => {
        const option = {
          label: opt.label,
          value: opt.roleId,
          ...(opt.emojiId ? { emoji: { id: opt.emojiId } } : {}),
        };
        return option;
      }),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

async function postCategoryPanel(
  channel: TextChannel,
  category: ProfileCategory,
): Promise<Message> {
  const def = CATEGORIES[category];
  const embed = new EmbedBuilder().setColor(PROFILE_ROLES_EMBED_COLOR);
  const files: AttachmentBuilder[] = [];

  const bannerPath = path.join(ASSETS, def.bannerFile);
  if (existsSync(bannerPath)) {
    files.push(
      new AttachmentBuilder(bannerPath, { name: def.bannerFile }),
    );
    embed.setImage(`attachment://${def.bannerFile}`);
  } else {
    const title =
      category === "gender"
        ? "Gender"
        : category === "age"
          ? "Age"
          : "Region";
    embed.setTitle(title);
    console.warn(
      `[profileRoles] Missing ${bannerPath} — posting with title only.`,
    );
  }

  return channel.send({
    embeds: [embed],
    components: [buildSelectRow(category)],
    files,
    allowedMentions: { parse: [] },
  });
}

/**
 * Post Gender / Age / Region self-assign embeds with select menus.
 * Staff: `!postroles`
 */
export async function postProfileRolesPanels(
  channel: TextChannel,
): Promise<Message[]> {
  const gender = await postCategoryPanel(channel, "gender");
  const age = await postCategoryPanel(channel, "age");
  const region = await postCategoryPanel(channel, "region");
  return [gender, age, region];
}

async function applyExclusiveCategoryRole(
  member: GuildMember,
  category: ProfileCategory,
  roleId: string,
): Promise<{ label: string; swapped: boolean }> {
  const def = CATEGORIES[category];
  const chosen = def.options.find((o) => o.roleId === roleId);
  if (!chosen) {
    throw new Error(`Unknown ${category} role id ${roleId}`);
  }

  const categoryRoleIds = def.options.map((o) => o.roleId);
  const toRemove = categoryRoleIds.filter(
    (id) => id !== roleId && member.roles.cache.has(id),
  );

  if (toRemove.length > 0) {
    await member.roles.remove(toRemove, `Profile ${category} role swap`);
  }

  const alreadyHas = member.roles.cache.has(roleId);
  if (!alreadyHas) {
    await member.roles.add(roleId, `Profile ${category} role select`);
  }

  return { label: chosen.label, swapped: toRemove.length > 0 || alreadyHas };
}

/** Persistent select menus for Gender / Age / Region role panels. */
export async function onProfileRolesInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  if (!interaction.isStringSelectMenu()) return false;
  if (!interaction.customId.startsWith(`${PREFIX}:`)) return false;

  const category = parseSelectCustomId(interaction.customId);
  if (!category) return false;

  const roleId = interaction.values[0];
  if (!roleId) {
    await interaction.reply({
      content: "No role selected.",
      ephemeral: true,
    });
    return true;
  }

  const member =
    interaction.member && "roles" in interaction.member
      ? (interaction.member as GuildMember)
      : await interaction.guild!.members
          .fetch(interaction.user.id)
          .catch(() => null);

  if (!member) {
    await interaction.reply({
      content: "Could not load your member profile. Try again.",
      ephemeral: true,
    });
    return true;
  }

  try {
    const { label } = await applyExclusiveCategoryRole(
      member,
      category,
      roleId,
    );
    await interaction.reply({
      content: `You now have the **${label}** role.`,
      ephemeral: true,
    });
  } catch (err) {
    console.error(`[profileRoles] assign failed (${category}):`, err);
    await interaction
      .reply({
        content:
          "Couldn't update that role. Make sure my role is above those roles and I have Manage Roles.",
        ephemeral: true,
      })
      .catch(() => null);
  }

  return true;
}
