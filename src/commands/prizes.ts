import { EmbedBuilder, type Message } from "discord.js";
import { EMBED_COLOR } from "../config.js";
import {
  CRATE_RARITIES,
  CRATE_RARITY_EMOJI_IDS,
  REP_RARITIES,
} from "../config/creditRewards.js";
import {
  LOOT_EXCLUSIVE_DROP_PERCENT,
  LOOT_RARE_DROP_PERCENT,
} from "../services/lootDrops.js";

function rarityPercent(weight: number, total: number): string {
  const pct = (weight / total) * 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

export async function handlePrizesCommand(
  message: Message<true>,
): Promise<void> {
  const totalWeight = CRATE_RARITIES.reduce((s, r) => s + r.weight, 0);

  const rarityLines = CRATE_RARITIES.map((c) => {
    const rep = REP_RARITIES.find((r) => r.id === c.id)!;
    const emoji = `<:${c.id}:${CRATE_RARITY_EMOJI_IDS[c.id]}>`;
    const pct = rarityPercent(c.weight, totalWeight);
    return (
      `${emoji} **${c.label}** — **${pct}**\n` +
      `Credits: **${c.minCredits}–${c.maxCredits}** · Rep: **${rep.minRep}–${rep.maxRep}**`
    );
  });

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: "Game Prizes & Rarities" })
    .setDescription(
      [
        "📦 **Crate reward pool**",
        "_Used by `!crate`, `!light`, `!dice`, `!back`, `!state`, `!emoji`, `!eq` — credits **or** rep._",
        "",
        rarityLines.join("\n\n"),
        "",
        "🎯 **Point games**",
        "`!flag` · `!lang` · `!color` · `!react` · `!knowledge` — **1 point** on win",
        "`!vote` — winner gets **+5 rep**",
        "",
        "🍃 **Loot roles** _(on crate-pool wins)_",
        `Rare loot (Personality / Hobby / Colors) — **${LOOT_RARE_DROP_PERCENT}%**`,
        `Exclusive titles — **${LOOT_EXCLUSIVE_DROP_PERCENT}%**`,
        "",
        "Browse roles with `!loot`",
      ].join("\n"),
    );

  await message.reply({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });
}
