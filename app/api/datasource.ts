import type {
  KomariDataSource,
  LoadRecordsResponse,
  MeInfo,
  NodeInfo,
  PingHistoryResponse,
  PublicSettings,
  RealtimeMetrics,
  RealtimeSnapshot,
} from "~/types/komari";
import {
  getRpc,
  normalizeRecordList,
  rpcGetLoadRecords,
  rpcGetNodeRecentStatus,
  rpcGetNodes,
  rpcGetNodesLatestStatus,
  rpcGetPingRecords,
  RpcError,
} from "~/api/rpc";
import {
  mapClientsToNodes,
  mapClientToNodeInfo,
  mapStatusRecordToLoad,
  mapStatusToMetrics,
  mapStatusesToSnapshot,
} from "~/api/mappers";
import type { LoadRecord, PingHistoryRecord, PingTaskMeta } from "~/types/komari";
import type { RpcClientInfo } from "~/api/rpc";

function apiRoot(): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";
  return base.replace(/\/$/, "") || "/api";
}

async function fetchRest(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const outerSignal = init.signal;
  const onAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
    outerSignal?.removeEventListener("abort", onAbort);
  }
}

async function readJsonResponse<T>(res: Response, endpoint: string): Promise<T> {
  const body = await res.text();
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("json")) {
    const isAnubis = /anubis|making sure you're not a bot/i.test(body);
    throw new Error(
      `${endpoint} returned ${isAnubis ? "an Anubis challenge page" : "HTML"} instead of JSON`,
    );
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${endpoint} returned invalid JSON`);
  }
}

async function restPublic(signal?: AbortSignal): Promise<PublicSettings> {
  const res = await fetchRest(`${apiRoot()}/public`, {
    credentials: "include",
    signal,
  });
  if (!res.ok) throw new Error(`public ${res.status}`);
  const json = await readJsonResponse<{
    status?: string;
    data: PublicSettings;
  }>(res, `${apiRoot()}/public`);
  if (json.status && json.status !== "success") {
    throw new Error("Failed to load public settings");
  }
  return {
    ...json.data,
    theme_settings: json.data.theme_settings ?? {},
  };
}

async function restMe(): Promise<MeInfo> {
  try {
    const res = await fetchRest(`${apiRoot()}/me`, { credentials: "include" });
    if (!res.ok) return { logged_in: false };
    return (await res.json()) as MeInfo;
  } catch {
    return { logged_in: false };
  }
}

async function restNodes(signal?: AbortSignal) {
  const res = await fetchRest(`${apiRoot()}/nodes`, {
    credentials: "include",
    signal,
  });
  if (!res.ok) throw new Error(`nodes ${res.status}`);
  const json = await readJsonResponse<{
    status?: string;
    data?: RpcClientInfo[] | Record<string, RpcClientInfo>;
  }>(res, `${apiRoot()}/nodes`);
  if (json.status && json.status !== "success") {
    throw new Error("Failed to load nodes");
  }
  const data = json.data;
  const clients = Array.isArray(data) ? data : Object.values(data ?? {});
  return mapClientsToNodes(
    Object.fromEntries(clients.map((client) => [client.uuid, client])),
  );
}

async function restRecent(
  uuid: string,
  signal?: AbortSignal,
): Promise<Array<Partial<RealtimeMetrics>>> {
  const res = await fetchRest(`${apiRoot()}/recent/${encodeURIComponent(uuid)}`, {
    credentials: "include",
    signal,
  });
  if (!res.ok) throw new Error(`recent ${res.status}`);
  const json = await readJsonResponse<{
    status?: string;
    data?: Array<Partial<RealtimeMetrics>>;
  }>(res, `${apiRoot()}/recent/${encodeURIComponent(uuid)}`);
  if (json.status && json.status !== "success") {
    throw new Error("Failed to load recent status");
  }
  return json.data ?? [];
}

function numberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRestMetrics(
  raw: Partial<RealtimeMetrics>,
  fallbackTime = new Date().toISOString(),
): RealtimeMetrics {
  const gpu = raw.gpu;
  return {
    cpu: { usage: numberOrZero(raw.cpu?.usage) },
    gpu: gpu
      ? {
          count: numberOrZero(gpu.count),
          average_usage: numberOrZero(gpu.average_usage),
          detailed_info: (gpu.detailed_info ?? []).map((device) => ({
            name: device.name || "",
            memory_total: numberOrZero(device.memory_total),
            memory_used: numberOrZero(device.memory_used),
            utilization: numberOrZero(device.utilization),
            temperature: numberOrZero(device.temperature),
          })),
        }
      : undefined,
    temp: raw.temp == null ? undefined : numberOrZero(raw.temp),
    ram: {
      total: numberOrZero(raw.ram?.total),
      used: numberOrZero(raw.ram?.used),
    },
    swap: {
      total: numberOrZero(raw.swap?.total),
      used: numberOrZero(raw.swap?.used),
    },
    load: {
      load1: numberOrZero(raw.load?.load1),
      load5: numberOrZero(raw.load?.load5),
      load15: numberOrZero(raw.load?.load15),
    },
    disk: {
      total: numberOrZero(raw.disk?.total),
      used: numberOrZero(raw.disk?.used),
    },
    network: {
      up: numberOrZero(raw.network?.up),
      down: numberOrZero(raw.network?.down),
      totalUp: numberOrZero(raw.network?.totalUp),
      totalDown: numberOrZero(raw.network?.totalDown),
    },
    connections: {
      tcp: numberOrZero(raw.connections?.tcp),
      udp: numberOrZero(raw.connections?.udp),
    },
    uptime: numberOrZero(raw.uptime),
    process: numberOrZero(raw.process),
    message: raw.message || "",
    updated_at: raw.updated_at || fallbackTime,
    ping: raw.ping,
  };
}

function metricsToLoadRecord(uuid: string, metrics: RealtimeMetrics): LoadRecord {
  return {
    client: uuid,
    time: metrics.updated_at,
    cpu: metrics.cpu.usage,
    gpu: metrics.gpu?.average_usage ?? 0,
    ram: metrics.ram.used,
    ram_total: metrics.ram.total,
    swap: metrics.swap.used,
    swap_total: metrics.swap.total,
    load: metrics.load.load1,
    temp: metrics.temp ?? 0,
    disk: metrics.disk.used,
    disk_total: metrics.disk.total,
    net_in: metrics.network.down,
    net_out: metrics.network.up,
    net_total_up: metrics.network.totalUp,
    net_total_down: metrics.network.totalDown,
    traffic_up: metrics.network.totalUp,
    traffic_down: metrics.network.totalDown,
    process: metrics.process,
    connections: metrics.connections.tcp,
    connections_udp: metrics.connections.udp,
  };
}

async function restRealtimeSnapshot(
  signal?: AbortSignal,
  initialNodes?: NodeInfo[],
): Promise<RealtimeSnapshot> {
  const nodes = initialNodes ?? (await restNodes(signal));
  const latestByNode = await Promise.all(
    nodes.map(async (node) => {
      try {
        const records = await restRecent(node.uuid, signal);
        const latest = records.reduce<Partial<RealtimeMetrics> | undefined>(
          (current, candidate) => {
            if (!current) return candidate;
            const currentTime = Date.parse(current.updated_at || "");
            const candidateTime = Date.parse(candidate.updated_at || "");
            return candidateTime >= currentTime ? candidate : current;
          },
          undefined,
        );
        return [node.uuid, latest, undefined] as const;
      } catch (e) {
        return [node.uuid, undefined, e] as const;
      }
    }),
  );

  const failed = latestByNode.filter(([, , error]) => error != null);
  if (failed.length === nodes.length && failed[0]?.[2]) {
    throw failed[0][2];
  }

  const online: string[] = [];
  const data: Record<string, RealtimeMetrics> = {};
  const updatedAt: Record<string, string> = {};
  for (const [uuid, raw] of latestByNode) {
    if (!raw) continue;
    const metrics = normalizeRestMetrics(raw);
    online.push(uuid);
    data[uuid] = metrics;
    updatedAt[uuid] = metrics.updated_at;
  }
  return { online, data, updatedAt };
}

async function restLoadRecords(
  uuid: string,
  hours: number,
  signal?: AbortSignal,
): Promise<LoadRecordsResponse> {
  const res = await fetchRest(
    `${apiRoot()}/records/load?uuid=${encodeURIComponent(uuid)}&hours=${hours}`,
    { credentials: "include", signal },
  );
  if (!res.ok) throw new Error(`load records ${res.status}`);
  const json = await readJsonResponse<{
    status?: string;
    data?: {
      count?: number;
      has_gpu_data?: boolean;
      records?: LoadRecord[] | Record<string, LoadRecord[]>;
    };
  }>(res, `${apiRoot()}/records/load`);
  if (json.status && json.status !== "success") {
    throw new Error("Failed to load load records");
  }
  const raw = json.data?.records;
  const list = normalizeRecordList(raw, uuid);
  return {
    count: json.data?.count ?? list.length,
    has_gpu_data: json.data?.has_gpu_data,
    records: list.map(mapStatusRecordToLoad),
  };
}

async function restPingRecords(
  uuid: string | undefined,
  hours: number,
  signal?: AbortSignal,
): Promise<PingHistoryResponse> {
  const res = await fetchRest(
    `${apiRoot()}/records/ping?${uuid ? `uuid=${encodeURIComponent(uuid)}&` : ""}hours=${hours}`,
    { credentials: "include", signal },
  );
  if (!res.ok) throw new Error(`ping records ${res.status}`);
  const json = await readJsonResponse<{
    status?: string;
    data?: {
      count?: number;
      records?: PingHistoryRecord[] | Record<string, PingHistoryRecord[]>;
      tasks?: PingTaskMeta[];
    };
  }>(res, `${apiRoot()}/records/ping`);
  if (json.status && json.status !== "success") {
    throw new Error("Failed to load ping records");
  }
  const list = normalizeRecordList(json.data?.records, uuid);
  return {
    count: json.data?.count ?? list.length,
    records: list,
    tasks: json.data?.tasks ?? [],
  };
}

async function rpcLegacyPingHistory(
  uuid: string | undefined,
  hours: number,
  signal?: AbortSignal,
): Promise<PingHistoryResponse> {
  const res = await rpcGetPingRecords(uuid, hours, signal);
  const records = uuid
    ? (res.records ?? []).filter((record) => record.client === uuid)
    : res.records ?? [];
  return {
    count: records.length,
    records: records.map((r) => ({
      task_id: r.task_id,
      time: r.time,
      value: r.value,
      client: r.client ?? uuid,
    })),
    tasks: (res.tasks ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      loss: t.loss,
      min: t.min,
      max: t.max,
      avg: t.avg,
      latest: t.latest,
      total: t.total,
      type: t.type,
      interval: t.interval,
      p50: t.p50,
      p99: t.p99,
      p99_p50_ratio: t.p99_p50_ratio,
    })),
  };
}

function createRpcDataSource(): KomariDataSource {
  return {
    async getPublic(signal) {
      return restPublic(signal);
    },

    async getNodes(signal) {
      try {
        const map = await rpcGetNodes(signal);
        return mapClientsToNodes(map);
      } catch (e) {
        if (e instanceof RpcError && e.code === 401) {
          window.location.href = "/admin";
          throw e;
        }
        if (signal?.aborted) throw e;
        return restNodes(signal);
      }
    },

    async getRealtimeSnapshot(signal) {
      try {
        return mapStatusesToSnapshot(await rpcGetNodesLatestStatus(signal));
      } catch (e) {
        if (e instanceof RpcError && e.code === 401) {
          window.location.href = "/admin";
          throw e;
        }
        return restRealtimeSnapshot(signal);
      }
    },

    async getRecentLoadRecords(uuid, limit = 150, signal) {
      try {
        const res = await rpcGetNodeRecentStatus(uuid, limit, signal);
        if (signal?.aborted) throw new RpcError(-32000, "Request aborted");
        const records = (res.records ?? []).map(mapStatusRecordToLoad);
        return {
          count: res.count ?? records.length,
          records,
          has_gpu_data:
            records.some((record) => record.gpu !== 0) || undefined,
        };
      } catch (e) {
        if (signal?.aborted) throw e;
        const records = (await restRecent(uuid)).map((record) =>
          metricsToLoadRecord(uuid, normalizeRestMetrics(record)),
        );
        return {
          count: records.length,
          records,
          has_gpu_data:
            records.some((record) => record.gpu !== 0) || undefined,
        };
      }
    },

    async getRecent(uuid) {
      try {
        const res = await rpcGetNodeRecentStatus(uuid);
        return (res.records ?? []).map((r) =>
          mapStatusToMetrics({
            ...r,
            online: true,
            uptime: 0,
            load5: r.load5,
            load15: r.load15,
          }),
        );
      } catch {
        const records = await restRecent(uuid);
        return records.map((record) => normalizeRestMetrics(record));
      }
    },

    async getLoadRecords(uuid, hours, signal) {
      try {
        const res = await rpcGetLoadRecords(uuid, hours, signal);
        const records = (res.records ?? []).map(mapStatusRecordToLoad);
        return {
          count: res.count ?? records.length,
          records,
          has_gpu_data:
            res.has_gpu_data ??
            (records.some((record) => record.gpu !== 0) ? true : undefined),
        };
      } catch (e) {
        if (signal?.aborted) throw e;
        return restLoadRecords(uuid, hours, signal);
      }
    },

    async getPingHistory(uuid, hours, signal) {
      try {
        return await rpcLegacyPingHistory(uuid, hours, signal);
      } catch (e) {
        if (signal?.aborted) throw e;
        return restPingRecords(uuid, hours, signal);
      }
    },

    async getRecentPingHistory(hours, signal) {
      try {
        return await rpcLegacyPingHistory(undefined, hours, signal);
      } catch (e) {
        if (signal?.aborted) throw e;
        return restPingRecords(undefined, hours, signal);
      }
    },

    async getMe() {
      return restMe();
    },

    subscribeRealtime(cb, options) {
      const rpc = getRpc();
      let stopped = false;
      let timer: number | null = null;
      const intervalMs = Math.min(
        60_000,
        Math.max(1_000, options?.intervalMs ?? 3_000),
      );
      let failCount = 0;

      const clearTimer = () => {
        if (timer == null) return;
        window.clearTimeout(timer);
        timer = null;
      };

      // Only override transport when env is explicit; else keep bootstrap choice
      const envWs = import.meta.env.VITE_RPC_WS as string | undefined;
      if (envWs === "true") rpc.setTransport(true);
      else if (envWs === "false") rpc.setTransport(false);

       let inFlight = false;
       let requestController: AbortController | null = null;
       const tick = async () => {
         if (stopped || inFlight || document.visibilityState === "hidden") return;
         inFlight = true;
         const controller = new AbortController();
         requestController = controller;
         try {
           const statuses = await rpcGetNodesLatestStatus(controller.signal);
           if (stopped) return;
           cb(mapStatusesToSnapshot(statuses));
          failCount = 0;
         } catch (e) {
           if (stopped || controller.signal.aborted) return;
           failCount += 1;
          if (e instanceof RpcError && e.code === 401) {
            window.location.href = "/admin";
            return;
          }
          if (rpc.isUsingWebSocket() && failCount < 5) {
            return;
          }
          if (rpc.isUsingWebSocket()) {
            rpc.setTransport(false);
          }
          try {
             const statuses = await rpcGetNodesLatestStatus(controller.signal);
             if (stopped) return;
            cb(mapStatusesToSnapshot(statuses));
            failCount = 0;
            return;
          } catch {
            try {
               const fallback = await restRealtimeSnapshot(
                 controller.signal,
                 options?.initialNodes,
               );
               if (stopped) return;
               cb(fallback);
              failCount = 0;
            } catch {
              // Preserve the last good snapshot instead of publishing false offline states.
            }
          }
         } finally {
           if (requestController === controller) requestController = null;
           inFlight = false;
         }
      };

      const schedule = () => {
        if (stopped || document.visibilityState === "hidden") return;
        const delay = failCount > 0 ? 3_000 : intervalMs;
        clearTimer();
        timer = window.setTimeout(() => {
          timer = null;
          void tick().finally(schedule);
        }, delay);
      };

      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          clearTimer();
          rpc.closeWs();
          return;
        }
        failCount = 0;
        void tick().finally(schedule);
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

       if (options?.initialSnapshot) {
         // Bootstrap already fetched the first snapshot. Wait for the normal
         // interval instead of issuing the same request a second time.
         schedule();
       } else {
         void tick().finally(schedule);
       }

      return () => {
           stopped = true;
           clearTimer();
           requestController?.abort();
           document.removeEventListener("visibilitychange", onVisibilityChange);
        rpc.closeWs();
      };
    },
  };
}

export const dataSource: KomariDataSource = createRpcDataSource();
