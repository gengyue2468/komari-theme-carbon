import {
  AE,
  AR,
  AT,
  AU,
  BE,
  BR,
  CA,
  CH,
  CL,
  CN,
  CZ,
  DE,
  DK,
  ES,
  FI,
  FR,
  GB,
  GR,
  HK,
  HU,
  ID,
  IE,
  IL,
  IN,
  IT,
  JP,
  KR,
  KZ,
  MX,
  MY,
  NL,
  NO,
  NZ,
  PH,
  PL,
  PT,
  RO,
  RU,
  SA,
  SE,
  SG,
  TH,
  TR,
  TW,
  UA,
  US,
  VN,
  ZA,
} from "country-flag-icons/react/3x2";
import type { FlagComponent } from "country-flag-icons/react/3x2";
import { getRegionCode } from "~/lib/region";

/**
 * Only the flag set we can actually resolve from Komari region data is
 * imported; anything else falls back to a text label. Importing * from
 * "country-flag-icons/react/3x2" used to bundle ~250 flags (~250KB).
 */
const FLAGS: Record<string, FlagComponent> = {
  AE,
  AR,
  AT,
  AU,
  BE,
  BR,
  CA,
  CH,
  CL,
  CN,
  CZ,
  DE,
  DK,
  ES,
  FI,
  FR,
  GB,
  GR,
  HK,
  HU,
  ID,
  IE,
  IL,
  IN,
  IT,
  JP,
  KR,
  KZ,
  MX,
  MY,
  NL,
  NO,
  NZ,
  PH,
  PL,
  PT,
  RO,
  RU,
  SA,
  SE,
  SG,
  TH,
  TR,
  TW,
  UA,
  US,
  VN,
  ZA,
};

interface RegionFlagProps {
  region: string;
  className?: string;
  title?: string;
}

export function RegionFlag({ region, className, title }: RegionFlagProps) {
  const code = getRegionCode(region);
  if (!code) return null;

  const Flag = FLAGS[code];
  if (!Flag) {
    return (
      <span className={className} title={title ?? region}>
        {code}
      </span>
    );
  }

  return (
    <Flag
      className={className}
      title={title ?? code}
      aria-label={title ?? code}
    />
  );
}
