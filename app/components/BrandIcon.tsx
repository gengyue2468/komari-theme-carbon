import type { CarbonIconType } from "@carbon/icons-react";
import { Icon as IconifyIcon } from "@iconify/react";
import type { IconRef } from "~/lib/os-arch";

interface IconTipIconProps {
  icon: IconRef;
  size?: number;
  className?: string;
}

export function QuickIcon({ icon, size = 16, className }: IconTipIconProps) {
  if (icon.kind === "iconify") {
    return <IconifyIcon icon={icon.id} width={size} height={size} className={className} />;
  }
  const Icon = icon.Icon as CarbonIconType;
  return <Icon size={size} className={className} />;
}
