import * as Flags from "country-flag-icons/react/3x2";
import { getRegionCode } from "~/lib/region";

type FlagComponents = typeof Flags;
type FlagCode = keyof FlagComponents;

interface RegionFlagProps {
  region: string;
  className?: string;
  title?: string;
}

export function RegionFlag({ region, className, title }: RegionFlagProps) {
  const code = getRegionCode(region);
  if (!code) return null;

  const Flag = Flags[code as FlagCode];
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
