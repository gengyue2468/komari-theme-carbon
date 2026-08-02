/** Convert Komari region emoji / code to ISO 3166-1 alpha-2 automatically. */

const FLAG_EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/u;

function regionalIndicatorsToCode(emoji: string): string | null {
  const chars = [...emoji];
  if (chars.length < 2) return null;
  const a = chars[0].codePointAt(0);
  const b = chars[1].codePointAt(0);
  if (a == null || b == null) return null;
  if (a < 0x1f1e6 || a > 0x1f1ff || b < 0x1f1e6 || b > 0x1f1ff) return null;
  return (
    String.fromCharCode(a - 0x1f1e6 + 65) +
    String.fromCharCode(b - 0x1f1e6 + 65)
  );
}

/**
 * Resolve a region string (2-letter code, flag emoji, or emoji embedded in
 * text) to an ISO 3166-1 alpha-2 code. No manual lookup table — the emoji
 * regional-indicator conversion handles any flag.
 */
export function getRegionCode(region: string): string | null {
  const raw = region.trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();

  const match = raw.match(FLAG_EMOJI_RE);
  if (match?.[0]) return regionalIndicatorsToCode(match[0]);
  return regionalIndicatorsToCode(raw);
}

export function hasRegion(region: string): boolean {
  return getRegionCode(region) != null;
}
