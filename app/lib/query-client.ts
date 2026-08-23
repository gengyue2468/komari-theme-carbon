import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

export const queryKeys = {
  loadRecords: (uuid: string, hours: number, mode: "live" | "history" = "history") =>
    ["load-records", uuid, mode, hours] as const,
  pingHistory: (uuid: string, hours: number) =>
    ["ping-history", uuid, hours] as const,
  recentPingHistory: (hours: number) => ["recent-ping-history", hours] as const,
  public: () => ["public"] as const,
  nodes: () => ["nodes"] as const,
};
