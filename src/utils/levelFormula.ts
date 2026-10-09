/**
 * Leveling curve (steeper than Arcane default — ~2× XP per level):
 * XP to go from level L-1 → L  =  10·L² + 100·L + 150
 */
export function xpToNextLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return 10 * L * L + 100 * L + 150;
}

/** Total XP required to reach a given level from 0. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let L = 1; L <= level; L++) {
    total += xpToNextLevel(L);
  }
  return total;
}

/** Compute level from total XP. */
export function levelFromXp(xp: number): number {
  let level = 0;
  let remaining = Math.max(0, Math.floor(xp));
  // Cap iterations so a corrupted XP value can't hang the process.
  while (level < 10_000 && remaining >= xpToNextLevel(level + 1)) {
    remaining -= xpToNextLevel(level + 1);
    level += 1;
  }
  return level;
}

/** Progress within the current level toward the next. */
export function progressInLevel(xp: number): {
  level: number;
  current: number;
  needed: number;
} {
  const level = levelFromXp(xp);
  const intoLevel = Math.max(0, Math.floor(xp) - totalXpForLevel(level));
  const needed = xpToNextLevel(level + 1);
  return { level, current: intoLevel, needed };
}

export function progressBar(current: number, needed: number, size = 10): string {
  if (needed <= 0) return "█".repeat(size);
  const filled = Math.min(size, Math.round((current / needed) * size));
  return "█".repeat(filled) + "░".repeat(size - filled);
}
