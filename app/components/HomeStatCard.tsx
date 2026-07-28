import { Tile } from "@carbon/react";
import type { CarbonIconType } from "@carbon/icons-react";

export interface HomeStatCardProps {
  label: string;
  value: string;
  unit?: string;
  suffix?: string;
  icon: CarbonIconType;
}

export function HomeStatCard({
  label,
  value,
  unit,
  suffix,
  icon: Icon,
}: HomeStatCardProps) {
  return (
    <Tile className="home-stat-card">
      <div className="home-stat-card__top row-between">
        <span className="home-stat-card__label">{label}</span>
        <Icon size={20} className="home-stat-card__icon" />
      </div>
      <div className="home-stat-card__value-row">
        <span className="home-stat-card__value mono">{value}</span>
        {(unit || suffix) && (
          <span className="home-stat-card__unit mono">
            {[unit, suffix].filter(Boolean).join(" ")}
          </span>
        )}
      </div>
    </Tile>
  );
}
