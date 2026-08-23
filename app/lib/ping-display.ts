import type { NodePingLive, RealtimeMetrics } from "~/types/komari";
import type { PingHistoryResponse } from "~/types/komari";
import i18n from "~/i18n";
import { ISP_COLORS, PING_TASK_COLORS } from "~/lib/ping-tone";

export interface PingNetworkDisplay {
  id: string;
  name: string;
  latencyMs: number | null;
  lossPct?: number;
}

/** Build 三网-style list from live status.ping map */
export function networksFromLivePing(
  ping?: Record<string, NodePingLive>,
): PingNetworkDisplay[] {
  if (!ping) return [];
  return Object.entries(ping).map(([id, p]) => ({
    id,
    name: p.name,
    latencyMs: p.latest >= 0 ? roundLatency(p.latest) : -1,
    lossPct: p.loss,
  }));
}

/**
 * Chinese ISP category: 电信 (CT) / 联通 (CU) / 移动 (CM).
 * Matches by keyword in the task name.
 */
export type IspCategory = "CT" | "CU" | "CM";

export function categorizeIsp(name: string): IspCategory | null {
  const s = name.toLowerCase();
  if (
    s.includes("电信") ||
    s.includes("telecom") ||
    s.includes("ct") ||
    s.includes("chinatelecom")
  )
    return "CT";
  if (
    s.includes("联通") ||
    s.includes("unicom") ||
    s.includes("cu") ||
    s.includes("chinaunicom")
  )
    return "CU";
  if (
    s.includes("移动") ||
    s.includes("mobile") ||
    s.includes("cm") ||
    s.includes("chinamobile")
  )
    return "CM";
  return null;
}

export interface PingNetworkSelection {
  visible: PingNetworkDisplay[];
  extraCount: number;
}

/** Keep the backend monitoring-point order and cap compact views at three. */
export function selectPingNetworks(
  ping?: Record<string, NodePingLive>,
  limit = 3,
): PingNetworkSelection {
  const all = networksFromLivePing(ping);
  const visible = all.slice(0, Math.max(0, limit));
  return {
    visible,
    extraCount: Math.max(0, all.length - visible.length),
  };
}

export interface PingSparkPoint {
  time: string;
  latency: number | null;
  loss: number | null;
}

export interface NodePingHistorySummary {
  networks: PingNetworkDisplay[];
  bars: PingSparkPoint[];
  avgLatencyMs: number | null;
  avgLossPct: number | null;
}

const NODE_PING_BAR_COUNT = 10;

function mean(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function roundLatency(value: number): number {
  return Number(value.toFixed(1));
}

export function formatLatencyMs(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 0) return "-1ms";
  return `${value.toFixed(1)}ms`;
}

/** Reduce the shared one-hour Ping history into the compact node summary. */
export function buildNodePingHistorySummary(
  hist: PingHistoryResponse | undefined,
  uuid: string,
): NodePingHistorySummary | null {
  if (!hist) return null;
  const records = hist.records
    .filter((record) => record.client === uuid)
    .map((record) => ({
      ...record,
      timestamp: new Date(record.time).getTime(),
    }))
    .filter((record) => Number.isFinite(record.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!records.length) {
    return { networks: [], bars: [], avgLatencyMs: null, avgLossPct: null };
  }

  const taskIds = new Set<number>();
  const taskStats = new Map<number, { values: number[]; total: number }>();
  for (const record of records) {
    const stat = taskStats.get(record.task_id) ?? { values: [], total: 0 };
    stat.total += 1;
    if (record.value >= 0) stat.values.push(record.value);
    taskStats.set(record.task_id, stat);
    taskIds.add(record.task_id);
  }

  const taskName = new Map(
    hist.tasks.map((task) => [task.id, task.name || i18n.t("detail.task", { id: task.id })]),
  );
  const networkAverages: number[] = [];
  const orderedTaskIds = [
    ...hist.tasks.map((task) => task.id),
    ...taskStats.keys(),
  ].filter((id, index, all) => taskIds.has(id) && all.indexOf(id) === index);
  const networks = orderedTaskIds.map((id) => {
    const stat = taskStats.get(id);
    const avg = mean(stat?.values ?? []);
    const loss = stat?.total
      ? ((stat.total - (stat.values.length ?? 0)) / stat.total) * 100
      : 100;
    if (avg != null) networkAverages.push(avg);
    return {
      id: String(id),
      name: taskName.get(id) ?? i18n.t("detail.task", { id }),
      latencyMs: avg == null ? -1 : roundLatency(avg),
      lossPct: Number(loss.toFixed(1)),
    };
  });

  const first = records[0].timestamp;
  const last = records[records.length - 1].timestamp;
  const bucketCount = Math.min(NODE_PING_BAR_COUNT, records.length);
  const bucketSize = Math.max(1, (last - first) / bucketCount);
  const bars = Array.from({ length: bucketCount }, (_, index) => {
    const start = first + bucketSize * index;
    const end = index === bucketCount - 1 ? last + 1 : start + bucketSize;
    const bucket = records.filter(
      (record) => record.timestamp >= start && record.timestamp < end,
    );
    const valid = bucket.filter((record) => record.value >= 0);
    return {
      time: new Date(start).toISOString(),
      latency:
        bucket.length > 0 && valid.length === 0
          ? -1
          : mean(valid.map((record) => record.value)),
      loss: bucket.length
        ? ((bucket.length - valid.length) / bucket.length) * 100
        : null,
    };
  });

  const averageLatency = mean(networkAverages);
  return {
    networks,
    bars,
    avgLatencyMs: averageLatency == null ? null : roundLatency(averageLatency),
    avgLossPct: mean(networks.map((network) => network.lossPct ?? 0)),
  };
}

export function sparkFromLivePing(
  ping?: Record<string, NodePingLive>,
): PingSparkPoint[] {
  return networksFromLivePing(ping).map((point) => ({
    time: point.id,
    latency: point.latencyMs,
    loss: point.lossPct ?? null,
  }));
}

/** Aggregate all live monitoring points for the compact card summary. */
export function cardPingFromMetrics(metrics?: RealtimeMetrics): {
  bars: PingSparkPoint[];
  avgLatencyMs: number | null;
  avgLossPct: number | null;
} {
  const networks = networksFromLivePing(metrics?.ping);
  const latencies = networks
    .map((point) => point.latencyMs)
    .filter((value): value is number => value != null && value >= 0);
  const losses = networks
    .map((point) => point.lossPct)
    .filter((value): value is number => value != null);

  return {
    bars: sparkFromLivePing(metrics?.ping),
    avgLatencyMs:
      latencies.length > 0
        ? roundLatency(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
        : null,
    avgLossPct:
      losses.length > 0
        ? Number(
            (losses.reduce((sum, value) => sum + value, 0) / losses.length).toFixed(1),
          )
        : null,
  };
}

export interface PingChartTask {
  id: string;
  name: string;
  color: string;
  latest: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  lossPct: number;
  samples: number;
  type?: string;
  interval?: number;
}

export interface PingChartPoint {
  time: string;
  values: Record<string, number | null>;
  losses: Record<string, boolean>;
}

interface PingChartSlot {
  values: Record<string, number | null>;
  losses: Record<string, boolean>;
}

/** Convert API ping history into chart tasks + points */
export function buildPingChartModel(
  hist: PingHistoryResponse,
): { tasks: PingChartTask[]; points: PingChartPoint[] } {
  const taskMap = new Map<number, PingChartTask>();
  const byTime = new Map<number, PingChartSlot>();
  const serverTasks = new Map(hist.tasks.map((task) => [task.id, task]));

  // 电信/联通/移动 get stable identity colors; other tasks fall back to the
  // rotating palette so colors don't shuffle when task order changes.
  const colorFor = (name: string, id: number): string => {
    const cat = categorizeIsp(name);
    if (cat) return ISP_COLORS[cat];
    return PING_TASK_COLORS[(id - 1) % PING_TASK_COLORS.length];
  };

  for (const t of hist.tasks) {
    const id = String(t.id);
    taskMap.set(t.id, {
      id,
      name: t.name,
      color: colorFor(t.name, t.id),
      latest: t.latest ?? null,
      avg: t.avg ?? null,
      min: t.min ?? null,
      max: t.max ?? null,
      lossPct: t.loss ?? 0,
      samples: t.total ?? 0,
      type: t.type,
      interval: t.interval,
    });
  }

  const intervals = hist.tasks
    .map((task) => task.interval)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const fallbackIntervalMs = (intervals.length ? Math.min(...intervals) : 60) * 1000;
  const mergeToleranceMs = Math.min(
    6000,
    Math.max(800, Math.floor(fallbackIntervalMs * 0.25)),
  );
  const anchors: number[] = [];

  const timedRecords = hist.records
    .map((record) => ({
      record,
      timestamp: new Date(record.time).getTime(),
    }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const { record: r, timestamp } of timedRecords) {
    const id = String(r.task_id);
    if (!taskMap.has(r.task_id)) {
      taskMap.set(r.task_id, {
        id,
        name: i18n.t("detail.task", { id: r.task_id }),
        color: colorFor(i18n.t("detail.task", { id: r.task_id }), r.task_id),
        latest: null,
        avg: null,
        min: null,
        max: null,
        lossPct: 0,
        samples: 0,
      });
    }
    const anchor = anchors.find((value) => Math.abs(value - timestamp) <= mergeToleranceMs);
    const time = anchor ?? timestamp;
    if (anchor == null) anchors.push(time);
    let slot = byTime.get(time);
    if (!slot) {
      slot = { values: {}, losses: {} };
      byTime.set(time, slot);
    }
    // value < 0 => packet loss
    if (r.value < 0) {
      slot.values[id] = null;
      slot.losses[id] = true;
    } else {
      slot.values[id] = r.value;
      delete slot.losses[id];
    }
  }

  // Preserve server statistics and only derive missing fields from records.
  for (const [tid, task] of taskMap) {
    const id = String(tid);
    const vals: number[] = [];
    let loss = 0;
    let total = 0;
    for (const { values } of byTime.values()) {
      if (!(id in values)) continue;
      total += 1;
      const v = values[id];
      if (v == null) loss += 1;
      else vals.push(v);
    }
    const server = serverTasks.get(tid);
    if (server?.latest != null) {
      task.latest = server.latest;
    } else if (vals.length) {
      task.latest = vals[vals.length - 1] ?? task.latest;
    } else if (total > 0) {
      task.latest = -1;
    }
    if (vals.length) {
      task.avg = server?.avg ?? vals.reduce((a, b) => a + b, 0) / vals.length;
      task.min = server?.min ?? Math.min(...vals);
      task.max = server?.max ?? Math.max(...vals);
    }
    task.samples = server?.total ?? total;
    if (server?.loss == null && total > 0) {
      task.lossPct = Number(((loss / total) * 100).toFixed(1));
    }
  }

  const pointEntries = [...byTime.entries()].sort(([a], [b]) => a - b);
  for (const task of taskMap.values()) {
    const id = task.id;
    const valid = pointEntries
      .map(([, slot], index) => ({ index, value: slot.values[id] }))
      .filter((item): item is { index: number; value: number } =>
        typeof item.value === "number" && Number.isFinite(item.value),
      );
    if (valid.length < 2) continue;
    const gaps: number[] = [];
    for (let i = 1; i < valid.length; i += 1) {
      const previous = pointEntries[valid[i - 1].index][0];
      const current = pointEntries[valid[i].index][0];
      if (current > previous) gaps.push(current - previous);
    }
    const medianGap = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : fallbackIntervalMs;
    const maxGap = Math.min(30 * 60_000, Math.max(2 * 60_000, medianGap * 6));
    for (let i = 0; i < valid.length - 1; i += 1) {
      const left = valid[i];
      const right = valid[i + 1];
      const t0 = pointEntries[left.index][0];
      const t1 = pointEntries[right.index][0];
      if (t1 - t0 > maxGap) continue;
      const v0 = left.value;
      const v1 = right.value;
      for (let j = left.index + 1; j < right.index; j += 1) {
        const slot = pointEntries[j][1];
        if (slot.values[id] != null || slot.losses[id]) continue;
        const ratio = (pointEntries[j][0] - t0) / (t1 - t0);
        slot.values[id] = v0 + (v1 - v0) * ratio;
      }
    }
  }

  const points: PingChartPoint[] = pointEntries.map(([time, slot]) => ({
    time: new Date(time).toISOString(),
    values: slot.values,
    losses: slot.losses,
  }));

  return { tasks: [...taskMap.values()], points };
}
