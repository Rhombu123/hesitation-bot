/**
 * Country list for the flag guessing game.
 * `code` is ISO 3166-1 alpha-2 (lowercase) for flagcdn.com.
 * `aliases` are accepted guesses (normalized).
 */
export type Country = {
  code: string;
  name: string;
  aliases?: readonly string[];
};

export const COUNTRIES: readonly Country[] = [
  { code: "us", name: "United States", aliases: ["usa", "america", "united states of america"] },
  { code: "gb", name: "United Kingdom", aliases: ["uk", "britain", "great britain", "england"] },
  { code: "ca", name: "Canada" },
  { code: "mx", name: "Mexico" },
  { code: "br", name: "Brazil" },
  { code: "ar", name: "Argentina" },
  { code: "cl", name: "Chile" },
  { code: "co", name: "Colombia" },
  { code: "pe", name: "Peru" },
  { code: "ve", name: "Venezuela" },
  { code: "fr", name: "France" },
  { code: "de", name: "Germany", aliases: ["deutschland"] },
  { code: "it", name: "Italy" },
  { code: "es", name: "Spain", aliases: ["espana", "españa"] },
  { code: "pt", name: "Portugal" },
  { code: "nl", name: "Netherlands", aliases: ["holland"] },
  { code: "be", name: "Belgium" },
  { code: "ch", name: "Switzerland" },
  { code: "at", name: "Austria" },
  { code: "se", name: "Sweden" },
  { code: "no", name: "Norway" },
  { code: "dk", name: "Denmark" },
  { code: "fi", name: "Finland" },
  { code: "ie", name: "Ireland" },
  { code: "pl", name: "Poland" },
  { code: "cz", name: "Czech Republic", aliases: ["czechia"] },
  { code: "ro", name: "Romania" },
  { code: "hu", name: "Hungary" },
  { code: "gr", name: "Greece" },
  { code: "tr", name: "Turkey", aliases: ["turkiye", "türkiye"] },
  { code: "ru", name: "Russia", aliases: ["russian federation"] },
  { code: "ua", name: "Ukraine" },
  { code: "jp", name: "Japan" },
  { code: "kr", name: "South Korea", aliases: ["korea", "republic of korea"] },
  { code: "cn", name: "China", aliases: ["prc"] },
  { code: "in", name: "India" },
  { code: "pk", name: "Pakistan" },
  { code: "bd", name: "Bangladesh" },
  { code: "id", name: "Indonesia" },
  { code: "th", name: "Thailand" },
  { code: "vn", name: "Vietnam", aliases: ["viet nam"] },
  { code: "ph", name: "Philippines" },
  { code: "my", name: "Malaysia" },
  { code: "sg", name: "Singapore" },
  { code: "au", name: "Australia" },
  { code: "nz", name: "New Zealand" },
  { code: "za", name: "South Africa" },
  { code: "eg", name: "Egypt" },
  { code: "ng", name: "Nigeria" },
  { code: "ke", name: "Kenya" },
  { code: "ma", name: "Morocco" },
  { code: "sa", name: "Saudi Arabia", aliases: ["ksa"] },
  { code: "ae", name: "United Arab Emirates", aliases: ["uae"] },
  { code: "iq", name: "Iraq" },
  { code: "ir", name: "Iran" },
  { code: "af", name: "Afghanistan" },
  { code: "is", name: "Iceland" },
  { code: "hr", name: "Croatia" },
  { code: "rs", name: "Serbia" },
  { code: "ba", name: "Bosnia and Herzegovina", aliases: ["bosnia"] },
  { code: "sk", name: "Slovakia" },
  { code: "si", name: "Slovenia" },
  { code: "bg", name: "Bulgaria" },
  { code: "lt", name: "Lithuania" },
  { code: "lv", name: "Latvia" },
  { code: "ee", name: "Estonia" },
  { code: "cu", name: "Cuba" },
  { code: "cw", name: "Curaçao", aliases: ["curacao"] },
  { code: "jm", name: "Jamaica" },
  { code: "cr", name: "Costa Rica" },
  { code: "pa", name: "Panama" },
  { code: "ec", name: "Ecuador" },
  { code: "uy", name: "Uruguay" },
  { code: "py", name: "Paraguay" },
  { code: "bo", name: "Bolivia" },
  { code: "np", name: "Nepal" },
  { code: "lk", name: "Sri Lanka" },
  { code: "mm", name: "Myanmar", aliases: ["burma"] },
  { code: "kh", name: "Cambodia" },
  { code: "mn", name: "Mongolia" },
  { code: "kz", name: "Kazakhstan" },
  { code: "uz", name: "Uzbekistan" },
  { code: "ge", name: "Georgia" },
  { code: "am", name: "Armenia" },
  { code: "az", name: "Azerbaijan" },
  { code: "qa", name: "Qatar" },
  { code: "kw", name: "Kuwait" },
  { code: "bh", name: "Bahrain" },
  { code: "om", name: "Oman" },
  { code: "jo", name: "Jordan" },
  { code: "lb", name: "Lebanon" },
  { code: "sy", name: "Syria" },
  { code: "ye", name: "Yemen" },
  { code: "et", name: "Ethiopia" },
  { code: "gh", name: "Ghana" },
  { code: "tz", name: "Tanzania" },
  { code: "ug", name: "Uganda" },
  { code: "dz", name: "Algeria" },
  { code: "tn", name: "Tunisia" },
  { code: "ly", name: "Libya" },
  { code: "sd", name: "Sudan" },
  { code: "cm", name: "Cameroon" },
  { code: "ci", name: "Ivory Coast", aliases: ["cote divoire", "côte d'ivoire"] },
  { code: "sn", name: "Senegal" },
  { code: "zw", name: "Zimbabwe" },
  { code: "zm", name: "Zambia" },
  { code: "bw", name: "Botswana" },
  { code: "na", name: "Namibia" },
  { code: "mg", name: "Madagascar" },
  { code: "mu", name: "Mauritius" },
  { code: "sc", name: "Seychelles" },
  { code: "fj", name: "Fiji" },
  { code: "pg", name: "Papua New Guinea" },
  { code: "tw", name: "Taiwan" },
  { code: "hk", name: "Hong Kong" },
  { code: "mo", name: "Macau", aliases: ["macao"] },
  { code: "pr", name: "Puerto Rico" },
  { code: "do", name: "Dominican Republic" },
  { code: "ht", name: "Haiti" },
  { code: "gt", name: "Guatemala" },
  { code: "hn", name: "Honduras" },
  { code: "sv", name: "El Salvador" },
  { code: "ni", name: "Nicaragua" },
  { code: "by", name: "Belarus" },
  { code: "md", name: "Moldova" },
  { code: "al", name: "Albania" },
  { code: "mk", name: "North Macedonia", aliases: ["macedonia"] },
  { code: "me", name: "Montenegro" },
  { code: "xk", name: "Kosovo" },
  { code: "cy", name: "Cyprus" },
  { code: "mt", name: "Malta" },
  { code: "lu", name: "Luxembourg" },
  { code: "ad", name: "Andorra" },
  { code: "sm", name: "San Marino" },
  { code: "va", name: "Vatican City", aliases: ["vatican", "holy see"] },
  { code: "li", name: "Liechtenstein" },
  { code: "fo", name: "Faroe Islands", aliases: ["faroe"] },
  { code: "gl", name: "Greenland" },
  { code: "kp", name: "North Korea", aliases: ["dprk"] },
];

export function normalizeGuess(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesCountry(guess: string, country: Country): boolean {
  const g = normalizeGuess(guess);
  if (!g) return false;
  if (g === normalizeGuess(country.name)) return true;
  return (country.aliases ?? []).some((a) => normalizeGuess(a) === g);
}

export function flagImageUrl(code: string): string {
  return `https://flagcdn.com/w320/${code.toLowerCase()}.png`;
}

function flagFallbackUrls(code: string): string[] {
  const lower = code.toLowerCase();
  const upper = code.toUpperCase();
  return [
    `https://flagcdn.com/w320/${lower}.png`,
    `https://flagsapi.com/${upper}/flat/64.png`,
  ];
}

/**
 * Download a flag PNG so Discord can host it as an attachment.
 * External embed image URLs often fail Discord's media proxy.
 */
export async function fetchFlagPng(code: string): Promise<Buffer | null> {
  for (const url of flagFallbackUrls(code)) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "hesitation-bot/1.0" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 100) return buf;
    } catch {
      // try next source
    }
  }
  return null;
}

export function pickRandomCountry(): Country {
  return COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)]!;
}
