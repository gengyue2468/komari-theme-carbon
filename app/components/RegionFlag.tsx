import { Tooltip } from "@carbon/react";
import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
import type { FlagComponent } from "country-flag-icons/react/3x2";
import { getRegionCode } from "~/lib/region";

type FlagProps = ComponentProps<FlagComponent> & { code: string };

const LazyFlag = lazy(async () => {
  const flags = (await import("country-flag-icons/react/3x2")) as unknown as Record<
    string,
    FlagComponent
  >;
  return {
    default: function ResolvedFlag({ code, ...props }: FlagProps) {
      const Flag = flags[code];
      return Flag ? <Flag {...props} /> : <span {...props}>{code}</span>;
    },
  };
});

/**
 * Keep the full flag set in an async chunk. This preserves support for every
 * ISO code while keeping the initial application bundle small.
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

  const tooltipLabel = title ?? region;

  return (
    <Tooltip as="span" label={tooltipLabel} align="top">
      <Suspense fallback={<span className={className}>{code}</span>}>
        <LazyFlag code={code} className={className} aria-label={tooltipLabel} />
      </Suspense>
    </Tooltip>
  );
}
