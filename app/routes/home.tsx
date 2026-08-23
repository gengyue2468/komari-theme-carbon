import {
  Button,
  IconButton,
  Search,
  Tab,
  TabList,
  Tabs,
} from "@carbon/react";
import {
  ArrowDown,
  ArrowUp,
  Close,
  Currency,
  DataBase,
  DataVolume,
  Download,
  Grid,
  List,
  Search as SearchIcon,
} from "@carbon/icons-react";
import type { CarbonIconType } from "@carbon/icons-react";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigationType } from "react-router";
import { FinancePopover } from "~/components/FinancePopover";
import { HomeStatCard } from "~/components/HomeStatCard";
import { NodeCard } from "~/components/NodeCard";
import { NodeTable } from "~/components/NodeTable";
import { StatPopover } from "~/components/StatPopover";
import { dataSource } from "~/api/datasource";
import { isNodeInGroup, parseNodeGroups } from "~/lib/groups";
import { computeHomeStats } from "~/lib/home-stats";
import { queryKeys } from "~/lib/query-client";
import { useNodesStore } from "~/stores/nodes";
import type { Route } from "./+types/home";

const NodeWorldMap = lazy(async () => {
  const m = await import("~/components/NodeWorldMap");
  return { default: m.NodeWorldMap };
});

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Komari Monitor" },
    { name: "description", content: "A simple server monitor tool." },
  ];
}

const ICONS: Record<
  "memory" | "disk" | "finance" | "traffic" | "up" | "down",
  CarbonIconType
> = {
  memory: DataBase,
  disk: DataVolume,
  finance: Currency,
  traffic: Download,
  up: ArrowUp,
  down: ArrowDown,
};

const HOME_UI_KEY = "komari-carbon-home-ui";

interface HomeUiState {
  group: string;
  search: string;
  searchOpen: boolean;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export default function Home() {
  const { t } = useTranslation();
  const navType = useNavigationType();
  const nodes = useNodesStore((s) => s.nodes);
  const onlineIds = useNodesStore((s) => s.onlineIds);
  const realtime = useNodesStore((s) => s.realtime);
  const realtimeUpdatedAt = useNodesStore((s) => s.realtimeUpdatedAt);
  const realtimeReady = useNodesStore((s) => s.realtimeReady);
  const error = useNodesStore((s) => s.error);
  const showUptime = useNodesStore((s) => s.showUptime);
  const viewMode = useNodesStore((s) => s.viewMode);
  const setViewMode = useNodesStore((s) => s.setViewMode);
  const recentPingQuery = useQuery({
    queryKey: queryKeys.recentPingHistory(1),
    queryFn: ({ signal }) => dataSource.getRecentPingHistory(1, signal),
    enabled: nodes.length > 0,
    staleTime: 60_000,
    gcTime: 60_000,
    refetchInterval: 60_000,
  });

  // POP = back/forward: restore the UI snapshot. Reload = fresh entry (don't
  // resurrect stale filters/scroll from an earlier visit in this tab).
  const canRestore = useMemo(() => {
    if (navType !== "POP") return false;
    if (typeof window === "undefined") return true;
    const nav = performance.getEntriesByType?.("navigation")?.[0] as
      | { navigationType?: string }
      | undefined;
    return nav?.navigationType !== "reload";
  }, [navType]);

  const saved = useMemo(() => {
    if (typeof window === "undefined") return null;
    return canRestore ? readJson<HomeUiState>(HOME_UI_KEY) : null;
  }, [canRestore]);

  const [group, setGroup] = useState(saved?.group ?? "all");
  const [searchOpen, setSearchOpen] = useState(saved?.searchOpen ?? false);
  const [search, setSearch] = useState(saved?.search ?? "");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapHostRef = useRef<HTMLDivElement>(null);
  const [mapVisible, setMapVisible] = useState(false);

  useEffect(() => {
    const host = mapHostRef.current;
    if (!host) return;
    if (!("IntersectionObserver" in window)) {
      setMapVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setMapVisible(true);
        observer.disconnect();
      },
      { rootMargin: "160px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const groupTabs = useMemo(() => {
    const names = [
      ...new Set(nodes.flatMap((node) => parseNodeGroups(node.group))),
    ].sort();
    return [
      { id: "all", label: t("app.allGroups") },
      ...names.map((name) => ({ id: name, label: name })),
    ];
  }, [nodes, t]);

  const selectedIndex = Math.max(
    0,
    groupTabs.findIndex((tab) => tab.id === group),
  );

  const groupNodes = useMemo(
    () => nodes.filter((node) => isNodeInGroup(node.group, group)),
    [nodes, group],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupNodes.filter((n) => {
      if (!q) return true;
      return (
        n.name.toLowerCase().includes(q) ||
        n.os.toLowerCase().includes(q) ||
        n.tags.toLowerCase().includes(q) ||
        parseNodeGroups(n.group).some((name) =>
          name.toLowerCase().includes(q),
        ) ||
        n.region.toLowerCase().includes(q) ||
        n.remark?.toLowerCase().includes(q)
      );
    });
  }, [groupNodes, search]);

  const hasFilters = group !== "all" || search.trim().length > 0;

  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);

  const homeStats = useMemo(
    () => computeHomeStats(groupNodes, realtime, onlineIds, realtimeReady),
    [groupNodes, realtime, onlineIds, realtimeReady],
  );

  useEffect(() => {
    if (group !== "all" && !groupTabs.some((tab) => tab.id === group)) {
      setGroup("all");
    }
  }, [group, groupTabs]);

  useEffect(() => {
    if (!searchOpen) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [searchOpen]);

  // Persist filters (no scroll — kept separate so filter changes never clobber
  // the saved back-nav scroll position).
  useEffect(() => {
    writeJson(HOME_UI_KEY, { group, search, searchOpen });
  }, [group, search, searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearch("");
  };

  const clearFilters = () => {
    setGroup("all");
    closeSearch();
  };

  if (error) {
    throw new Error(error);
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header__left">
          <div className="home-stat-grid">
            {homeStats.map((stat) => {
              const Icon = ICONS[stat.icon];
              return stat.id === "remaining" ? (
                <FinancePopover
                  key={stat.id}
                  nodes={groupNodes}
                  label={t(stat.labelKey)}
                />
              ) : (
                <StatPopover
                  key={stat.id}
                  stat={stat}
                  label={t(stat.labelKey)}
                  value={stat.value}
                  unit={stat.unit}
                  suffix={stat.suffix}
                  icon={<Icon size={16} className="home-stat-card__icon" />}
                  nodes={groupNodes}
                  realtime={realtime}
                  onlineIds={onlineIds}
                  realtimeReady={realtimeReady}
                />
              );
            })}
          </div>
        </div>
        <div className="home-header__right">
          <div ref={mapHostRef} className="node-map-lazy-host">
            {mapVisible ? (
              <Suspense
                fallback={<div className="node-map node-map--placeholder" />}
              >
                <NodeWorldMap
                  nodes={groupNodes}
                  onlineIds={onlineIds}
                  realtimeReady={realtimeReady}
                />
              </Suspense>
            ) : (
              <div
                className="node-map node-map--placeholder"
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </header>

      <div className="home-toolbar row-between">
        <div className="home-toolbar__groups">
          <Tabs
            selectedIndex={selectedIndex}
            onChange={({ selectedIndex: index }) => {
              setGroup(groupTabs[index]?.id ?? "all");
            }}
          >
            <TabList
              aria-label={t("detail.group")}
              contained
              className="home-group-tabs"
            >
              {groupTabs.map((tab) => (
                <Tab key={tab.id}>{tab.label}</Tab>
              ))}
            </TabList>
          </Tabs>
        </div>

        <div
          className={`home-toolbar__tools${searchOpen ? " is-searching" : ""}`}
        >
          {!searchOpen && (
            <>
              <IconButton
                kind={viewMode === "grid" ? "primary" : "ghost"}
                size="md"
                label={t("app.grid")}
                onClick={() => setViewMode("grid")}
              >
                <Grid size={16} />
              </IconButton>
              <IconButton
                kind={viewMode === "table" ? "primary" : "ghost"}
                size="md"
                label={t("app.table")}
                onClick={() => setViewMode("table")}
              >
                <List size={16} />
              </IconButton>
              <IconButton
                kind="ghost"
                size="md"
                label={t("app.search")}
                onClick={() => setSearchOpen(true)}
              >
                <SearchIcon size={16} />
              </IconButton>
            </>
          )}

          {searchOpen && (
            <div className="home-search-expand">
              <Search
                id="home-node-search"
                size="md"
                labelText={t("app.search")}
                placeholder={t("app.search")}
                value={search}
                closeButtonLabelText={t("app.clearSearch")}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch("")}
                ref={searchInputRef}
                className="home-search-field"
              />
              <IconButton
                kind="ghost"
                size="md"
                label={t("app.close")}
                onClick={closeSearch}
              >
                <Close size={16} />
              </IconButton>
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p className="empty">
            {t(hasFilters ? "app.noMatches" : "app.empty")}
          </p>
          {hasFilters ? (
            <Button kind="tertiary" size="sm" onClick={clearFilters}>
              {t("app.clearFilters")}
            </Button>
          ) : null}
        </div>
      ) : viewMode === "grid" ? (
        <div className="node-grid">
          {filtered.map((node) => (
            <NodeCard
              key={node.uuid}
              node={node}
              online={onlineSet.has(node.uuid)}
              realtimeReady={realtimeReady}
              metrics={realtimeReady ? realtime[node.uuid] : undefined}
              pingHistory={recentPingQuery.data}
              lastSeenAt={
                realtimeReady && !onlineSet.has(node.uuid)
                  ? realtimeUpdatedAt[node.uuid] ??
                    realtime[node.uuid]?.updated_at ??
                    node.updated_at
                  : undefined
              }
              showUptime={showUptime}
            />
          ))}
        </div>
      ) : (
        <NodeTable
          nodes={filtered}
          onlineIds={onlineIds}
          realtimeReady={realtimeReady}
          realtime={realtime}
          pingHistory={recentPingQuery.data}
        />
      )}
    </div>
  );
}
