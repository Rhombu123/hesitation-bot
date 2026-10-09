import { EmbedBuilder, type Message } from "discord.js";
import { EMBED_COLOR } from "../config.js";
import {
  formatFindUsd,
  rollFindLoot,
  truncateItemName,
} from "../data/findCatalog.js";
import {
  claimFindCooldown,
  formatFindCooldown,
  recordFind,
  releaseFindInFlight,
} from "../services/findInventory.js";
import { getFindItemImageUrl } from "../services/findItemImage.js";

export async function handleFindCommand(message: Message<true>): Promise<void> {
  const cooldown = await claimFindCooldown(message.guildId, message.author.id);
  if (!cooldown.ok) {
    await message.reply(
      `Slow down — you can \`!find\` again in **${formatFindCooldown(cooldown.retryInMs)}**.`,
    );
    return;
  }

  try {
    const { item, rolledPriceCents } = rollFindLoot();
    const imageUrl = await getFindItemImageUrl(item);

    try {
      await recordFind({
        guildId: message.guildId,
        userId: message.author.id,
        item: { ...item, imageUrl: imageUrl ?? item.imageUrl },
        rolledPriceCents,
      });
    } catch (err) {
      console.error("[find]", err);
      await message.reply(
        "Couldn't save that find right now. If this keeps happening, the database migration may need to be applied.",
      );
      return;
    }

    const price = formatFindUsd(rolledPriceCents);
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setAuthor({ name: "Item Found" })
      .setDescription(
        `You **pulled a deal from the archives** and **found an item** worth **${price}** 💵`,
      )
      .addFields({
        name: "🧰 Item",
        value: `- ${truncateItemName(item.name)}`,
      })
      .setFooter({ text: "Check your items with !inventory" });

    if (imageUrl) {
      embed.setThumbnail(imageUrl);
    }

    await message.reply({ embeds: [embed] });
  } finally {
    releaseFindInFlight(message.guildId, message.author.id);
  }
}
