import { Modal, Tab, TabList, Tabs, Tile } from "@carbon/react";
import { AreaChart, LineChart } from "@carbon/charts-react";
import {
  Alignments,
  ScaleTypes,
  type AreaChartOptions,
  type LineChartOptions,
  type Locale,
} from "@carbon/charts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dataSource } from "~/api/datasource";
import { PageSpinner } from "~/components/PageSpinner";
import {
  buildChartLocale,
  makeTooltipValueFormatter,
} from "~/lib/chart-i18n";
import {
  formatBytes,
  formatRate,
  percentOf,
} from "~/lib/format";
import { COLOR_DOWN, COLOR_UP } from "~/lib/ping-tone";
import { queryKeys } from "~/lib/query-client";
import { useAppearanceStore } from "~/stores/appearance";
import { useNodesStore } from "~/stores/nodes";
import type { LoadRecord } from "~/types/komari";

type RangeKey = "live" | "4h" | "1d";

interface LoadChartProps {
  uuid: string;
}

interface ChartPoint {
  group: string;
  date: Date;
  value: number;
}

const RANGES: Array<{ key: RangeKey; hours: number }> = [
  { key: "live", hours: 1 },
  { key: "4h", hours: 4 },
  { key: "1d", hours: 24 },
];

function filterLoadRanges(preserveHours: number) {
  const maxH = Math.max(1, preserveHours || 24);
  return RANGES.filter((r) => r.key === "live" || r.hours <= maxH);
}

const CHART_RANGE_KEY = "komari-carbon-load-range";

function readStoredRange(fallback: RangeKey): RangeKey {
  try {
    const v = localStorage.getItem(CHART_RANGE_KEY);
    if (v === "live" || v === "4h" || v === "1d") return v;
  } catch {
    // ignore
  }
  return fallback;
}

function writeStoredRange(range: RangeKey) {
  try {
    localStorage.setItem(CHART_RANGE_KEY, range);
  } catch {
    // ignore
  }
}

function downsample(records: LoadRecord[], maxPoints: number): LoadRecord[] {
  if (records.length <= maxPoints) return records;
  const step = Math.ceil(records.length / maxPoints);
  const out: LoadRecord[] = [];
  for (let i = 0; i < records.length; i += step) out.push(records[i]);
  const last = records[records.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function baseChartOptions(
  theme: "g10" | "g100",
  domain?: [number, number],
  yTitle = "",
  locale?: Locale,
  timeTitle = "",
): LineChartOptions {
  return {
    title: "",
    axes: {
      bottom: {
        mapsTo: "date",
        scaleType: ScaleTypes.TIME,
        ticks: { number: 8 },
        title: timeTitle,
      },
      left: {
        mapsTo: "value",
        scaleType: ScaleTypes.LINEAR,
        title: yTitle,
        ...(domain ? { domain } : { includeZero: true }),
      },
    },
    curve: "curveNatural",
    height: "200px",
    theme,
    toolbar: { enabled: false },
    legend: { enabled: false },
    grid: { x: { enabled: false }, y: { enabled: true } },
    points: { enabled: false, radius: 0 },
    ...(locale ? { locale } : {}),
    // Only keys that exist in data.group — extra keys spam console warnings
    color: {
      scale: {
        primary: "var(--cds-interactive)",
      },
    },
  };
}

type MetricId =
  | "cpu"
  | "ram"
  | "disk"
  | "network"
  | "connections"
  | "process"
  | "gpu";

interface MetricChartData {
  title: string;
  meta?: string;
  data: ChartPoint[];
  options: LineChartOptions | AreaChartOptions;
  kind: "area" | "line";
}

/** Whole card is the trigger — click anywhere to open the enlarged dialog. */
function MetricChart({
  title,
  meta,
  data,
  options,
  kind = "line",
  onOpen,
}: MetricChartData & { onOpen: () => void }) {
  return (
    <Tile
      className="load-chart-card"
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="load-chart-card__head">
        <span className="load-chart-card__title">{title}</span>
        {meta ? <span className="load-chart-card__meta mono">{meta}</span> : null}
      </div>
      <div className="load-chart-card__body">
        {data.length === 0 ? (
          <div className="load-chart-card__empty">—</div>
        ) : kind === "area" ? (
          <AreaChart data={data} options={options as AreaChartOptions} />
        ) : (
          <LineChart data={data} options={options as LineChartOptions} />
        )}
      </div>
    </Tile>
  );
}

/** Reused by both the main toolbar and the enlarge dialog (kept in sync). */
function LoadRangeTabs({
  index,
  ranges,
  labelMap,
  ariaLabel,
  onChange,
}: {
  index: number;
  ranges: Array<{ key: RangeKey; hours: number }>;
  labelMap: Record<RangeKey, string>;
  ariaLabel: string;
  onChange: (key: RangeKey) => void;
}) {
  return (
    <Tabs
      selectedIndex={index}
      onChange={({ selectedIndex }) => {
        onChange(ranges[selectedIndex]?.key ?? "live");
      }}
    >
      <TabList
        aria-label={ariaLabel}
        contained
        className="chart-range-tabs"
      >
        {ranges.map((r) => (
          <Tab key={r.key}>{labelMap[r.key]}</Tab>
        ))}
      </TabList>
    </Tabs>
  );
}

export function LoadChart({ uuid }: LoadChartProps) {
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
  const timeTitle = t("chart.time");
  const intlNumber = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const preserve = useNodesStore(
    (s) => s.publicSettings?.record_preserve_time ?? 24,
  );
  // History load records always ship ram_total/disk_total = 0; use node totals.
  const node = useNodesStore((s) => s.nodes.find((n) => n.uuid === uuid));
  const ramTotalFallback = node?.mem_total ?? 0;
  const diskTotalFallback = node?.disk_total ?? 0;
  const swapTotalFallback = node?.swap_total ?? 0;
  const chartHours = useNodesStore((s) => s.chartHours);
  const availableRanges = useMemo(
    () => filterLoadRanges(preserve),
    [preserve],
  );

  const initialRange = useMemo((): RangeKey => {
    const h = chartHours;
    if (h <= 1) return "live";
    if (h <= 4) return availableRanges.some((r) => r.key === "4h") ? "4h" : "live";
    if (availableRanges.some((r) => r.key === "1d")) return "1d";
    if (availableRanges.some((r) => r.key === "4h")) return "4h";
    return "live";
  }, [chartHours, availableRanges]);

  const [range, setRange] = useState<RangeKey>(() => {
    // Prefer the remembered choice (like the home grid/list toggle); fall back
    // to the settings-derived default when nothing is stored / not available.
    const stored = readStoredRange(initialRange);
    return availableRanges.some((r) => r.key === stored)
      ? stored
      : initialRange;
  });
  const changeRange = (key: RangeKey) => {
    setRange(key);
    writeStoredRange(key);
  };
  const [dialogMetric, setDialogMetric] = useState<MetricId | null>(null);
  const pollMs = useNodesStore((s) => s.pollIntervalMs);

  const hours =
    availableRanges.find((r) => r.key === range)?.hours ??
    availableRanges[0]?.hours ??
    1;
  const isLive = range === "live";
  const fetchHours = isLive ? 1 : hours;
  const rangeIndex = Math.max(
    0,
    availableRanges.findIndex((r) => r.key === range),
  );

  useEffect(() => {
    if (!availableRanges.some((r) => r.key === range)) {
      const next = availableRanges[0]?.key ?? "live";
      setRange(next);
      writeStoredRange(next);
    }
  }, [availableRanges, range]);

  const loadQuery = useQuery({
    queryKey: queryKeys.loadRecords(uuid, fetchHours),
    queryFn: async ({ signal }) => {
      const res = await dataSource.getLoadRecords(uuid, fetchHours, signal);
      const list = [...res.records].sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
      );
      return {
        records: isLive ? list.slice(-120) : list,
        hasGpu: Boolean(res.has_gpu_data),
      };
    },
    staleTime: isLive ? Math.max(pollMs || 3000, 2000) : 0,
    gcTime: 60_000,
    // Live: don't thrash full 1h fetch harder than ~5s
    refetchInterval: isLive ? Math.max(pollMs || 3000, 5000) : false,
    // No placeholderData: tab switch must clear old series and show spinner
  });

  // Live: keep previous series while soft-refetching. History: hide data while fetching.
  const records = !isLive && loadQuery.isFetching ? [] : (loadQuery.data?.records ?? []);
  const hasGpu = loadQuery.data?.hasGpu ?? false;
  const loading =
    loadQuery.isPending ||
    (!isLive && loadQuery.isFetching) ||
    (isLive && !loadQuery.data);

  const series = useMemo(() => {
    const down = downsample(records, isLive ? 90 : 120);
    // Komari history records leave *_total as 0; fill from node info.
    return down.map((r) => ({
      ...r,
      ram_total: r.ram_total || ramTotalFallback,
      disk_total: r.disk_total || diskTotalFallback,
      swap_total: r.swap_total || swapTotalFallback,
    }));
  }, [
    records,
    isLive,
    ramTotalFallback,
    diskTotalFallback,
    swapTotalFallback,
  ]);
  const latest = series[series.length - 1];

  // Single-series charts name their group by the localized metric so tooltips
  // read "Series: CPU" instead of "Series: primary".
  const cpuData = useMemo<ChartPoint[]>(
    () =>
      series.map((r) => ({
        group: t("metrics.cpu"),
        date: new Date(r.time),
        value: Number(r.cpu.toFixed(2)),
      })),
    [series, t],
  );

  const ramData = useMemo<ChartPoint[]>(
    () =>
      series.map((r) => ({
        group: t("metrics.ram"),
        date: new Date(r.time),
        value: Number(percentOf(r.ram, r.ram_total).toFixed(2)),
      })),
    [series, t],
  );

  const diskData = useMemo<ChartPoint[]>(
    () =>
      series.map((r) => ({
        group: t("metrics.disk"),
        date: new Date(r.time),
        value: Number(percentOf(r.disk, r.disk_total).toFixed(2)),
      })),
    [series, t],
  );

  const netData = useMemo<ChartPoint[]>(() => {
    const points: ChartPoint[] = [];
    for (const r of series) {
      const d = new Date(r.time);
      points.push({
        group: t("metrics.upload"),
        date: d,
        value: r.net_out,
      });
      points.push({
        group: t("metrics.download"),
        date: d,
        value: r.net_in,
      });
    }
    return points;
  }, [series, t]);

  const connData = useMemo<ChartPoint[]>(() => {
    const points: ChartPoint[] = [];
    for (const r of series) {
      const d = new Date(r.time);
      points.push({ group: "TCP", date: d, value: r.connections });
      points.push({ group: "UDP", date: d, value: r.connections_udp });
    }
    return points;
  }, [series]);

  const procData = useMemo<ChartPoint[]>(
    () =>
      series.map((r) => ({
        group: t("metrics.process"),
        date: new Date(r.time),
        value: r.process,
      })),
    [series, t],
  );

  const gpuData = useMemo<ChartPoint[]>(
    () =>
      series.map((r) => ({
        group: t("metrics.gpu"),
        date: new Date(r.time),
        value: Number(r.gpu.toFixed(2)),
      })),
    [series, t],
  );

  const language = i18n.language;
  const pctFormatter = useMemo(
    () => makeTooltipValueFormatter(language, (v) => `${v}%`),
    [language],
  );
  const rateFormatter = useMemo(
    () => makeTooltipValueFormatter(language, (v) => formatRate(v)),
    [language],
  );
  const countFormatter = useMemo(
    () => makeTooltipValueFormatter(language, (v) => intlNumber.format(v)),
    [language, intlNumber],
  );

  const cpuOpts = useMemo<AreaChartOptions>(
    () => ({
      ...baseChartOptions(
        theme,
        [0, 100],
        t("metrics.cpu"),
        chartLocale,
        timeTitle,
      ),
      color: { scale: { [t("metrics.cpu")]: "var(--cds-interactive)" } },
      tooltip: { valueFormatter: pctFormatter },
    }),
    [theme, chartLocale, t, timeTitle, pctFormatter],
  );

  const ramOpts = useMemo<AreaChartOptions>(
    () => ({
      ...baseChartOptions(
        theme,
        [0, 100],
        t("metrics.ram"),
        chartLocale,
        timeTitle,
      ),
      color: { scale: { [t("metrics.ram")]: "var(--cds-interactive)" } },
      tooltip: { valueFormatter: pctFormatter },
    }),
    [theme, chartLocale, t, timeTitle, pctFormatter],
  );

  const diskOpts = useMemo<AreaChartOptions>(
    () => ({
      ...baseChartOptions(
        theme,
        [0, 100],
        t("metrics.disk"),
        chartLocale,
        timeTitle,
      ),
      color: { scale: { [t("metrics.disk")]: "var(--cds-interactive)" } },
      tooltip: { valueFormatter: pctFormatter },
    }),
    [theme, chartLocale, t, timeTitle, pctFormatter],
  );

  const procOpts = useMemo<AreaChartOptions>(
    () => ({
      ...baseChartOptions(
        theme,
        undefined,
        t("metrics.process"),
        chartLocale,
        timeTitle,
      ),
      color: { scale: { [t("metrics.process")]: "var(--cds-interactive)" } },
      tooltip: { valueFormatter: countFormatter },
    }),
    [theme, chartLocale, t, timeTitle, countFormatter],
  );

  const gpuOpts = useMemo<AreaChartOptions>(
    () => ({
      ...baseChartOptions(theme, [0, 100], t("metrics.gpu"), chartLocale, timeTitle),
      color: { scale: { [t("metrics.gpu")]: "var(--cds-interactive)" } },
      tooltip: { valueFormatter: pctFormatter },
    }),
    [theme, chartLocale, t, timeTitle, pctFormatter],
  );

  const netOpts = useMemo<LineChartOptions>(
    () => ({
      ...baseChartOptions(
        theme,
        undefined,
        t("metrics.rate"),
        chartLocale,
        timeTitle,
      ),
      axes: {
        bottom: {
          mapsTo: "date",
          scaleType: ScaleTypes.TIME,
          ticks: { number: 8 },
          title: timeTitle,
        },
        left: {
          mapsTo: "value",
          scaleType: ScaleTypes.LINEAR,
          includeZero: true,
          title: t("metrics.rate"),
          ticks: {
            formatter: (tick: number | Date) =>
              `${formatRate(Number(tick))}`,
          },
        },
      },
      legend: {
        enabled: true,
        alignment: Alignments.CENTER,
        position: "bottom" as const,
      },
      height: "200px",
      color: {
        scale: {
          [t("metrics.upload")]: COLOR_UP,
          [t("metrics.download")]: COLOR_DOWN,
        },
      },
      tooltip: { valueFormatter: rateFormatter },
    }),
    [theme, chartLocale, t, timeTitle, rateFormatter],
  );

  const connOpts = useMemo<LineChartOptions>(
    () => ({
      ...baseChartOptions(
        theme,
        undefined,
        t("metrics.connections"),
        chartLocale,
        timeTitle,
      ),
      axes: {
        bottom: {
          mapsTo: "date",
          scaleType: ScaleTypes.TIME,
          ticks: { number: 8 },
          title: timeTitle,
        },
        left: {
          mapsTo: "value",
          scaleType: ScaleTypes.LINEAR,
          includeZero: true,
          title: t("metrics.connections"),
        },
      },
      height: "200px",
      legend: {
        enabled: true,
        alignment: Alignments.CENTER,
        position: "bottom" as const,
      },
      color: {
        scale: {
          TCP: COLOR_UP,
          UDP: COLOR_DOWN,
        },
      },
      tooltip: { valueFormatter: countFormatter },
    }),
    [theme, chartLocale, t, timeTitle, countFormatter],
  );

  const labelMap = useMemo(
    () =>
      ({
        live: t("detail.rangeLive"),
        "4h": t("detail.range4h"),
        "1d": t("detail.range1d"),
      }) as Record<RangeKey, string>,
    [t],
  );

  const metricCharts: Partial<Record<MetricId, MetricChartData>> = {
    cpu: {
      title: t("metrics.cpu"),
      meta: latest ? `${latest.cpu.toFixed(1)}%` : undefined,
      data: cpuData,
      options: cpuOpts,
      kind: "area",
    },
    ram: {
      title: t("metrics.ram"),
      meta: latest
        ? `${formatBytes(latest.ram)} · ${formatBytes(latest.ram_total)}`
        : undefined,
      data: ramData,
      options: ramOpts,
      kind: "area",
    },
    disk: {
      title: t("metrics.disk"),
      meta: latest
        ? `${formatBytes(latest.disk)} · ${formatBytes(latest.disk_total)}`
        : undefined,
      data: diskData,
      options: diskOpts,
      kind: "area",
    },
    network: {
      title: t("metrics.network"),
      meta: latest
        ? `${formatRate(latest.net_out)} ↑ · ${formatRate(latest.net_in)} ↓`
        : undefined,
      data: netData,
      options: netOpts,
      kind: "line",
    },
    connections: {
      title: t("metrics.connections"),
      meta: latest
        ? `TCP ${latest.connections} · UDP ${latest.connections_udp}`
        : undefined,
      data: connData,
      options: connOpts,
      kind: "line",
    },
    process: {
      title: t("metrics.process"),
      meta: latest ? String(Math.round(latest.process)) : undefined,
      data: procData,
      options: procOpts,
      kind: "area",
    },
    // GPU history is only present when Komari reports it (has_gpu_data).
    ...(hasGpu
      ? {
          gpu: {
            title: t("metrics.gpu"),
            meta: latest ? `${latest.gpu.toFixed(1)}%` : undefined,
            data: gpuData,
            options: gpuOpts,
            kind: "area",
          } satisfies MetricChartData,
        }
      : {}),
  };

  const dialogChart = dialogMetric ? (metricCharts[dialogMetric] ?? null) : null;

  return (
    <div className="load-chart-panel">
      <div className="load-chart-panel__toolbar">
        <LoadRangeTabs
          index={rangeIndex}
          ranges={availableRanges}
          labelMap={labelMap}
          ariaLabel={t("detail.loadChart")}
          onChange={changeRange}
        />
      </div>

      {loading ? (
        <PageSpinner />
      ) : series.length === 0 ? (
        <p className="empty">{t("detail.noLoadData")}</p>
      ) : (
        <div className="load-chart-grid">
          {(Object.keys(metricCharts) as MetricId[]).map((id) => {
            const chart = metricCharts[id];
            if (!chart) return null;
            return (
              <MetricChart
                key={id}
                {...chart}
                onOpen={() => setDialogMetric(id)}
              />
            );
          })}
        </div>
      )}

      {dialogChart ? (
        <Modal
          open
          passiveModal
          size="lg"
          modalHeading={dialogChart.title}
          onRequestClose={() => setDialogMetric(null)}
          className="load-chart-dialog"
        >
          <div className="load-chart-dialog__toolbar">
            <LoadRangeTabs
              index={rangeIndex}
              ranges={availableRanges}
              labelMap={labelMap}
              ariaLabel={t("detail.loadChart")}
              onChange={changeRange}
            />
          </div>
          <div className="load-chart-dialog__chart">
            {loading ? (
              <PageSpinner />
            ) : dialogChart.data.length === 0 ? (
              <div className="load-chart-card__empty">—</div>
            ) : dialogChart.kind === "area" ? (
              <AreaChart
                data={dialogChart.data}
                options={
                  {
                    ...dialogChart.options,
                    height: "360px",
                  } as AreaChartOptions
                }
              />
            ) : (
              <LineChart
                data={dialogChart.data}
                options={
                  {
                    ...dialogChart.options,
                    height: "360px",
                  } as LineChartOptions
                }
              />
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
