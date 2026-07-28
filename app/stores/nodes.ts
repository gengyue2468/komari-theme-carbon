import { create } from "zustand";
import { dataSource } from "~/api/datasource";
import { getRpc } from "~/api/rpc";
import type {
  NodeInfo,
  PublicSettings,
  RealtimeMetrics,
  ViewMode,
} from "~/types/komari";

const VIEW_KEY = "nodeViewMode";

function readViewMode(fallback: ViewMode): ViewMode {
  if (typeof window === "undefined") return fallback;
  const v = localStorage.getItem(VIEW_KEY);
  if (v === "grid" || v === "table") return v;
  return fallback;
}

function resolveDefaultView(settings: Record<string, unknown>): ViewMode {
  const v =
    (settings.defaultView as string | undefined) ||
    (settings.defaultViewMode as string | undefined);
  if (v === "table" || v === "list") return "table";
  if (v === "grid" || v === "card") return "grid";
  return "grid";
}

function nodesFingerprint(nodes: NodeInfo[]): string {
  return nodes
    .map(
      (n) =>
        `${n.uuid}:${n.weight}:${n.name}:${n.group}:${n.tags}:${n.updated_at}`,
    )
    .join("|");
}

interface NodesState {
  publicSettings: PublicSettings | null;
  nodes: NodeInfo[];
  onlineIds: string[];
  realtime: Record<string, RealtimeMetrics>;
  loading: boolean;
  error: string | null;
  search: string;
  group: string;
  viewMode: ViewMode;
  showUptime: boolean;
  chartHours: number;
  pollIntervalMs: number;
  unsubscribe: (() => void) | null;
  bootstrap: () => Promise<void>;
  setSearch: (q: string) => void;
  setGroup: (g: string) => void;
  setViewMode: (m: ViewMode) => void;
  teardown: () => void;
}

export const useNodesStore = create<NodesState>((set, get) => ({
  publicSettings: null,
  nodes: [],
  onlineIds: [],
  realtime: {},
  loading: true,
  error: null,
  search: "",
  group: "all",
  viewMode: "grid",
  showUptime: true,
  chartHours: 4,
  pollIntervalMs: 3000,
  unsubscribe: null,

  async bootstrap() {
    set({ loading: true, error: null });
    try {
      // Parallel: public settings + node list (one less RTT than sequential)
      const [publicSettings, nodes] = await Promise.all([
        dataSource.getPublic(),
        dataSource.getNodes(),
      ]);

      const settings = (publicSettings.theme_settings ?? {}) as Record<
        string,
        unknown
      >;

      const mode = settings.rpcTransportMode;
      if (mode === "http" || import.meta.env.DEV) getRpc().setTransport(false);
      else if (mode === "websocket") getRpc().setTransport(true);

      const intervalRaw = settings.dataUpdateInterval;
      const pollIntervalMs =
        typeof intervalRaw === "number"
          ? Math.min(60, Math.max(1, intervalRaw)) * 1000
          : 3000;

      const defaultView = resolveDefaultView(settings);
      const viewMode = readViewMode(defaultView);
      const showUptime = settings.showUptime !== false;
      const chartHours =
        typeof settings.defaultChartHours === "number"
          ? settings.defaultChartHours
          : 4;

      get().unsubscribe?.();

      // Paint list ASAP; realtime fills in right after
      set({
        publicSettings,
        nodes,
        viewMode,
        showUptime,
        chartHours,
        pollIntervalMs,
        loading: false,
      });

      let stopped = false;
      let nodeTimer: number | null = null;
      const baseUnsub = dataSource.subscribeRealtime(
        (snap) => {
          if (stopped) return;
          set({ onlineIds: snap.online, realtime: snap.data });
        },
        { intervalMs: pollIntervalMs },
      );

      nodeTimer = window.setInterval(() => {
        void dataSource.getNodes().then((list) => {
          if (stopped) return;
          const prev = get().nodes;
          if (nodesFingerprint(prev) === nodesFingerprint(list)) return;
          set({ nodes: list });
        });
      }, Math.max(pollIntervalMs * 20, 60_000));

      set({
        unsubscribe: () => {
          stopped = true;
          if (nodeTimer != null) window.clearInterval(nodeTimer);
          baseUnsub();
        },
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load data",
      });
    }
  },

  setSearch(search) {
    set({ search });
  },

  setGroup(group) {
    set({ group });
  },

  setViewMode(viewMode) {
    localStorage.setItem(VIEW_KEY, viewMode);
    set({ viewMode });
  },

  teardown() {
    get().unsubscribe?.();
    set({ unsubscribe: null });
  },
}));
