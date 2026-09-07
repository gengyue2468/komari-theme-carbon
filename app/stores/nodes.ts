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
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === "grid" || v === "table") return v;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
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
  visitorInfoCardEnabled: boolean;
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
  viewMode: readViewMode("grid"),
  showUptime: true,
  visitorInfoCardEnabled: true,
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

       // These requests are independent. Keep login state and the health check
       // off the critical path while public settings establish the transport.
       const publicPromise = dataSource.getPublic(controller.signal).catch((e) => {
         if (controller.signal.aborted) throw e;
         return null;
       });
       const mePromise = dataSource.getMe().catch(() => null);
       const pingPromise = rpcPing(controller.signal)
         .then((response) => {
           if (response !== "pong") throw new Error("Unexpected health check response");
           return null;
         })
         .catch((e) => e);
       const publicSettings = await publicPromise;

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
       const visitorInfoCardEnabled =
         settings.visitorInfoCardEnabled !== false &&
         settings.visitorInfoCardEnabled !== "false";
       const chartHours = asNumber(settings.defaultChartHours, 4, 1, 168);
      const density = resolveDensity(settings);

       const [nodes, snapshot] = await Promise.all([
         dataSource.getNodes(controller.signal),
         dataSource.getRealtimeSnapshot(controller.signal),
       ]);

       const pingError = await pingPromise;
       if (pingError) {
         if (
           (pingError instanceof RpcError && pingError.code === 401) ||
           (pingError instanceof Error && /401|unauthorized|private/i.test(pingError.message))
         ) {
           window.location.href = "/admin";
         }
         throw pingError;
       }
       void mePromise;

      set({
        publicSettings,
        nodes,
        onlineIds: snapshot.online,
        realtime: snapshot.data,
        realtimeUpdatedAt: snapshot.updatedAt,
        realtimeReady: true,
         viewMode,
         showUptime,
         visitorInfoCardEnabled,
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
           const prevData = get().realtime;
           const prevUpdatedAt = get().realtimeUpdatedAt;
           const prevOnline = get().onlineIds;
           const nextOnline = new Set(snap.online);
           const onlineChanged =
             snap.online.length !== prevOnline.length ||
             prevOnline.some((id) => !nextOnline.has(id));
           const dataKeys = Object.keys(snap.data);
           const metricsChanged =
             dataKeys.length !== Object.keys(prevData).length ||
             dataKeys.some((key) => snap.data[key] !== prevData[key]);
           const updatedKeys = Object.keys(snap.updatedAt);
           const timestampChanged =
             updatedKeys.length !== Object.keys(prevUpdatedAt).length ||
             updatedKeys.some((key) => snap.updatedAt[key] !== prevUpdatedAt[key]);

           if (onlineChanged || metricsChanged || timestampChanged || !get().realtimeReady) {
             set({
               ...(onlineChanged || !get().realtimeReady
                 ? { onlineIds: snap.online }
                 : {}),
               ...(metricsChanged || !get().realtimeReady
                 ? { realtime: snap.data }
                 : {}),
               ...(metricsChanged || timestampChanged || !get().realtimeReady
                 ? { realtimeUpdatedAt: snap.updatedAt }
                 : {}),
               realtimeReady: true,
             });
           }
         },
         { intervalMs: pollIntervalMs, initialNodes: nodes, initialSnapshot: snapshot },
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
