import type {
  LoadRecord,
  NodeInfo,
  NodePingLive,
  RealtimeMetrics,
  RealtimeSnapshot,
} from "~/types/komari";
import type {
  RpcClientInfo,
  RpcNodeStatus,
  RpcStatusRecord,
} from "~/api/rpc";

export function mapClientToNodeInfo(c: RpcClientInfo): NodeInfo {
  return {
    uuid: c.uuid,
    name: c.name || c.uuid,
    cpu_name: c.cpu_name || "",
    virtualization: c.virtualization || "",
    arch: c.arch || "",
    cpu_cores: c.cpu_cores ?? 0,
    cpu_physical_cores: c.cpu_physical_cores ?? 0,
    os: c.os || "",
    kernel_version: c.kernel_version || "",
    gpu_name: c.gpu_name || "None",
    region: c.region || "",
    mem_total: c.mem_total ?? 0,
    swap_total: c.swap_total ?? 0,
    disk_total: c.disk_total ?? 0,
    weight: c.weight ?? 0,
    price: c.price ?? 0,
    billing_cycle: c.billing_cycle ?? 0,
    auto_renewal: Boolean(c.auto_renewal),
    currency: c.currency || "$",
    expired_at: c.expired_at ?? null,
    group: c.group || "",
    tags: c.tags || "",
    public_remark: c.public_remark,
    hidden: Boolean(c.hidden),
    traffic_limit: c.traffic_limit ?? 0,
    traffic_limit_type: c.traffic_limit_type || "max",
    created_at: c.created_at || "",
    updated_at: c.updated_at || "",
    ipv4: c.ipv4,
    ipv6: c.ipv6,
  };
}

export function mapClientsToNodes(
  map: Record<string, RpcClientInfo>,
): NodeInfo[] {
  return Object.values(map)
    .map(mapClientToNodeInfo)
    // Emerald / admin: smaller weight first
    .sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name));
}

function mapPing(
  ping?: RpcNodeStatus["ping"],
): Record<string, NodePingLive> | undefined {
  if (!ping) return undefined;
  const out: Record<string, NodePingLive> = {};
  for (const [id, p] of Object.entries(ping)) {
    out[id] = {
      name: p.name,
      latest: p.latest,
      avg: p.avg,
      loss: p.loss,
      min: p.min,
      max: p.max,
    };
  }
  return out;
}

export function mapStatusToMetrics(
  s: RpcNodeStatus | (RpcStatusRecord & { online?: boolean; uptime?: number; ping?: RpcNodeStatus["ping"] }),
): RealtimeMetrics {
  return {
    cpu: { usage: s.cpu ?? 0 },
    ram: { total: s.ram_total ?? 0, used: s.ram ?? 0 },
    swap: { total: s.swap_total ?? 0, used: s.swap ?? 0 },
    load: {
      load1: s.load ?? 0,
      load5: ("load5" in s ? s.load5 : 0) ?? 0,
      load15: ("load15" in s ? s.load15 : 0) ?? 0,
    },
    disk: { total: s.disk_total ?? 0, used: s.disk ?? 0 },
    network: {
      up: s.net_out ?? 0,
      down: s.net_in ?? 0,
      totalUp: s.net_total_up ?? 0,
      totalDown: s.net_total_down ?? 0,
    },
    connections: {
      tcp: s.connections ?? 0,
      udp: s.connections_udp ?? 0,
    },
    uptime: ("uptime" in s ? s.uptime : 0) ?? 0,
    process: s.process ?? 0,
    message: "",
    updated_at: s.time || new Date().toISOString(),
    ping: mapPing("ping" in s ? s.ping : undefined),
  };
}

export function mapStatusesToSnapshot(
  map: Record<string, RpcNodeStatus>,
): RealtimeSnapshot {
  const online: string[] = [];
  const data: Record<string, RealtimeMetrics> = {};
  for (const [uuid, st] of Object.entries(map)) {
    data[uuid] = mapStatusToMetrics(st);
    if (st.online) online.push(uuid);
  }
  return { online, data };
}

export function mapStatusRecordToLoad(r: RpcStatusRecord): LoadRecord {
  return {
    client: r.client,
    time: r.time,
    cpu: Number(r.cpu) || 0,
    gpu: Number(r.gpu) || 0,
    ram: Number(r.ram) || 0,
    ram_total: Number(r.ram_total) || 0,
    swap: Number(r.swap) || 0,
    swap_total: Number(r.swap_total) || 0,
    load: Number(r.load) || 0,
    temp: Number(r.temp) || 0,
    disk: Number(r.disk) || 0,
    disk_total: Number(r.disk_total) || 0,
    net_in: Number(r.net_in) || 0,
    net_out: Number(r.net_out) || 0,
    net_total_up: Number(r.net_total_up) || 0,
    net_total_down: Number(r.net_total_down) || 0,
    process: Number(r.process) || 0,
    connections: Number(r.connections) || 0,
    connections_udp: Number(r.connections_udp) || 0,
  };
}
