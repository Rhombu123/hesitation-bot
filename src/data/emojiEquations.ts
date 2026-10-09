import { randomInt } from "../utils/helpers.js";

/** Simple, single-codepoint-friendly emojis that render well in Discord. */
const EMOJI_POOL = [
  "🎁",
  "🍌",
  "🧩",
  "🍎",
  "🍓",
  "🍇",
  "🍉",
  "🍋",
  "🍑",
  "🥝",
  "🥕",
  "🌽",
  "🥑",
  "🍕",
  "🍪",
  "🍩",
  "🧁",
  "🎂",
  "🎈",
  "🎯",
  "🎲",
  "🎮",
  "🎸",
  "⚽",
  "🏀",
  "🎾",
  "💎",
  "⭐",
  "🌙",
  "🔥",
  "💧",
  "🍀",
  "🌸",
  "🌼",
  "🍄",
  "🐱",
  "🐶",
  "🐼",
  "🦊",
  "🐸",
  "🐙",
  "🦋",
  "🐝",
  "🦀",
  "🐠",
] as const;

export type EmojiEquationPuzzle = {
  lines: string[];
  solveEmoji: string;
  answer: number;
};

function pickDistinctEmojis(n: number): string[] {
  const pool = [...EMOJI_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

function joinSum(emoji: string, count: number): string {
  return Array.from({ length: count }, () => emoji).join(" + ");
}

/**
 * Middle-school addition puzzles: three lines, solve for the last emoji.
 * Values stay small so answers are easy to type as a single number.
 */
export function generateEmojiEquation(): EmojiEquationPuzzle {
  const [A, B, C] = pickDistinctEmojis(3);
  if (!A || !B || !C) {
    throw new Error("emoji equation: not enough emojis");
  }

  const a = randomInt(2, 9);
  let b = randomInt(2, 9);
  while (b === a) b = randomInt(2, 9);
  let c = randomInt(1, 9);
  while (c === a || c === b) c = randomInt(1, 9);

  const pattern = randomInt(1, 4);
  let lines: string[];

  switch (pattern) {
    case 1:
      // Screenshot style: AAA, A+B, B+C
      lines = [
        `${joinSum(A, 3)} = ${3 * a}`,
        `${A} + ${B} = ${a + b}`,
        `${B} + ${C} = ${b + c}`,
      ];
      break;
    case 2:
      lines = [
        `${joinSum(A, 2)} = ${2 * a}`,
        `${A} + ${B} = ${a + b}`,
        `${joinSum(B, 2)} + ${C} = ${2 * b + c}`,
      ];
      break;
    case 3:
      lines = [
        `${joinSum(A, 3)} = ${3 * a}`,
        `${joinSum(A, 2)} + ${B} = ${2 * a + b}`,
        `${B} + ${C} = ${b + c}`,
      ];
      break;
    default:
      lines = [
        `${joinSum(A, 2)} = ${2 * a}`,
        `${joinSum(B, 2)} = ${2 * b}`,
        `${A} + ${B} + ${C} = ${a + b + c}`,
      ];
      break;
  }

  return { lines, solveEmoji: C, answer: c };
}
