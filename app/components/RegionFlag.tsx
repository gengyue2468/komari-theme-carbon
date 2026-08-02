import * as Flags from "country-flag-icons/react/3x2";
import type { FlagComponent } from "country-flag-icons/react/3x2";
import { getRegionCode } from "~/lib/region";

const ALL_FLAGS = Flags as unknown as Record<string, FlagComponent>;

/**
 * Full flag set resolved dynamically by ISO code — no manual import list, so
 * any region Komari reports (e.g. KP 朝鲜) renders correctly. Unknown codes
 * fall back to a text label.
 */
export function RegionFlag({
  region,
  className,
  title,
}: {
  region: string;
  className?: string;
  title?: string;
}) {
  const code = getRegionCode(region);
  if (!code) return null;

  const Flag = ALL_FLAGS[code];
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
