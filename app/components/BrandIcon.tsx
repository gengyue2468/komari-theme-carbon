import type { CarbonIconType } from "@carbon/icons-react";
import type { CSSProperties } from "react";
import { BRAND_ICON_PATHS } from "~/lib/brand-icons";
import type { IconRef } from "~/lib/os-arch";

interface IconTipIconProps {
  icon: IconRef;
  /** Outer box size in px (default 18). */
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Optical scale: wide wordmarks (AMD/Intel) need larger glyph to match OS marks.
 */
function glyphScale(icon: IconRef): number {
  if (icon.kind !== "brand") return 1;
  const id = icon.id.toLowerCase();
  if (id.includes("amd")) return 0.85;
  if (id.includes("intel")) return 1.18;
  if (id.includes("arm") || id.includes("qemu") || id.includes("vmware"))
    return 1.08;
  return 1;
}

/**
 * Per-icon centering fixes. Some brand paths occupy only part of the 24x24
 * viewBox (e.g. the AMD wordmark lives in the top ~2/3), so they render
 * off-center. `translate` re-centers them in SVG space.
 */
const BRAND_TRANSFORMS: Record<string, string> = {
  amd: "translate(3.8 4)",
};

export function QuickIcon({
  icon,
  size = 18,
  className,
  title,
}: IconTipIconProps) {
  const scale = glyphScale(icon);
  const glyph = Math.round(size * scale);
  const boxStyle: CSSProperties = {
    width: size,
    height: size,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    lineHeight: 0,
    verticalAlign: "middle",
  };

  if (icon.kind === "brand") {
    const d = BRAND_ICON_PATHS[icon.id];
    return (
      <span className={`brand-icon ${className ?? ""}`.trim()} style={boxStyle} title={title}>
        {d ? (
          <svg
            viewBox="0 0 24 24"
            width={glyph}
            height={glyph}
            className="brand-icon__glyph"
            fill="currentColor"
            aria-hidden
          >
            <g transform={BRAND_TRANSFORMS[icon.id]}>
              <path d={d} />
            </g>
          </svg>
        ) : null}
      </span>
    );
  }

  const Icon = icon.Icon as CarbonIconType;
  return (
    <span className={`brand-icon ${className ?? ""}`.trim()} style={boxStyle} title={title}>
      <Icon size={size} className="brand-icon__glyph" aria-hidden />
    </span>
  );
}
