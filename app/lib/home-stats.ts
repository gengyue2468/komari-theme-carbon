import {
  billingCycleMonths,
  formatBytes,
  formatRate,
  isNeverExpire,
  trafficUsedBytes,
} from "~/lib/format";
import type { NodeInfo, RealtimeMetrics } from "~/types/komari";

export interface HomeStatItem {
  id: string;
  labelKey:
    | "stats.memory"
    | "stats.disk"
    | "stats.remaining"
    | "stats.traffic"
    | "stats.uplink"
    | "stats.downlink";
  value: string;
  unit?: string;
  suffix?: string;
  icon: "memory" | "disk" | "finance" | "traffic" | "up" | "down";
}

function splitBytes(n: number): { value: string; unit: string } {
  if (!Number.isFinite(n) || n <= 0) return { value: "0", unit: "B" };
  const s = formatBytes(n, 1);
  const [value, unit] = s.split(" ");
  return { value: value ?? "0", unit: unit ?? "B" };
}

export function computeHomeStats(
  nodes: NodeInfo[],
  realtime: Record<string, RealtimeMetrics>,
  onlineIds: string[],
): HomeStatItem[] {
  const online = new Set(onlineIds);
  let ramUsed = 0;
  let ramTotal = 0;
  let diskUsed = 0;
  let diskTotal = 0;
  let traffic = 0;
  let up = 0;
  let down = 0;

  for (const n of nodes) {
    const m = realtime[n.uuid];
    ramTotal += n.mem_total || m?.ram.total || 0;
    diskTotal += n.disk_total || m?.disk.total || 0;
    if (m) {
      ramUsed += m.ram.used || 0;
      diskUsed += m.disk.used || 0;
      traffic += trafficUsedBytes(
        m.network.totalUp || 0,
        m.network.totalDown || 0,
        n.traffic_limit_type,
      );
      if (online.has(n.uuid)) {
        up += m.network.up || 0;
        down += m.network.down || 0;
      }
    }
  }

  const ram = splitBytes(ramUsed);
  const ramT = splitBytes(ramTotal);
  const disk = splitBytes(diskUsed);
  const diskT = splitBytes(diskTotal);
  const traf = splitBytes(traffic);
  const upS = formatRate(up).replace("/s", "");
  const downS = formatRate(down).replace("/s", "");
  const [upV, upU] = upS.split(" ");
  const [downV, downU] = downS.split(" ");

  return [
    {
      id: "memory",
      labelKey: "stats.memory",
      value: ram.value,
      unit: ram.unit,
      suffix: `/ ${ramT.value} ${ramT.unit}`,
      icon: "memory",
    },
    {
      id: "disk",
      labelKey: "stats.disk",
      value: disk.value,
      unit: disk.unit,
      suffix: `/ ${diskT.value} ${diskT.unit}`,
      icon: "disk",
    },
    {
      id: "remaining",
      labelKey: "stats.remaining",
      value: "",
      icon: "finance",
    },
    {
      id: "traffic",
      labelKey: "stats.traffic",
      value: traf.value,
      unit: traf.unit,
      icon: "traffic",
    },
    {
      id: "uplink",
      labelKey: "stats.uplink",
      value: upV ?? "0",
      unit: `${upU ?? "B"}/s`,
      icon: "up",
    },
    {
      id: "downlink",
      labelKey: "stats.downlink",
      value: downV ?? "0",
      unit: `${downU ?? "B"}/s`,
      icon: "down",
    },
  ];
}

export function nodeFinance(node: NodeInfo): {
  monthly: string;
  remaining: string;
  remainUnit?: string;
} {
  if (node.price < 0) {
    return { monthly: "—", remaining: "—" };
  }
  if (node.price === 0 || node.billing_cycle <= 0) {
    return {
      monthly: "—",
      remaining: "—",
    };
  }
  const months = billingCycleMonths(node.billing_cycle);
  if (months <= 0) {
    return { monthly: "—", remaining: "—" };
  }
  const monthly = node.price / months;
  const cur = node.currency || "";
  let remaining = "—";
  if (node.expired_at && !isNeverExpire(node.expired_at)) {
    const exp = new Date(node.expired_at).getTime();
    const now = Date.now();
    if (exp > now) {
      const days = (exp - now) / 86400000;
      remaining = `${cur}${((node.price / node.billing_cycle) * days).toFixed(2)}`;
    }
  }
  return {
    monthly: `${cur}${monthly.toFixed(2)}`,
    remaining,
  };
}
