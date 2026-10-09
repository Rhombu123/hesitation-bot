/**
 * Keep Discord embed rows left-aligned even when a name is Arabic / RTL.
 * U+200E = LTR mark on the line; U+2066/U+2069 isolate the name itself.
 */

export function ltrIsolate(text: string): string {
  return `\u2066${text}\u2069`;
}

export function ltrLine(text: string): string {
  return `\u200E${text}`;
}

/** Rank row: badge/name stay on the left regardless of language. */
export function ltrRankLine(line: string): string {
  return ltrLine(line);
}
