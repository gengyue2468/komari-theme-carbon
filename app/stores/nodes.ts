import { create } from "zustand";
import { dataSource } from "~/api/datasource";
import { getRpc, rpcPing, RpcError } from "~/api/rpc";
import { asNumber } from "~/lib/format";
import type {
  NodeInfo,
  PublicSettings,
  RealtimeMetrics,
  ViewMode,
} from "~/types/komari";

const VIEW_KEY = "nodeViewMode";

export type DensityMode = "comfortable" | "compact";

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

function resolveDensity(settings: Record<string, unknown>): DensityMode {
  const v = String(settings.density ?? "comfortable").toLowerCase();
  return v === "compact" ? "compact" : "comfortable";
}

function nodesFingerprint(nodes: NodeInfo[]): string {
  return nodes
    .map(
      (n) =>
        `${n.uuid}:${n.weight}:${n.name}:${n.group}:${n.tags}:${n.remark ?? ""}:${n.version ?? ""}:${n.updated_at}`,
    )
    .join("|");
}

interface NodesState {
  publicSettings: PublicSettings | null;
  nodes: NodeInfo[];
  onlineIds: string[];
  realtime: Record<string, RealtimeMetrics>;
  realtimeUpdatedAt: Record<string, string>;
  realtimeReady: boolean;
  loading: boolean;
  error: string | null;
  search: string;
  group: string;
  viewMode: ViewMode;
  showUptime: boolean;
  chartHours: number;
  density: DensityMode;
  pollIntervalMs: number;
  unsubscribe: (() => void) | null;
  bootstrapController: AbortController | null;
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
  realtimeUpdatedAt: {},
  realtimeReady: false,
  loading: true,
  error: null,
  search: "",
  group: "all",
  viewMode: "grid",
  showUptime: true,
  chartHours: 4,
  density: "comfortable",
  pollIntervalMs: 3000,
  unsubscribe: null,
  bootstrapController: null,

  async bootstrap() {
    get().bootstrapController?.abort();
    get().unsubscribe?.();
    const controller = new AbortController();
    set({
      loading: true,
      error: null,
      bootstrapController: controller,
      realtimeReady: false,
      onlineIds: [],
      realtime: {},
      realtimeUpdatedAt: {},
      unsubscribe: null,
    });
    try {
      const previousMode = get().publicSettings?.theme_settings.rpcTransportMode;
      getRpc().setTransport(previousMode === "websocket");

      // Match Emerald's startup contract: verify RPC before loading the page.
      try {
        const response = await rpcPing();
        if (response !== "pong") {
          throw new Error("Unexpected health check response");
        }
      } catch (e) {
        if (
          (e instanceof RpcError && e.code === 401) ||
          (e instanceof Error && /401|unauthorized|private/i.test(e.message))
        ) {
          window.location.href = "/admin";
        }
        throw e;
      }

      // Public settings and login state are non-critical for the node list.
      let publicSettings: PublicSettings | null = null;
      try {
        publicSettings = await dataSource.getPublic(controller.signal);
      } catch (e) {
        if (controller.signal.aborted) throw e;
      }
      try {
        await dataSource.getMe();
      } catch {
        // Login state is not required to render public node data.
      }

      if (
        controller.signal.aborted ||
        get().bootstrapController !== controller
      ) {
        return;
      }

      const settings = (publicSettings?.theme_settings ?? {}) as Record<
        string,
        unknown
      >;

      const mode = settings.rpcTransportMode;
      getRpc().setTransport(mode === "http" ? false : true);

      const pollIntervalMs =
        asNumber(settings.dataUpdateInterval, 3, 1, 60) * 1000;

      const defaultView = resolveDefaultView(settings);
      const viewMode = readViewMode(defaultView);
      const showUptime =
        settings.showUptime !== false && settings.showUptime !== "false";
      const chartHours = asNumber(settings.defaultChartHours, 4, 1, 168);
      const density = resolveDensity(settings);

      const [nodes, snapshot] = await Promise.all([
        dataSource.getNodes(),
        dataSource.getRealtimeSnapshot(),
      ]);

      set({
        publicSettings,
        nodes,
        onlineIds: snapshot.online,
        realtime: snapshot.data,
        realtimeUpdatedAt: snapshot.updatedAt,
        realtimeReady: true,
        viewMode,
        showUptime,
        chartHours,
        density,
        pollIntervalMs,
        loading: false,
      });

      let stopped = false;
      let nodeTimer: number | null = null;
      let nodeRequestController: AbortController | null = null;

      const refreshNodes = () => {
        if (stopped || document.visibilityState === "hidden") return;
        nodeRequestController?.abort();
        const controller = new AbortController();
        nodeRequestController = controller;
        void dataSource
          .getNodes(controller.signal)
          .then((list) => {
            if (stopped || controller.signal.aborted) return;
            const prev = get().nodes;
            if (nodesFingerprint(prev) === nodesFingerprint(list)) return;
            set({ nodes: list });
          })
          .catch(() => {
            // Keep the last known node inventory during transient failures.
          })
          .finally(() => {
            if (nodeRequestController === controller) {
              nodeRequestController = null;
            }
          });
      };

      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") refreshNodes();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

      const baseUnsub = dataSource.subscribeRealtime(
        (snap) => {
          if (stopped) return;
          // Only publish when something actually changed (metrics are cached
          // by reference in the mapper) so quiet ticks don't re-render the
          // whole list every poll interval.
          const prevData = get().realtime;
          const prevUpdatedAt = get().realtimeUpdatedAt;
          const prevOnline = get().onlineIds;
          let metricsChanged = snap.online.length !== prevOnline.length;
          if (!metricsChanged) {
            for (let i = 0; i < prevOnline.length; i++) {
              if (snap.online[i] !== prevOnline[i]) {
                metricsChanged = true;
                break;
              }
            }
          }
          if (!metricsChanged) {
            for (const key of Object.keys(snap.data)) {
              if (snap.data[key] !== prevData[key]) {
                metricsChanged = true;
                break;
              }
            }
          }
          if (!metricsChanged) {
            for (const key of Object.keys(prevData)) {
              if (!(key in snap.data)) {
                metricsChanged = true;
                break;
              }
            }
          }
          let timestampChanged = false;
          if (!timestampChanged) {
            for (const key of Object.keys(snap.updatedAt)) {
              if (snap.updatedAt[key] !== prevUpdatedAt[key]) {
                timestampChanged = true;
                break;
              }
            }
          }
          if (metricsChanged || timestampChanged || !get().realtimeReady) {
            set({
              ...(metricsChanged
                ? { onlineIds: snap.online, realtime: snap.data }
                : {}),
              ...(metricsChanged || timestampChanged
                ? { realtimeUpdatedAt: snap.updatedAt }
                : {}),
              realtimeReady: true,
            });
          }
        },
        { intervalMs: pollIntervalMs },
      );

      nodeTimer = window.setInterval(() => {
        refreshNodes();
      }, pollIntervalMs);

      set({
        unsubscribe: () => {
          stopped = true;
          if (nodeTimer != null) window.clearInterval(nodeTimer);
          nodeRequestController?.abort();
          document.removeEventListener("visibilitychange", onVisibilityChange);
          baseUnsub();
        },
      });
    } catch (e) {
      if (controller.signal.aborted || get().bootstrapController !== controller) {
        return;
      }
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
    get().bootstrapController?.abort();
    get().unsubscribe?.();
    set({ unsubscribe: null, bootstrapController: null });
  },
}));
