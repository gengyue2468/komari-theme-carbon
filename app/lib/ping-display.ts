import type { NodePingLive, RealtimeMetrics } from "~/types/komari";
import type { PingHistoryResponse } from "~/types/komari";
import { PING_TASK_COLORS } from "~/lib/ping-tone";

export interface PingNetworkDisplay {
  name: string;
  latencyMs: number | null;
  lossPct?: number;
}

export interface PingSparkPoint {
  time: string;
  latency: number | null;
  loss: number | null;
}

/** Build 三网-style list from live status.ping map */
export function networksFromLivePing(
  ping?: Record<string, NodePingLive>,
): PingNetworkDisplay[] {
  if (!ping) return [];
  return Object.values(ping).map((p) => ({
    name: p.name,
    latencyMs: p.latest >= 0 ? Math.round(p.latest) : null,
    lossPct: p.loss,
  }));
}

export function sparkFromLivePing(
  ping?: Record<string, NodePingLive>,
): PingSparkPoint[] {
  // Live status has no history; synthesize flat bars from latest for card spark
  const nets = networksFromLivePing(ping);
  if (nets.length === 0) {
    return Array.from({ length: 12 }, (_, i) => ({
      time: String(i),
      latency: null,
      loss: null,
    }));
  }
  const avg =
    nets.reduce((s, n) => s + (n.latencyMs ?? 0), 0) /
    Math.max(1, nets.filter((n) => n.latencyMs != null).length);
  return Array.from({ length: 12 }, (_, i) => ({
    time: String(i),
    latency: avg > 0 ? Math.round(avg + (i % 3) * 2) : null,
    loss: nets[0]?.lossPct ?? 0,
  }));
}

export function cardPingFromMetrics(metrics?: RealtimeMetrics): {
  networks: PingNetworkDisplay[];
  bars: PingSparkPoint[];
  avgLatencyMs: number;
  avgLossPct: number;
} {
  const networks = networksFromLivePing(metrics?.ping);
  const valid = networks
    .map((n) => n.latencyMs)
    .filter((v): v is number => v != null);
  const avgLatencyMs =
    valid.length > 0
      ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
      : 0;
  const losses = networks
    .map((n) => n.lossPct)
    .filter((v): v is number => v != null);
  const avgLossPct =
    losses.length > 0
      ? Number(
          (losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(1),
        )
      : 0;
  return {
    networks,
    bars: sparkFromLivePing(metrics?.ping),
    avgLatencyMs,
    avgLossPct,
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

  for (const t of hist.tasks) {
    const id = String(t.id);
    taskMap.set(t.id, {
      id,
      name: t.name,
      color: PING_TASK_COLORS[(t.id - 1) % PING_TASK_COLORS.length],
      latest: t.latest ?? null,
      avg: t.avg ?? null,
      min: t.min ?? null,
      max: t.max ?? null,
      lossPct: t.loss ?? 0,
      samples: t.total ?? 0,
    });
  }

  for (const r of hist.records) {
    const id = String(r.task_id);
    if (!taskMap.has(r.task_id)) {
      taskMap.set(r.task_id, {
        id,
        name: `Task ${r.task_id}`,
        color: PING_TASK_COLORS[(r.task_id - 1) % PING_TASK_COLORS.length],
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
