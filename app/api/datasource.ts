import type {
  KomariDataSource,
  LoadRecordsResponse,
  MeInfo,
  PingHistoryResponse,
  PublicSettings,
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
  mapStatusRecordToLoad,
  mapStatusToMetrics,
  mapStatusesToSnapshot,
} from "~/api/mappers";
import type { LoadRecord, PingHistoryRecord, PingTaskMeta } from "~/types/komari";

function apiRoot(): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";
  return base.replace(/\/$/, "") || "/api";
}

async function restPublic(): Promise<PublicSettings> {
  const res = await fetch(`${apiRoot()}/public`, { credentials: "include" });
  if (!res.ok) throw new Error(`public ${res.status}`);
  const json = (await res.json()) as { status?: string; data: PublicSettings };
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
    const res = await fetch(`${apiRoot()}/me`, { credentials: "include" });
    if (!res.ok) return { logged_in: false };
    return (await res.json()) as MeInfo;
  } catch {
    return { logged_in: false };
  }
}

async function restLoadRecords(
  uuid: string,
  hours: number,
  signal?: AbortSignal,
): Promise<LoadRecordsResponse> {
  const res = await fetch(
    `${apiRoot()}/records/load?uuid=${encodeURIComponent(uuid)}&hours=${hours}`,
    { credentials: "include", signal },
  );
  if (!res.ok) throw new Error(`load records ${res.status}`);
  const json = (await res.json()) as {
    data: {
      count?: number;
      has_gpu_data?: boolean;
      records?: LoadRecord[] | Record<string, LoadRecord[]>;
    };
  };
  const raw = json.data?.records;
  const list = normalizeRecordList(raw, uuid);
  return {
    count: json.data?.count ?? list.length,
    has_gpu_data: json.data?.has_gpu_data,
    records: list.map(mapStatusRecordToLoad),
  };
}

async function restPingRecords(
  uuid: string,
  hours: number,
  signal?: AbortSignal,
): Promise<PingHistoryResponse> {
  const res = await fetch(
    `${apiRoot()}/records/ping?uuid=${encodeURIComponent(uuid)}&hours=${hours}`,
    { credentials: "include", signal },
  );
  if (!res.ok) return { count: 0, records: [], tasks: [] };
  const json = (await res.json()) as {
    data: {
      count?: number;
      records?: PingHistoryRecord[] | Record<string, PingHistoryRecord[]>;
      tasks?: PingTaskMeta[];
    };
  };
  const list = normalizeRecordList(json.data?.records, uuid);
  return {
    count: json.data?.count ?? list.length,
    records: list,
    tasks: json.data?.tasks ?? [],
  };
}

function createRpcDataSource(): KomariDataSource {
  return {
    async getPublic() {
      return restPublic();
    },

    async getNodes() {
      try {
        const map = await rpcGetNodes();
        return mapClientsToNodes(map);
      } catch (e) {
        if (e instanceof RpcError && e.code === 401) {
          window.location.href = "/admin";
        }
        throw e;
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
        return [];
      }
    },

    async getLoadRecords(uuid, hours, signal) {
      try {
        const res = await rpcGetLoadRecords(uuid, hours, signal);
        const records = (res.records ?? []).map(mapStatusRecordToLoad);
        return { count: res.count ?? records.length, records };
      } catch (e) {
        if (signal?.aborted) throw e;
        return restLoadRecords(uuid, hours, signal);
      }
    },

    async getPingHistory(uuid, hours, signal) {
      try {
        const res = await rpcGetPingRecords(uuid, hours, signal);
        return {
          count: res.count ?? res.records?.length ?? 0,
          records: (res.records ?? []).map((r) => ({
            task_id: r.task_id,
            time: r.time,
            value: r.value,
            client: r.client,
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
          })),
        } satisfies PingHistoryResponse;
      } catch (e) {
        if (signal?.aborted) throw e;
        try {
          return await restPingRecords(uuid, hours, signal);
        } catch (err) {
          if (signal?.aborted) throw err;
          return { count: 0, records: [], tasks: [] };
        }
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

      // Only override transport when env is explicit; else keep bootstrap choice
      const envWs = import.meta.env.VITE_RPC_WS as string | undefined;
      if (envWs === "true") rpc.setTransport(true);
      else if (envWs === "false") rpc.setTransport(false);

      let inFlight = false;
      const tick = async () => {
        if (stopped || inFlight) return;
        inFlight = true;
        try {
          const statuses = await rpcGetNodesLatestStatus();
          if (stopped) return;
          cb(mapStatusesToSnapshot(statuses));
          failCount = 0;
        } catch (e) {
          failCount += 1;
          if (e instanceof RpcError && e.code === 401) {
            window.location.href = "/admin";
            return;
          }
          if (failCount >= 2) rpc.setTransport(false);
        } finally {
          inFlight = false;
        }
      };

      void (async () => {
        // Skip extra rpc.ping RTT — first status call is enough health check
        await tick();
        if (stopped) return;
        const loop = () => {
          timer = window.setTimeout(() => {
            void tick().finally(() => {
              if (!stopped) loop();
            });
          }, intervalMs);
        };
        loop();
      })();

      return () => {
        stopped = true;
        if (timer != null) window.clearTimeout(timer);
        rpc.closeWs();
      };
    },
  };
}

export const dataSource: KomariDataSource = createRpcDataSource();
