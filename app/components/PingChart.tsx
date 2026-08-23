import { Button, Modal, Tab, TabList, Tabs, Tile } from "@carbon/react";
import { LineChart } from "@carbon/charts-react";
import {
  Alignments,
  ScaleTypes,
  type LineChartOptions,
} from "@carbon/charts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dataSource } from "~/api/datasource";
import { buildPingChartModel, formatLatencyMs } from "~/lib/ping-display";
import { PageSpinner } from "~/components/PageSpinner";
import {
  buildChartLocale,
  makeTooltipValueFormatter,
} from "~/lib/chart-i18n";
import { queryKeys } from "~/lib/query-client";
import { useAppearanceStore } from "~/stores/appearance";
import { useNodesStore } from "~/stores/nodes";

type RangeKey = "1h" | "6h" | "12h" | "1d";

interface PingChartProps {
  uuid: string;
  online: boolean;
  realtimeReady: boolean;
}

interface ChartPoint {
  group: string;
  date: Date;
  value: number;
}

interface LossMarker {
  time: string;
  left: number;
}

interface PingLineChartProps {
  data: ChartPoint[];
  options: LineChartOptions;
  lossMarkers: LossMarker[];
}

function PingLineChart({ data, options, lossMarkers }: PingLineChartProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const plot = plotRef.current;
    const overlay = overlayRef.current;
    if (!plot || !overlay) return;

    let frame = 0;
    let observedBackdrop: SVGSVGElement | null = null;
    let resizeObserver: ResizeObserver;
    const syncOverlay = () => {
      const backdrop = plot.querySelector<SVGSVGElement>(
        "svg.chart-grid-backdrop",
      );
      if (backdrop !== observedBackdrop) {
        if (observedBackdrop) resizeObserver.unobserve(observedBackdrop);
        observedBackdrop = backdrop;
        if (observedBackdrop) resizeObserver.observe(observedBackdrop);
      }
      if (!backdrop) {
        overlay.style.visibility = "hidden";
        return;
      }

      const plotRect = plot.getBoundingClientRect();
      const backdropRect = backdrop.getBoundingClientRect();
      overlay.style.left = `${backdropRect.left - plotRect.left}px`;
      overlay.style.top = `${backdropRect.top - plotRect.top}px`;
      overlay.style.width = `${backdropRect.width}px`;
      overlay.style.height = `${backdropRect.height}px`;
      overlay.style.visibility = "visible";
    };
    const scheduleSync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncOverlay();
      });
    };

    resizeObserver = new ResizeObserver(scheduleSync);
    resizeObserver.observe(plot);
    const observer = new MutationObserver(scheduleSync);
    observer.observe(plot, { childList: true, subtree: true });
    syncOverlay();

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={plotRef} className="ping-chart-main__plot">
      <LineChart data={data} options={options} />
      <svg
        ref={overlayRef}
        className="ping-chart-loss-overlay"
        aria-hidden="true"
        focusable="false"
      >
        {lossMarkers.map((marker) => (
          <line
            key={marker.time}
            x1={`${marker.left}%`}
            x2={`${marker.left}%`}
            y1="0"
            y2="100%"
          />
        ))}
      </svg>
    </div>
  );
}

const RANGES: Array<{ key: RangeKey; hours: number }> = [
  { key: "1h", hours: 1 },
  { key: "6h", hours: 6 },
  { key: "12h", hours: 12 },
  { key: "1d", hours: 24 },
];

export function PingChart({ uuid, online, realtimeReady }: PingChartProps) {
  const { t, i18n } = useTranslation();
  const carbonTheme = useAppearanceStore((s) => s.carbonTheme);
  const theme = carbonTheme === "g100" ? "g100" : "g10";
  const chartLocale = useMemo(
    () =>
      buildChartLocale(i18n.language, {
        group: t("chart.group"),
        total: t("chart.total"),
      }),
    [i18n.language, t],
  );
  const preserve = useNodesStore(
    (s) => s.publicSettings?.ping_record_preserve_time ?? 48,
  );
  const chartHours = useNodesStore((s) => s.chartHours);

  const availableRanges = useMemo(
    () => RANGES.filter((r) => r.hours <= Math.max(preserve, 1)),
    [preserve],
  );

  const initialRange = useMemo((): RangeKey => {
    const h = chartHours;
    const pick = (k: RangeKey) =>
      availableRanges.some((r) => r.key === k) ? k : null;
    if (h <= 1) return pick("1h") ?? availableRanges[0]?.key ?? "1h";
    if (h <= 6) return pick("6h") ?? pick("1h") ?? "1h";
    if (h <= 12) return pick("12h") ?? pick("6h") ?? "1h";
    return pick("1d") ?? pick("12h") ?? pick("6h") ?? "1h";
  }, [chartHours, availableRanges]);

  const [range, setRange] = useState<RangeKey>(initialRange);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionReady, setSelectionReady] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const hours =
    availableRanges.find((r) => r.key === range)?.hours ??
    availableRanges[0]?.hours ??
    1;
  const rangeIndex = Math.max(
    0,
    availableRanges.findIndex((r) => r.key === range),
  );

  const pingQuery = useQuery({
    queryKey: queryKeys.pingHistory(uuid, hours),
    queryFn: async ({ signal }) => {
      const hist = await dataSource.getPingHistory(uuid, hours, signal);
      return buildPingChartModel(hist);
    },
    staleTime: 0,
    gcTime: 60_000,
    // No placeholderData: tab switch must refetch immediately, not keep old range
  });

  const tasks = pingQuery.data?.tasks ?? [];
  const points = pingQuery.data?.points ?? [];
  // Only block on a genuine first load (new range = new query key = no data);
  // background refetches keep the previous series visible.
  const loading = pingQuery.isPending;

  useEffect(() => {
    if (!availableRanges.some((r) => r.key === range)) {
      setRange(availableRanges[0]?.key ?? "1h");
    }
  }, [availableRanges, range]);

  // Sync task selection when query result task set changes
  useEffect(() => {
    if (!pingQuery.data) return;
    const ids = pingQuery.data.tasks.map((x) => x.id);
    setSelectedIds((prev) => {
      if (!selectionReady || prev.length === 0) return ids;
      const next = prev.filter((id) => ids.includes(id));
      return next.length > 0 ? next : ids;
    });
    setSelectionReady(true);
  }, [pingQuery.data, selectionReady]);

  useEffect(() => {
    setSelectionReady(false);
  }, [uuid]);

  useEffect(() => {
    if (window.location.hash !== "#ping-chart") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("ping-chart")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const chartData = useMemo<ChartPoint[]>(() => {
    const out: ChartPoint[] = [];
    const active = new Set(selectedIds);
    const nameById = new Map(tasks.map((t) => [t.id, t.name]));
    for (const p of points) {
      const date = new Date(p.time);
      for (const [id, v] of Object.entries(p.values)) {
        if (!active.has(id) || v == null) continue;
        out.push({
          group: nameById.get(id) ?? id,
          date,
          value: v,
        });
      }
    }
    return out;
  }, [points, selectedIds, tasks]);

  const chartTimeDomain = useMemo(() => {
    const timestamps = points
      .map((point) => Date.parse(point.time))
      .filter(Number.isFinite);
    if (timestamps.length === 0) return null;

    const first = Math.min(...timestamps);
    const last = Math.max(...timestamps);
    if (first === last) {
      return { start: first - 30_000, end: last + 30_000 };
    }
    return { start: first, end: last };
  }, [points]);

  const lossMarkers = useMemo<LossMarker[]>(() => {
    const active = new Set(selectedIds);
    if (!chartTimeDomain || active.size === 0) return [];

    const span = chartTimeDomain.end - chartTimeDomain.start;
    return points.flatMap((point) => {
      const timestamp = Date.parse(point.time);
      if (!Number.isFinite(timestamp)) return [];
      const hasLoss = [...active].some((id) => point.losses[id] === true);
      return hasLoss
        ? [{
            time: point.time,
            left: ((timestamp - chartTimeDomain.start) / span) * 100,
          }]
        : [];
    });
  }, [chartTimeDomain, points, selectedIds]);

  const colorScale = useMemo(() => {
    const scale: Record<string, string> = {};
    for (const task of tasks) scale[task.name] = task.color;
    return scale;
  }, [tasks]);

  const language = i18n.language;
  const msFormatter = useMemo(
    () => makeTooltipValueFormatter(language, formatLatencyMs),
    [language],
  );

  const options = useMemo<LineChartOptions>(
    () => ({
      title: "",
      axes: {
        bottom: {
          mapsTo: "date",
          scaleType: ScaleTypes.TIME,
          domain: chartTimeDomain
            ? [new Date(chartTimeDomain.start), new Date(chartTimeDomain.end)]
            : undefined,
          ticks: { number: 10 },
          title: t("chart.time"),
        },
        left: {
          mapsTo: "value",
          scaleType: ScaleTypes.LINEAR,
          title: t("metrics.latency"),
          includeZero: true,
        },
      },
      curve: "curveNatural",
      height: "320px",
      theme,
      timeScale: { addSpaceOnEdges: 0 },
      toolbar: { enabled: false },
      legend: {
        enabled: true,
        alignment: Alignments.CENTER,
        position: "bottom" as const,
      },
      grid: { x: { enabled: false }, y: { enabled: true } },
      points: { enabled: false, radius: 0 },
      color: { scale: colorScale },
      locale: chartLocale,
      tooltip: {
        valueFormatter: msFormatter,
        // Summing ping latencies across different targets is meaningless —
        // show the average instead of the default "Total".
        showTotal: true,
        totalLabel: t("detail.avg"),
        customTotalCalculation: (data) => {
          const values = (data as Array<{ value?: unknown }>)
            .map((d) => d.value)
            .filter((v): v is number => typeof v === "number");
          if (values.length === 0) return 0;
          return values.reduce((a, b) => a + b, 0) / values.length;
        },
      },
    }),
    [
      theme,
      colorScale,
      chartLocale,
      chartTimeDomain,
      t,
      language,
      msFormatter,
    ],
  );

  const rangeLabels: Record<RangeKey, string> = {
    "1h": t("detail.range1h"),
    "6h": t("detail.range6h"),
    "12h": t("detail.range12h"),
    "1d": t("detail.range1d"),
  };

  const toggleTask = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const hasChartVisual = chartData.length > 0;

  const renderToolbar = () => (
    <div className="ping-chart-panel__toolbar">
      <div className="ping-chart-panel__tabs">
        <Tabs
          selectedIndex={rangeIndex}
          onChange={({ selectedIndex: index }) => {
            setRange(availableRanges[index]?.key ?? "1h");
          }}
        >
          <TabList
            aria-label={t("detail.pingChart")}
            contained
            className="chart-range-tabs"
          >
            {availableRanges.map((r) => (
              <Tab key={r.key}>{rangeLabels[r.key]}</Tab>
            ))}
          </TabList>
        </Tabs>
      </div>
      <div className="ping-chart-panel__select">
        <Button
          kind="ghost"
          size="sm"
          onClick={() => setSelectedIds(tasks.map((x) => x.id))}
          disabled={selectedIds.length === tasks.length}
        >
          {t("detail.selectAll")}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          onClick={() => setSelectedIds([])}
          disabled={selectedIds.length === 0}
        >
          {t("detail.selectNone")}
        </Button>
      </div>
    </div>
  );

  const renderTaskGrid = () => (
    <div className="ping-task-grid">
      {tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          className={`ping-task-card${
            selectedIds.includes(task.id) ? " is-active" : " is-dim"
          }`}
          onClick={() => toggleTask(task.id)}
          aria-pressed={selectedIds.includes(task.id)}
        >
          <span
            className="ping-task-card__bar"
            style={{ background: task.color }}
            aria-hidden
          />
          <div className="ping-task-card__body">
            <div className="ping-task-card__top">
              <span className="ping-task-card__name">{task.name}</span>
              <span className="ping-task-card__latest mono">
                {formatLatencyMs(task.latest)}
              </span>
            </div>
            <div className="ping-task-card__stats mono">
              <span>
                {t("detail.avg")} {formatLatencyMs(task.avg)}
              </span>
              <span>
                {t("metrics.loss")} {task.lossPct.toFixed(1)}%
              </span>
              {task.type || task.interval ? (
                <span className="ping-task-card__meta">
                  {[task.type, task.interval ? `${task.interval}s` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div id="ping-chart" className="ping-chart-panel">
      {!realtimeReady ? (
        <p className="ping-chart-panel__offline mono">{t("app.statusLoading")}</p>
      ) : null}
      {renderToolbar()}

      {loading ? (
        <PageSpinner />
      ) : pingQuery.isError && !pingQuery.data ? (
        <p className="empty" role="alert">{t("detail.pingDataError")}</p>
      ) : tasks.length === 0 ? (
        <p className="empty">{t("detail.noPingData")}</p>
      ) : (
        <>
          {renderTaskGrid()}

          <Tile
            className={`ping-chart-main${hasChartVisual ? " is-interactive" : ""}`}
            role={hasChartVisual ? "button" : undefined}
            tabIndex={hasChartVisual ? 0 : undefined}
            aria-label={
              hasChartVisual ? t("detail.openPingChart") : undefined
            }
            onClick={() => {
              if (hasChartVisual) setDialogOpen(true);
            }}
            onKeyDown={(event) => {
              if (!hasChartVisual) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setDialogOpen(true);
              }
            }}
          >
            {!hasChartVisual ? (
              <div className="ping-chart-main__empty">
                {t("detail.noPingData")}
              </div>
            ) : (
              <div className="ping-chart-main__visual">
                <PingLineChart
                  data={chartData}
                  options={options}
                  lossMarkers={lossMarkers}
                />
              </div>
            )}
          </Tile>
        </>
      )}

      {dialogOpen ? (
        <Modal
          open
          passiveModal
          size="lg"
          modalHeading={t("detail.pingChart")}
          onRequestClose={() => setDialogOpen(false)}
          className="ping-chart-dialog"
        >
          <div className="ping-chart-dialog__controls">{renderToolbar()}</div>
          <div className="ping-chart-dialog__tasks">{renderTaskGrid()}</div>
          <div className="ping-chart-dialog__chart">
            {loading ? (
              <PageSpinner />
            ) : !hasChartVisual ? (
              <div className="ping-chart-main__empty">{t("detail.noPingData")}</div>
            ) : (
              <div className="ping-chart-main__visual">
                <PingLineChart
                  data={chartData}
                  options={{ ...options, height: "460px" }}
                  lossMarkers={lossMarkers}
                />
              </div>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
