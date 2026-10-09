/**
 * Word/phrase → language prompts for the Guess the Language game.
 * `aliases` are accepted guesses (normalized).
 */
import { normalizeGuess } from "./countries.js";

export type LanguagePrompt = {
  /** The word or short phrase shown to players. */
  word: string;
  /** Canonical language name. */
  language: string;
  aliases?: readonly string[];
};

/** Curated greetings list for `!lang`. */
export const LANGUAGE_PROMPTS: readonly LanguagePrompt[] = [
  { word: "Ahoj", language: "Czech", aliases: ["cesky", "čeština"] },
  { word: "Moi", language: "Finnish", aliases: ["suomi"] },
  {
    word: "olā",
    language: "Portuguese",
    aliases: ["portugese", "portugues", "português"],
  },
  { word: "Bok", language: "Croatian", aliases: ["hrvatski"] },
  { word: "hej", language: "Swedish", aliases: ["svenska"] },
  { word: "Bună", language: "Romanian", aliases: ["romana", "română"] },
  { word: "Здраво", language: "Macedonian", aliases: ["makedonski"] },
  { word: "Здравейте", language: "Bulgarian", aliases: ["balgarski", "български"] },
  { word: "Përshëndetje", language: "Albanian", aliases: ["shqip"] },
  { word: "sziasztok", language: "Hungarian", aliases: ["magyar"] },
  { word: "salaam", language: "Persian", aliases: ["farsi", "iranian"] },
  { word: "selam", language: "Turkish", aliases: ["turkce", "türkçe"] },
  { word: "sveiki", language: "Lithuanian", aliases: ["lietuviu", "lietuvių"] },
  { word: "salve", language: "Latin" },
  { word: "shalom", language: "Hebrew", aliases: ["ivrit"] },
  { word: "sawasdee", language: "Thai", aliases: ["siamese"] },
  { word: "helo", language: "Welsh", aliases: ["cymraeg"] },
  { word: "halo", language: "Indonesian", aliases: ["bahasa indonesia", "bahasa"] },
  { word: "hallo", language: "Norwegian", aliases: ["norsk"] },
  { word: "tere", language: "Estonian", aliases: ["eesti"] },
  { word: "terve", language: "Finnish", aliases: ["suomi"] },
  { word: "Merhaba", language: "Turkish", aliases: ["turkce", "türkçe"] },
  { word: "Mingalaba", language: "Burmese", aliases: ["myanmar"] },
  { word: "Moien", language: "Luxembourgish", aliases: ["letzebuergesch", "lëtzebuergesch"] },
  { word: "Zdravo", language: "Serbian", aliases: ["srpski"] },
  { word: "Barev Dzez", language: "Armenian", aliases: ["hayeren"] },
  { word: "Dia dhuit", language: "Irish", aliases: ["gaeilge", "gaelic"] },
  { word: "Kia ora", language: "Maori", aliases: ["te reo", "te reo maori"] },
  { word: "Sain uu", language: "Mongolian", aliases: ["mongol"] },
  { word: "Xin chào", language: "Vietnamese", aliases: ["tieng viet", "tiếng việt"] },
  { word: "Yā'at'ééh", language: "Navajo", aliases: ["dine", "diné"] },
  { word: "Γειά σας", language: "Greek", aliases: ["ellinika", "ελληνικά"] },
];

export function matchesLanguage(
  guess: string,
  prompt: LanguagePrompt,
): boolean {
  const g = normalizeGuess(guess);
  if (!g) return false;
  if (g === normalizeGuess(prompt.language)) return true;
  return (prompt.aliases ?? []).some((a) => normalizeGuess(a) === g);
}

export function pickRandomLanguagePrompt(): LanguagePrompt {
  return LANGUAGE_PROMPTS[
    Math.floor(Math.random() * LANGUAGE_PROMPTS.length)
  ]!;
}
