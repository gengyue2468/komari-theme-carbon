/**
 * Komari JSON-RPC 2.0 client (HTTP + optional WebSocket).
 * @see https://www.komari.wiki/dev/rpc.html
 */

export class RpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

type RpcParams = Record<string, unknown> | unknown[] | undefined;

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  result: T;
  id: number | string;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  error: { code: number; message: string; data?: unknown };
  id: number | string | null;
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

function apiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";
  return raw.replace(/\/$/, "") || "/api";
}

function rpcEndpoint(): string {
  const base = apiBase();
  return base.endsWith("/rpc2") ? base : `${base}/rpc2`;
}

function wsUrl(httpUrl: string): string {
  const u = new URL(httpUrl, window.location.origin);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}

export class RpcClient {
  private id = 1;
  private useWs = false;
  private ws: WebSocket | null = null;
  private pending = new Map<
    number | string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: number;
    }
  >();
  private connecting: Promise<void> | null = null;

  setTransport(websocket: boolean) {
    this.useWs = websocket;
    if (!websocket) this.closeWs();
  }

  async call<T>(
    method: string,
    params?: RpcParams,
    timeoutMs = 15000,
    signal?: AbortSignal,
  ): Promise<T> {
    if (this.useWs && !signal) {
      try {
        await this.ensureWs();
        return await this.callWs<T>(method, params, timeoutMs);
      } catch {
        // fall through to HTTP
      }
    }
    return this.callHttp<T>(method, params, timeoutMs, signal);
  }

  private async callHttp<T>(
    method: string,
    params?: RpcParams,
    timeoutMs = 15000,
    outerSignal?: AbortSignal,
  ): Promise<T> {
    const id = this.id++;
    const body = {
      jsonrpc: "2.0",
      method,
      params: params ?? {},
      id,
    };
    const ctrl = new AbortController();
    const onOuterAbort = () => ctrl.abort();
    if (outerSignal) {
      if (outerSignal.aborted) ctrl.abort();
      else outerSignal.addEventListener("abort", onOuterAbort, { once: true });
    }
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(rpcEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new RpcError(res.status, `HTTP ${res.status}`);
      }
      const json = (await res.json()) as JsonRpcResponse<T>;
      if ("error" in json && json.error) {
        throw new RpcError(json.error.code, json.error.message, json.error.data);
      }
      return (json as JsonRpcSuccess<T>).result;
    } finally {
      window.clearTimeout(timer);
      outerSignal?.removeEventListener("abort", onOuterAbort);
    }
  }

  private ensureWs(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      try {
        const socket = new WebSocket(wsUrl(rpcEndpoint()));
        const failTimer = window.setTimeout(() => {
          socket.close();
          this.connecting = null;
          reject(new RpcError(-32000, "WebSocket connect timeout"));
        }, 8000);

        socket.onopen = () => {
          window.clearTimeout(failTimer);
          this.ws = socket;
          this.connecting = null;
          resolve();
        };
        socket.onerror = () => {
          window.clearTimeout(failTimer);
          this.connecting = null;
          reject(new RpcError(-32000, "WebSocket error"));
        };
        socket.onclose = () => {
          window.clearTimeout(failTimer);
          this.ws = null;
          for (const [, p] of this.pending) {
            window.clearTimeout(p.timer);
            p.reject(new RpcError(-32000, "WebSocket closed"));
          }
          this.pending.clear();
        };
        socket.onmessage = (ev) => {
          try {
            const json = JSON.parse(String(ev.data)) as JsonRpcResponse<unknown>;
            const id = json.id;
            if (id == null) return;
            const p = this.pending.get(id);
            if (!p) return;
            this.pending.delete(id);
            window.clearTimeout(p.timer);
            if ("error" in json && json.error) {
              p.reject(
                new RpcError(json.error.code, json.error.message, json.error.data),
              );
            } else {
              p.resolve((json as JsonRpcSuccess<unknown>).result);
            }
          } catch {
            // ignore
          }
        };
      } catch (e) {
        this.connecting = null;
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

    return this.connecting;
  }

  private callWs<T>(
    method: string,
    params?: RpcParams,
    timeoutMs = 15000,
  ): Promise<T> {
    const id = this.id++;
    const req = {
      jsonrpc: "2.0",
      method,
      params: params ?? {},
      id,
    };
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new RpcError(-32000, "WebSocket not open"));
        return;
      }
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(-32000, "RPC timeout"));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      try {
        this.ws.send(JSON.stringify(req));
      } catch (e) {
        window.clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  closeWs() {
    this.ws?.close();
    this.ws = null;
  }
}

let shared: RpcClient | null = null;

export function getRpc(): RpcClient {
  if (!shared) shared = new RpcClient();
  return shared;
}

/* ── RPC payload types ── */

export interface RpcClientInfo {
  uuid: string;
  name: string;
  cpu_name: string;
  virtualization: string;
  arch: string;
  cpu_cores: number;
  cpu_physical_cores?: number;
  os: string;
  kernel_version: string;
  gpu_name?: string;
  ipv4?: string;
  ipv6?: string;
  region: string;
  remark?: string;
  public_remark?: string;
  mem_total: number;
  swap_total: number;
  disk_total: number;
  version?: string;
  weight: number;
  price: number;
  billing_cycle: number;
  auto_renewal: boolean;
  currency: string;
  expired_at: string | null;
  group: string;
  tags: string;
  hidden: boolean;
  traffic_limit: number;
  traffic_limit_type: string;
  created_at: string;
  updated_at: string;
}

export interface RpcNodeStatusPing {
  name: string;
  latest: number;
  avg: number;
  tail: number;
  loss: number;
  min: number;
  max: number;
}

export interface RpcGpuDeviceInfo {
  name?: string;
  memory_total?: number;
  memory_used?: number;
  utilization?: number;
  temperature?: number;
}

export interface RpcGpuDetail {
  count?: number;
  average_usage?: number;
  detailed_info?: RpcGpuDeviceInfo[];
}

export interface RpcNodeStatus {
  client: string;
  time: string;
  cpu: number;
  gpu: number;
  /** Nested GPU report when available (WS / richer payloads). */
  gpu_detail?: RpcGpuDetail;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  load: number;
  load5?: number;
  load15?: number;
  temp: number;
  disk: number;
  disk_total: number;
  net_in: number;
  net_out: number;
  net_total_up: number;
  net_total_down: number;
  process: number;
  connections: number;
  connections_udp: number;
  online: boolean;
  uptime: number;
  message?: string;
  ping?: Record<string, RpcNodeStatusPing>;
}

export interface RpcStatusRecord {
  client: string;
  time: string;
  cpu: number;
  gpu: number;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  load: number;
  load5?: number;
  load15?: number;
  temp: number;
  disk: number;
  disk_total: number;
  net_in: number;
  net_out: number;
  net_total_up: number;
  net_total_down: number;
  traffic_up?: number;
  traffic_down?: number;
  process: number;
  connections: number;
  connections_udp: number;
}

export interface RpcPingRecord {
  client?: string;
  task_id: number;
  time: string;
  value: number;
}

export interface RpcPingTaskInfo {
  id: number;
  name: string;
  interval?: number;
  loss?: number;
  min?: number;
  max?: number;
  avg?: number;
  latest?: number;
  total?: number;
  type?: string;
}

export async function rpcPing(): Promise<string> {
  return getRpc().call<string>("rpc.ping");
}

export async function rpcGetNodes(): Promise<Record<string, RpcClientInfo>> {
  const result = await getRpc().call<
    Record<string, RpcClientInfo> | RpcClientInfo
  >("common:getNodes", {});
  if (result && typeof result === "object" && "uuid" in result) {
    const c = result as RpcClientInfo;
    return { [c.uuid]: c };
  }
  return (result as Record<string, RpcClientInfo>) ?? {};
}

export async function rpcGetNodesLatestStatus(): Promise<
  Record<string, RpcNodeStatus>
> {
  return (
    (await getRpc().call<Record<string, RpcNodeStatus>>(
      "common:getNodesLatestStatus",
      {},
    )) ?? {}
  );
}

export async function rpcGetNodeRecentStatus(
  uuid: string,
): Promise<{ count: number; records: RpcStatusRecord[] }> {
  const res = await getRpc().call<{
    count?: number;
    records?: RpcStatusRecord[];
  }>("common:getNodeRecentStatus", { uuid });
  return { count: res.count ?? 0, records: res.records ?? [] };
}

/**
 * Komari getRecords:
 * - load: often `{ [uuid]: StatusRecord[] }` (map)
 * - ping: often `PingRecord[]` (array)
 * Always normalize to a flat array.
 */
export function normalizeRecordList<T>(
  records: T[] | Record<string, T[]> | undefined,
  uuid?: string,
): T[] {
  if (!records) return [];
  if (Array.isArray(records)) return records;
  if (uuid && Array.isArray(records[uuid])) return records[uuid];
  return Object.values(records).flat();
}

export async function rpcGetLoadRecords(
  uuid: string,
  hours: number,
  signal?: AbortSignal,
): Promise<{ count: number; records: RpcStatusRecord[] }> {
  const res = await getRpc().call<{
    count?: number;
    records?: RpcStatusRecord[] | Record<string, RpcStatusRecord[]>;
  }>(
    "common:getRecords",
    {
      type: "load",
      uuid,
      hours,
      maxCount: 2000,
    },
    15000,
    signal,
  );
  const records = normalizeRecordList(res.records, uuid);
  return { count: res.count ?? records.length, records };
}

export async function rpcGetPingRecords(
  uuid: string,
  hours: number,
  signal?: AbortSignal,
): Promise<{
  count: number;
  records: RpcPingRecord[];
  tasks?: RpcPingTaskInfo[];
  basic_info?: Array<{ client: string; loss: number; min: number; max: number }>;
}> {
  const res = await getRpc().call<{
    count?: number;
    records?: RpcPingRecord[] | Record<string, RpcPingRecord[]>;
    tasks?: RpcPingTaskInfo[];
    basic_info?: Array<{
      client: string;
      loss: number;
      min: number;
      max: number;
    }>;
  }>(
    "common:getRecords",
    {
      type: "ping",
      uuid,
      hours,
      maxCount: 4000,
    },
    15000,
    signal,
  );
  const records = normalizeRecordList(res.records, uuid);
  return {
    count: res.count ?? records.length,
    records,
    tasks: res.tasks,
    basic_info: res.basic_info,
  };
}
