import type { CarbonIconType } from "@carbon/icons-react";
import { Icon as IconifyIcon } from "@iconify/react";
import type { CSSProperties } from "react";
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
  if (icon.kind !== "iconify") return 1;
  const id = icon.id.toLowerCase();
  if (id.includes("amd")) return 0.85;
  if (id.includes("intel")) return 1.18;
  if (id.includes("arm") || id.includes("qemu") || id.includes("vmware"))
    return 1.08;
  return 1;
}

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

  if (icon.kind === "iconify") {
    return (
      <span className={`brand-icon ${className ?? ""}`.trim()} style={boxStyle} title={title}>
        <IconifyIcon
          icon={icon.id}
          width={glyph}
          height={glyph}
          className="brand-icon__glyph"
          aria-hidden
        />
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
