export type Appearance = "light" | "dark" | "system";
export type ViewMode = "grid" | "table";

export interface PublicSettings {
  sitename: string;
  description: string;
  theme: string;
  theme_settings: ThemeSettings;
  private_site: boolean;
  record_enabled: boolean;
  record_preserve_time: number;
  ping_record_preserve_time: number;
}

export interface ThemeSettings {
  defaultView?: ViewMode;
  defaultViewMode?: string;
  showUptime?: boolean;
  defaultChartHours?: number;
  density?: "comfortable" | "compact";
  dataUpdateInterval?: number;
  rpcTransportMode?: "websocket" | "http";
  [key: string]: unknown;
}

export interface NodeInfo {
  uuid: string;
  name: string;
  cpu_name: string;
  virtualization: string;
  arch: string;
  cpu_cores: number;
  cpu_physical_cores: number;
  os: string;
  kernel_version: string;
  gpu_name: string;
  region: string;
  mem_total: number;
  swap_total: number;
  disk_total: number;
  weight: number;
  price: number;
  billing_cycle: number;
  auto_renewal: boolean;
  currency: string;
  expired_at: string | null;
  group: string;
  tags: string;
  public_remark?: string;
  hidden: boolean;
  traffic_limit: number;
  traffic_limit_type: string;
  created_at: string;
  updated_at: string;
  ipv4?: string;
  ipv6?: string;
}

/** Live ping task summary from getNodesLatestStatus.ping */
export interface NodePingLive {
  name: string;
  latest: number;
  avg: number;
  loss: number;
  min: number;
  max: number;
}

export interface RealtimeMetrics {
  cpu: { usage: number };
  gpu?: {
    count: number;
    average_usage: number;
    detailed_info: Array<{
      name: string;
      memory_total: number;
      memory_used: number;
      utilization: number;
      temperature: number;
    }>;
  };
  temp?: number;
  ram: { total: number; used: number };
  swap: { total: number; used: number };
  load: { load1: number; load5: number; load15: number };
  disk: { total: number; used: number };
  network: {
    up: number;
    down: number;
    totalUp: number;
    totalDown: number;
  };
  connections: { tcp: number; udp: number };
  uptime: number;
  process: number;
  message: string;
  updated_at: string;
  ping?: Record<string, NodePingLive>;
}

export interface RealtimeSnapshot {
  online: string[];
  data: Record<string, RealtimeMetrics>;
}

export interface LoadRecord {
  client: string;
  time: string;
  cpu: number;
  gpu: number;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  load: number;
  temp: number;
  disk: number;
  disk_total: number;
  net_in: number;
  net_out: number;
  net_total_up: number;
  net_total_down: number;
  traffic_up: number;
  traffic_down: number;
  process: number;
  connections: number;
  connections_udp: number;
}

export interface LoadRecordsResponse {
  count: number;
  records: LoadRecord[];
  has_gpu_data?: boolean;
}

export interface PingHistoryRecord {
  task_id: number;
  time: string;
  value: number;
  client?: string;
}

export interface PingTaskMeta {
  id: number;
  name: string;
  loss?: number;
  min?: number;
  max?: number;
  avg?: number;
  latest?: number;
  total?: number;
  type?: string;
  interval?: number;
}

export interface PingHistoryResponse {
  count: number;
  records: PingHistoryRecord[];
  tasks: PingTaskMeta[];
}

export interface MeInfo {
  logged_in: boolean;
  username?: string;
  uuid?: string;
}

export interface KomariDataSource {
  getPublic(): Promise<PublicSettings>;
  getNodes(): Promise<NodeInfo[]>;
  getRecent(uuid: string): Promise<RealtimeMetrics[]>;
  getLoadRecords(
    uuid: string,
    hours: number,
    signal?: AbortSignal,
  ): Promise<LoadRecordsResponse>;
  getPingHistory(
    uuid: string,
    hours: number,
    signal?: AbortSignal,
  ): Promise<PingHistoryResponse>;
  getMe(): Promise<MeInfo>;
  subscribeRealtime(
    cb: (snap: RealtimeSnapshot) => void,
    options?: { intervalMs?: number },
  ): () => void;
}
