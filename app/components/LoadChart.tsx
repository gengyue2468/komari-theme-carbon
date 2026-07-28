import { Tab, TabList, Tabs, Tile } from "@carbon/react";
import { AreaChart, LineChart } from "@carbon/charts-react";
import {
  Alignments,
  ScaleTypes,
  type AreaChartOptions,
  type LineChartOptions,
} from "@carbon/charts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dataSource } from "~/api/datasource";
import { PageSpinner } from "~/components/PageSpinner";
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
): LineChartOptions {
  return {
    title: "",
    axes: {
      bottom: {
        mapsTo: "date",
        scaleType: ScaleTypes.TIME,
        ticks: { number: 8 },
      },
      left: {
        mapsTo: "value",
        scaleType: ScaleTypes.LINEAR,
        title: yTitle,
        ...(domain ? { domain } : { includeZero: true }),
      },
    },
    curve: "curveMonotoneX",
    height: "200px",
    theme,
    toolbar: { enabled: false },
    legend: { enabled: false },
    grid: { x: { enabled: false }, y: { enabled: true } },
    points: { enabled: false, radius: 0 },
    // Only keys that exist in data.group — extra keys spam console warnings
    color: {
      scale: {
        primary: "var(--cds-interactive)",
      },
    },
  };
}

function MetricChart({
  title,
  meta,
  data,
  options,
  kind = "line",
}: {
  title: string;
  meta?: string;
  data: ChartPoint[];
  options: LineChartOptions | AreaChartOptions;
  kind?: "line" | "area";
}) {
  return (
    <Tile className="load-chart-card">
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

export function LoadChart({ uuid }: LoadChartProps) {
  const { t } = useTranslation();
  const carbonTheme = useAppearanceStore((s) => s.carbonTheme);
  const theme = carbonTheme === "g100" ? "g100" : "g10";
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

  const [range, setRange] = useState<RangeKey>(initialRange);
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
      setRange(availableRanges[0]?.key ?? "live");
    }
  }, [availableRanges, range]);

  const loadQuery = useQuery({
    queryKey: queryKeys.loadRecords(uuid, fetchHours),
    queryFn: async ({ signal }) => {
      const res = await dataSource.getLoadRecords(uuid, fetchHours, signal);
      const list = [...res.records].sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
      );
      return isLive ? list.slice(-120) : list;
    },
    staleTime: isLive ? Math.max(pollMs || 3000, 2000) : 0,
    gcTime: 60_000,
    // Live: don't thrash full 1h fetch harder than ~5s
    refetchInterval: isLive ? Math.max(pollMs || 3000, 5000) : false,
    // No placeholderData: tab switch must clear old series and show spinner
  });

  // Live: keep previous series while soft-refetching. History: hide data while fetching.
  const records =
    !isLive && loadQuery.isFetching ? [] : (loadQuery.data ?? []);
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

  const pctAreaOpts = useMemo<AreaChartOptions>(
    () => ({ ...baseChartOptions(theme, [0, 100], "%") }),
    [theme],
  );

  const cpuData = useMemo<ChartPoint[]>(
    () =>
      series.map((r) => ({
        group: "primary",
        date: new Date(r.time),
        value: Number(r.cpu.toFixed(2)),
      })),
    [series],
  );

  const ramData = useMemo<ChartPoint[]>(
    () =>
      series.map((r) => ({
        group: "primary",
        date: new Date(r.time),
        value: Number(percentOf(r.ram, r.ram_total).toFixed(2)),
      })),
    [series],
  );

  const diskData = useMemo<ChartPoint[]>(
    () =>
      series.map((r) => ({
        group: "primary",
        date: new Date(r.time),
        value: Number(percentOf(r.disk, r.disk_total).toFixed(2)),
      })),
    [series],
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
        group: "primary",
        date: new Date(r.time),
        value: r.process,
      })),
    [series],
  );

  const netOpts = useMemo<LineChartOptions>(
    () => ({
      ...baseChartOptions(theme),
      axes: {
        bottom: {
          mapsTo: "date",
          scaleType: ScaleTypes.TIME,
          ticks: { number: 8 },
        },
        left: {
          mapsTo: "value",
          scaleType: ScaleTypes.LINEAR,
          includeZero: true,
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
    }),
    [theme, t],
  );

  const connOpts = useMemo<LineChartOptions>(
    () => ({
      ...baseChartOptions(theme),
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
    }),
    [theme],
  );

  const areaOpts = useMemo<AreaChartOptions>(
    () => ({
      ...baseChartOptions(theme),
      legend: { enabled: false },
      color: {
        scale: {
          primary: "var(--cds-interactive)",
        },
      },
    }),
    [theme],
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

  return (
    <div className="load-chart-panel">
      <div className="load-chart-panel__toolbar">
        <Tabs
          selectedIndex={rangeIndex}
          onChange={({ selectedIndex: index }) => {
            setRange(availableRanges[index]?.key ?? "live");
          }}
        >
          <TabList
            aria-label={t("detail.loadChart")}
            contained
            scrollIntoView
            className="chart-range-tabs"
          >
            {availableRanges.map((r) => (
              <Tab key={r.key}>{labelMap[r.key]}</Tab>
            ))}
          </TabList>
        </Tabs>
      </div>

      {loading ? (
        <PageSpinner />
      ) : series.length === 0 ? (
        <p className="empty">{t("detail.noLoadData")}</p>
      ) : (
        <div className="load-chart-grid">
          <MetricChart
            title={t("metrics.cpu")}
            meta={latest ? `${latest.cpu.toFixed(1)}%` : undefined}
            data={cpuData}
            options={pctAreaOpts}
            kind="area"
          />
          <MetricChart
            title={t("metrics.ram")}
            meta={
              latest
                ? `${formatBytes(latest.ram)} · ${formatBytes(latest.ram_total)}`
                : undefined
            }
            data={ramData}
            options={pctAreaOpts}
            kind="area"
          />
          <MetricChart
            title={t("metrics.disk")}
            meta={
              latest
                ? `${formatBytes(latest.disk)} · ${formatBytes(latest.disk_total)}`
                : undefined
            }
            data={diskData}
            options={pctAreaOpts}
            kind="area"
          />
          <MetricChart
            title={t("metrics.network")}
            meta={
              latest
                ? `${formatRate(latest.net_out)} ↑ · ${formatRate(latest.net_in)} ↓`
                : undefined
            }
            data={netData}
            options={netOpts}
          />
          <MetricChart
            title={t("metrics.connections")}
            meta={
              latest
                ? `TCP ${latest.connections} · UDP ${latest.connections_udp}`
                : undefined
            }
            data={connData}
            options={connOpts}
          />
          <MetricChart
            title={t("metrics.process")}
            meta={latest ? String(Math.round(latest.process)) : undefined}
            data={procData}
            options={areaOpts}
            kind="area"
          />
        </div>
      )}
    </div>
  );
}
