import { Dropdown, Popover, PopoverContent, Tile } from "@carbon/react";
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
  realtimeReady: boolean;
}

interface BreakdownRow {
  name: string;
  value: string;
  detail: string;
  pct: number;
  sortValue: number;
}

type SortMode = "default" | "name" | "high" | "low";

function ramBreakdown(nodes: NodeInfo[], realtime: Record<string, RealtimeMetrics>): BreakdownRow[] {
  return nodes
    .map((n) => {
      const m = realtime[n.uuid];
      if (!m) {
        return { name: n.name, value: "—", detail: "", pct: 0, sortValue: 0 };
      }
      const used = m.ram.used;
      const total = n.mem_total || m.ram.total || 0;
      return {
        name: n.name,
        value: formatBytes(used),
        detail: total > 0 ? `${percentOf(used, total).toFixed(1)}% / ${formatBytes(total)}` : "",
        pct: total > 0 ? percentOf(used, total) : 0,
        sortValue: total > 0 ? percentOf(used, total) : 0,
      };
    });
}

function diskBreakdown(nodes: NodeInfo[], realtime: Record<string, RealtimeMetrics>): BreakdownRow[] {
  return nodes
    .map((n) => {
      const m = realtime[n.uuid];
      if (!m) {
        return { name: n.name, value: "—", detail: "", pct: 0, sortValue: 0 };
      }
      const used = m.disk.used;
      const total = n.disk_total || m.disk.total || 0;
      return {
        name: n.name,
        value: formatBytes(used),
        detail: total > 0 ? `${percentOf(used, total).toFixed(1)}% / ${formatBytes(total)}` : "",
        pct: total > 0 ? percentOf(used, total) : 0,
        sortValue: total > 0 ? percentOf(used, total) : 0,
      };
    });
}

function trafficBreakdown(
  nodes: NodeInfo[],
  realtime: Record<string, RealtimeMetrics>,
  outboundLabel: string,
  inboundLabel: string,
): BreakdownRow[] {
  return nodes
    .map((n) => {
      const m = realtime[n.uuid];
      if (!m) {
        return { name: n.name, value: "—", detail: "", pct: 0, sortValue: 0 };
      }
      const up = m.network.totalUp;
      const down = m.network.totalDown;
      const used = trafficUsedBytes(up, down, n.traffic_limit_type);
      return {
        name: n.name,
        // Respect each node's traffic_limit_type: sum (双向), max (取大), up (出站), down.
        value: formatBytes(used),
        detail: `${outboundLabel} ${formatBytes(up)} / ${inboundLabel} ${formatBytes(down)}`,
        pct: 0,
        sortValue: used,
      };
    });
}

function rateBreakdown(
  nodes: NodeInfo[],
  realtime: Record<string, RealtimeMetrics>,
  primary: "up" | "down",
  outboundLabel: string,
  inboundLabel: string,
): BreakdownRow[] {
  return nodes
    .map((n) => {
      const m = realtime[n.uuid];
      if (!m) {
        return { name: n.name, value: "—", detail: "", pct: 0, sortValue: 0 };
      }
      const sortValue = primary === "up" ? m.network.up : m.network.down;
      const up = formatRate(m.network.up);
      const down = formatRate(m.network.down);
      return primary === "up"
        ? {
            name: n.name,
            value: `${outboundLabel} ${up}`,
            detail: `${inboundLabel} ${down}`,
            pct: 0,
            sortValue,
          }
        : {
            name: n.name,
            value: `${inboundLabel} ${down}`,
            detail: `${outboundLabel} ${up}`,
            pct: 0,
            sortValue,
          };
    });
}

function sortRows(rows: BreakdownRow[], mode: SortMode): BreakdownRow[] {
  if (mode === "default") return rows;
  return [...rows].sort((a, b) => {
    if (mode === "name") return a.name.localeCompare(b.name);
    return mode === "high"
      ? b.sortValue - a.sortValue
      : a.sortValue - b.sortValue;
  });
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
  realtimeReady,
}: StatPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("default");
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
    if (!realtimeReady) return [];
    switch (id) {
      case "memory":
        return ramBreakdown(nodes, realtime);
      case "disk":
        return diskBreakdown(nodes, realtime);
      case "traffic":
        return trafficBreakdown(
          nodes,
          realtime,
          t("metrics.outbound"),
          t("metrics.inbound"),
        );
      case "uplink":
        return rateBreakdown(
          nodes,
          realtime,
          "up",
          t("metrics.outbound"),
          t("metrics.inbound"),
        );
      case "downlink":
        return rateBreakdown(
          nodes,
          realtime,
          "down",
          t("metrics.outbound"),
          t("metrics.inbound"),
        );
      default:
        return [];
    }
  }, [id, nodes, realtime, realtimeReady, t]);

  const sortedRows = useMemo(() => sortRows(rows, sortMode), [rows, sortMode]);
  const sortItems = useMemo(
    () => [
      { id: "default" as const, text: t("stats.sortDefault") },
      { id: "name" as const, text: t("stats.sortName") },
      { id: "high" as const, text: t("stats.sortHigh") },
      { id: "low" as const, text: t("stats.sortLow") },
    ],
    [t],
  );

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
            <span className="home-stat-card__value numeric">{value}</span>
            {(unit || suffix) && (
              <span className="home-stat-card__unit">
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
            <div className="stat-popover__toolbar">
              <span className="stat-popover__head">{label}</span>
              <Dropdown
                id={`${panelId}-sort`}
                size="sm"
                label={t("stats.sort")}
                titleText=""
                hideLabel
                items={sortItems}
                itemToString={(item) => (item ? item.text : "")}
                selectedItem={sortItems.find((item) => item.id === sortMode)}
                onChange={({ selectedItem }) => {
                  if (selectedItem) setSortMode(selectedItem.id);
                }}
              />
            </div>
            {!realtimeReady ? (
              <p className="stat-popover__empty">{t("app.statusLoading")}</p>
            ) : rows.length === 0 ? (
              <p className="stat-popover__empty">—</p>
            ) : (
              <div className="stat-popover__list">
                {sortedRows.map((r, i) => (
                  <div key={i} className="stat-popover__row">
                    <div className="stat-popover__row-head">
                      <span className="stat-popover__name">{r.name}</span>
                      <span className="stat-popover__value numeric">{r.value}</span>
                    </div>
                    {r.detail && (
                      <span className="stat-popover__detail numeric">{r.detail}</span>
                    )}
                    {r.pct > 0 && (
                      <div className="stat-popover__bar-track">
                        <div
                          className={`stat-popover__bar-fill${r.pct >= 60 ? " is-warn" : ""}${r.pct >= 80 ? " is-error" : ""}`}
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
