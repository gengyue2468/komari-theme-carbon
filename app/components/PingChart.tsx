import { Button, Tab, TabList, Tabs, Tile } from "@carbon/react";
import { LineChart } from "@carbon/charts-react";
import {
  Alignments,
  ScaleTypes,
  type LineChartOptions,
} from "@carbon/charts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dataSource } from "~/api/datasource";
import { buildPingChartModel } from "~/lib/ping-display";
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
}

interface ChartPoint {
  group: string;
  date: Date;
  value: number;
}

const RANGES: Array<{ key: RangeKey; hours: number }> = [
  { key: "1h", hours: 1 },
  { key: "6h", hours: 6 },
  { key: "12h", hours: 12 },
  { key: "1d", hours: 24 },
];

export function PingChart({ uuid, online }: PingChartProps) {
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

  const colorScale = useMemo(() => {
    const scale: Record<string, string> = {};
    for (const task of tasks) scale[task.name] = task.color;
    return scale;
  }, [tasks]);

  const language = i18n.language;
  const msFormatter = useMemo(
    () => makeTooltipValueFormatter(language, (v) => `${v} ms`),
    [language],
  );

  const options = useMemo<LineChartOptions>(
    () => ({
      title: "",
      axes: {
        bottom: {
          mapsTo: "date",
          scaleType: ScaleTypes.TIME,
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
    [theme, colorScale, chartLocale, t, language, msFormatter],
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

  return (
    <div className="ping-chart-panel">
      {!online ? (
        <p className="ping-chart-panel__offline mono">{t("detail.offlineHint")}</p>
      ) : null}
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

      {loading ? (
        <PageSpinner />
      ) : tasks.length === 0 ? (
        <p className="empty">{t("detail.noPingData")}</p>
      ) : (
        <>
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
                      {task.latest != null ? `${task.latest} ms` : "—"}
                    </span>
                  </div>
                  <div className="ping-task-card__stats mono">
                    <span>
                      {t("detail.avg")}{" "}
                      {task.avg != null ? `${task.avg} ms` : "—"}
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

          <Tile className="ping-chart-main">
            {chartData.length === 0 ? (
              <div className="ping-chart-main__empty">
                {t("detail.noPingData")}
              </div>
            ) : (
              <LineChart data={chartData} options={options} />
            )}
          </Tile>
        </>
      )}
    </div>
  );
}
