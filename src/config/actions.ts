/** White embed sidebar (same as global `EMBED_COLOR`). */
export const ACTION_EMBED_COLOR = 0x143b96;

export type ActionDef = {
  name: string;
  aliases?: readonly string[];
  /** Third-person verb: "hugs", "kisses", … */
  verb: string;
  /** Noun used in the counter: "hugs", "kisses", … */
  noun: string;
  emoji: string;
  /** Short label shown in the embed title. */
  label: string;
};

/** Social action commands — GIFs via Klipy (see actionGifs). */
export const ACTIONS: readonly ActionDef[] = [
  { name: "kiss", verb: "kisses", noun: "kisses", emoji: "💋", label: "Kiss" },
  { name: "slap", verb: "slaps", noun: "slaps", emoji: "👋", label: "Slap" },
  { name: "kick", verb: "kicks", noun: "kicks", emoji: "🦵", label: "Kick" },
  { name: "kill", verb: "kills", noun: "kills", emoji: "🔪", label: "Kill" },
  { name: "hug", verb: "hugs", noun: "hugs", emoji: "🤗", label: "Hug" },
  { name: "pat", verb: "pats", noun: "pats", emoji: "🤲", label: "Pat" },
  { name: "poke", verb: "pokes", noun: "pokes", emoji: "👉", label: "Poke" },
  { name: "bite", verb: "bites", noun: "bites", emoji: "😬", label: "Bite" },
  { name: "cuddle", verb: "cuddles", noun: "cuddles", emoji: "🥰", label: "Cuddle" },
  { name: "bonk", verb: "bonks", noun: "bonks", emoji: "🔨", label: "Bonk" },
  {
    name: "highfive",
    aliases: ["high5", "hf"],
    verb: "high-fives",
    noun: "high-fives",
    emoji: "🙌",
    label: "High Five",
  },
  { name: "yeet", verb: "yeets", noun: "yeets", emoji: "🚀", label: "Yeet" },
  {
    name: "handhold",
    aliases: ["holdhands"],
    verb: "holds hands with",
    noun: "handholds",
    emoji: "🤝",
    label: "Handhold",
  },
  { name: "bully", verb: "bullies", noun: "bullies", emoji: "😈", label: "Bully" },
  {
    name: "dap",
    aliases: ["dapup", "fistbump"],
    verb: "daps up",
    noun: "daps",
    emoji: "👊",
    label: "Dap",
  },
] as const;

const byName = new Map<string, ActionDef>();
for (const action of ACTIONS) {
  byName.set(action.name, action);
  for (const alias of action.aliases ?? []) {
    byName.set(alias, action);
  }
}

export function getAction(cmd: string): ActionDef | undefined {
  return byName.get(cmd);
}

export function isActionCommand(cmd: string): boolean {
  return byName.has(cmd);
}
