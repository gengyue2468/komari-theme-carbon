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
    latencyMs: p.latest >= 0 ? Math.round(p.latest) : null,
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
    .filter((value): value is number => value != null);
  const losses = networks
    .map((point) => point.lossPct)
    .filter((value): value is number => value != null);

  return {
    bars: sparkFromLivePing(metrics?.ping),
    avgLatencyMs:
      latencies.length > 0
        ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
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
}

/** Convert API ping history into chart tasks + points */
export function buildPingChartModel(
  hist: PingHistoryResponse,
): { tasks: PingChartTask[]; points: PingChartPoint[] } {
  const taskMap = new Map<number, PingChartTask>();
  const byTime = new Map<string, Record<string, number | null>>();

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

  for (const r of hist.records) {
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
    let slot = byTime.get(r.time);
    if (!slot) {
      slot = {};
      byTime.set(r.time, slot);
    }
    // value < 0 => packet loss
    slot[id] = r.value < 0 ? null : r.value;
  }

  // recompute stats from records if tasks incomplete
  for (const [tid, task] of taskMap) {
    const id = String(tid);
    const vals: number[] = [];
    let loss = 0;
    let total = 0;
    for (const slot of byTime.values()) {
      if (!(id in slot)) continue;
      total += 1;
      const v = slot[id];
      if (v == null) loss += 1;
      else vals.push(v);
    }
    if (vals.length) {
      task.latest = vals[vals.length - 1] ?? task.latest;
      task.avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      task.min = Math.min(...vals);
      task.max = Math.max(...vals);
      task.samples = vals.length;
    }
    if (total > 0) {
      task.lossPct = Number(((loss / total) * 100).toFixed(1));
    }
  }

  const points: PingChartPoint[] = [...byTime.entries()]
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([time, values]) => ({ time, values }));

  return { tasks: [...taskMap.values()], points };
}
