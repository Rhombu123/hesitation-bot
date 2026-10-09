/** Milestone perks shown on `!level` and level-up DMs. */
export const LEVEL_MILESTONES: ReadonlyArray<{
  level: number;
  /** Short one-liner for `!level`. */
  reward: string;
  /** Clearer line for “New Feature Unlocked” DMs. */
  unlock: string;
}> = [
  {
    level: 5,
    reward: "Change nickname + external stickers & emoji",
    unlock: "You can now change your nickname and use external stickers & emoji!",
  },
  {
    level: 10,
    reward: "Use embed links",
    unlock: "You can now use embed links!",
  },
  {
    level: 20,
    reward: "Picture permissions",
    unlock: "You can now post pictures!",
  },
  {
    level: 30,
    reward: "Stream & voice chat permissions",
    unlock: "You can now stream and use voice chat permissions!",
  },
  {
    level: 40,
    reward: "Poll permissions",
    unlock: "You can now create polls!",
  },
  {
    level: 50,
    reward: "Soundboard + external sounds",
    unlock: "You can now use soundboards and external sounds!",
  },
  {
    level: 60,
    reward: "+5 per rep · 5 reps/day",
    unlock:
      "Each +rep gains a **+5** bonus (stacks with role bonuses), and you get **5** gives per day!",
  },
  {
    level: 70,
    reward: "Access to all action commands",
    unlock: "You can now use **all** `!` action commands!",
  },
  {
    level: 80,
    reward: "Create threads",
    unlock: "You can now create threads!",
  },
  {
    level: 90,
    reward: "Permanent Elite",
    unlock: "You've unlocked **permanent Elite**!",
  },
  {
    level: 100,
    reward: "Unlock Prestige",
    unlock: "You've unlocked **Prestige**!",
  },
];

/** Milestones crossed when going from oldLevel → newLevel (exclusive of old). */
export function milestonesReached(
  oldLevel: number,
  newLevel: number,
): typeof LEVEL_MILESTONES[number][] {
  return LEVEL_MILESTONES.filter(
    (m) => m.level > oldLevel && m.level <= newLevel,
  );
}
