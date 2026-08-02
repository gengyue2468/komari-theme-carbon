import { Popover, PopoverContent, Tile } from "@carbon/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes, formatRate, percentOf, trafficUsedBytes } from "~/lib/format";
import type { HomeStatItem } from "~/lib/home-stats";
import type { NodeInfo, RealtimeMetrics } from "~/types/komari";

interface StatPopoverProps {
  stat: HomeStatItem;
  label: string;
  value: string;
  unit?: string;
  suffix?: string;
  icon: React.ReactNode;
  nodes: NodeInfo[];
  realtime: Record<string, RealtimeMetrics>;
  onlineIds: string[];
}

interface BreakdownRow {
  name: string;
  value: string;
  detail: string;
  pct: number;
}

function ramBreakdown(nodes: NodeInfo[], realtime: Record<string, RealtimeMetrics>): BreakdownRow[] {
  return nodes
    .map((n) => {
      const m = realtime[n.uuid];
      const used = m?.ram.used ?? 0;
      const total = n.mem_total || m?.ram.total || 0;
      return {
        name: n.name,
        value: formatBytes(used),
        detail: total > 0 ? `${percentOf(used, total).toFixed(0)}% / ${formatBytes(total)}` : "",
        pct: total > 0 ? percentOf(used, total) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 12);
}

function diskBreakdown(nodes: NodeInfo[], realtime: Record<string, RealtimeMetrics>): BreakdownRow[] {
  return nodes
    .map((n) => {
      const m = realtime[n.uuid];
      const used = m?.disk.used ?? 0;
      const total = n.disk_total || m?.disk.total || 0;
      return {
        name: n.name,
        value: formatBytes(used),
        detail: total > 0 ? `${percentOf(used, total).toFixed(0)}% / ${formatBytes(total)}` : "",
        pct: total > 0 ? percentOf(used, total) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 12);
}

function trafficBreakdown(nodes: NodeInfo[], realtime: Record<string, RealtimeMetrics>): BreakdownRow[] {
  return nodes
    .map((n) => {
      const m = realtime[n.uuid];
      const up = m?.network.totalUp ?? 0;
      const down = m?.network.totalDown ?? 0;
      return {
        name: n.name,
        // Respect each node's traffic_limit_type: sum (双向), max (取大), up (出站), down.
        value: formatBytes(trafficUsedBytes(up, down, n.traffic_limit_type)),
        detail: `↑ ${formatBytes(up)} · ↓ ${formatBytes(down)}`,
        pct: 0,
      };
    })
    .sort((a, b) => b.value.localeCompare(a.value, undefined, { numeric: true }))
    .slice(0, 12);
}

function rateBreakdown(
  nodes: NodeInfo[],
  realtime: Record<string, RealtimeMetrics>,
  onlineIds: string[],
  primary: "up" | "down",
): BreakdownRow[] {
  const online = new Set(onlineIds);
  return nodes
    .filter((n) => online.has(n.uuid))
    .map((n) => {
      const m = realtime[n.uuid];
      const up = formatRate(m?.network.up ?? 0);
      const down = formatRate(m?.network.down ?? 0);
      return primary === "up"
        ? {
            name: n.name,
            value: `↑ ${up}`,
            detail: `↓ ${down}`,
            pct: 0,
          }
        : {
            name: n.name,
            value: `↓ ${down}`,
            detail: `↑ ${up}`,
            pct: 0,
          };
    })
    .sort((a, b) => b.value.localeCompare(a.value, undefined, { numeric: true }))
    .slice(0, 12);
}

export function StatPopover({
  stat,
  label,
  value,
  unit,
  suffix,
  icon,
  nodes,
  realtime,
  onlineIds,
}: StatPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const id = stat.id;
  const panelId = `stat-popover-${id}`;

  const rows = useMemo<BreakdownRow[]>(() => {
    switch (id) {
      case "memory":
        return ramBreakdown(nodes, realtime);
      case "disk":
        return diskBreakdown(nodes, realtime);
      case "traffic":
        return trafficBreakdown(nodes, realtime);
      case "uplink":
        return rateBreakdown(nodes, realtime, onlineIds, "up");
      case "downlink":
        return rateBreakdown(nodes, realtime, onlineIds, "down");
      default:
        return [];
    }
  }, [id, nodes, realtime, onlineIds]);

  return (
    <div ref={rootRef} className="stat-popover-wrap">
      <Popover
        open={open}
        align="bottom"
        caret
        dropShadow
        autoAlign
        onRequestClose={() => setOpen(false)}
      >
        <Tile
          className="home-stat-card home-stat-card--clickable"
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={panelId}
          aria-label={label}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
        >
          <div className="home-stat-card__top row-between">
            <span className="home-stat-card__label">{label}</span>
            {icon}
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

        <PopoverContent className="stat-popover__content">
          <div
            id={panelId}
            className="stat-popover-panel"
            role="dialog"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span className="stat-popover__head">{label}</span>
            {rows.length === 0 ? (
              <p className="stat-popover__empty">—</p>
            ) : (
              <div className="stat-popover__list">
                {rows.map((r, i) => (
                  <div key={i} className="stat-popover__row">
                    <div className="stat-popover__row-head">
                      <span className="stat-popover__name">{r.name}</span>
                      <span className="stat-popover__value mono">{r.value}</span>
                    </div>
                    {r.detail && (
                      <span className="stat-popover__detail mono">{r.detail}</span>
                    )}
                    {r.pct > 0 && (
                      <div className="stat-popover__bar-track">
                        <div
                          className={`stat-popover__bar-fill${r.pct >= 90 ? " is-warn" : ""}${r.pct >= 98 ? " is-error" : ""}`}
                          style={{ width: `${r.pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
