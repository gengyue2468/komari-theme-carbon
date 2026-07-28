/** Convert Komari region emoji / code to ISO 3166-1 alpha-2 for flag icons. */

const EMOJI_TO_CODE: Record<string, string> = {
  "🇭🇰": "HK",
  "🇨🇳": "CN",
  "🇺🇸": "US",
  "🇯🇵": "JP",
  "🇰🇷": "KR",
  "🇸🇬": "SG",
  "🇹🇼": "TW",
  "🇬🇧": "GB",
  "🇩🇪": "DE",
  "🇫🇷": "FR",
  "🇨🇦": "CA",
  "🇦🇺": "AU",
  "🇷🇺": "RU",
  "🇮🇳": "IN",
  "🇧🇷": "BR",
  "🇳🇱": "NL",
  "🇮🇹": "IT",
  "🇪🇸": "ES",
  "🇸🇪": "SE",
  "🇳🇴": "NO",
  "🇫🇮": "FI",
  "🇩🇰": "DK",
  "🇵🇱": "PL",
  "🇹🇷": "TR",
  "🇹🇭": "TH",
  "🇻🇳": "VN",
  "🇲🇾": "MY",
  "🇮🇩": "ID",
  "🇵🇭": "PH",
  "🇳🇿": "NZ",
  "🇲🇽": "MX",
  "🇦🇷": "AR",
  "🇨🇱": "CL",
  "🇿🇦": "ZA",
  "🇦🇪": "AE",
  "🇸🇦": "SA",
  "🇮🇱": "IL",
  "🇨🇭": "CH",
  "🇦🇹": "AT",
  "🇧🇪": "BE",
  "🇮🇪": "IE",
  "🇵🇹": "PT",
  "🇬🇷": "GR",
  "🇨🇿": "CZ",
  "🇷🇴": "RO",
  "🇭🇺": "HU",
  "🇺🇦": "UA",
  "🇰🇿": "KZ",
};

const FLAG_EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/u;

function regionalIndicatorsToCode(emoji: string): string | null {
  const chars = [...emoji];
  if (chars.length < 2) return null;
  const a = chars[0].codePointAt(0);
  const b = chars[1].codePointAt(0);
  if (a == null || b == null) return null;
  if (a < 0x1f1e6 || a > 0x1f1ff || b < 0x1f1e6 || b > 0x1f1ff) return null;
  return String.fromCharCode(a - 0x1f1e6 + 65) + String.fromCharCode(b - 0x1f1e6 + 65);
}

export function getRegionCode(region: string): string | null {
  const raw = region.trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();

  const mapped = EMOJI_TO_CODE[raw];
  if (mapped) return mapped;

  const match = raw.match(FLAG_EMOJI_RE);
  if (match?.[0]) {
    return EMOJI_TO_CODE[match[0]] ?? regionalIndicatorsToCode(match[0]);
  }

  return regionalIndicatorsToCode(raw);
}

export function hasRegion(region: string): boolean {
  return getRegionCode(region) != null;
}
