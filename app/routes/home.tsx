import {
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
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigationType } from "react-router";
import { FinancePopover } from "~/components/FinancePopover";
import { HomeStatCard } from "~/components/HomeStatCard";
import { NodeCard } from "~/components/NodeCard";
import { NodeTable } from "~/components/NodeTable";
import { StatPopover } from "~/components/StatPopover";
import { computeHomeStats } from "~/lib/home-stats";
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
  const error = useNodesStore((s) => s.error);
  const showUptime = useNodesStore((s) => s.showUptime);
  const viewMode = useNodesStore((s) => s.viewMode);
  const setViewMode = useNodesStore((s) => s.setViewMode);

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

  const groupTabs = useMemo(() => {
    const names = [...new Set(nodes.map((n) => n.group).filter(Boolean))].sort();
    return [
      { id: "all", label: t("app.allGroups") },
      ...names.map((name) => ({ id: name, label: name })),
    ];
  }, [nodes, t]);

  const selectedIndex = Math.max(
    0,
    groupTabs.findIndex((tab) => tab.id === group),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nodes.filter((n) => {
      if (group !== "all" && n.group !== group) return false;
      if (!q) return true;
      return (
        n.name.toLowerCase().includes(q) ||
        n.os.toLowerCase().includes(q) ||
        n.tags.toLowerCase().includes(q) ||
        n.group.toLowerCase().includes(q) ||
        n.region.toLowerCase().includes(q)
      );
    });
  }, [nodes, group, search]);

  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);

  const homeStats = useMemo(
    () => computeHomeStats(nodes, realtime, onlineIds),
    [nodes, realtime, onlineIds],
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
                  nodes={nodes}
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
                  nodes={nodes}
                  realtime={realtime}
                  onlineIds={onlineIds}
                />
              );
            })}
          </div>
        </div>
        <div className="home-header__right">
          <Suspense
            fallback={<div className="node-map node-map--placeholder" />}
          >
            <NodeWorldMap nodes={nodes} onlineIds={onlineIds} />
          </Suspense>
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
        <p className="empty">{t("app.empty")}</p>
      ) : viewMode === "grid" ? (
        <div className="node-grid">
          {filtered.map((node) => (
            <NodeCard
              key={node.uuid}
              node={node}
              online={onlineSet.has(node.uuid)}
              metrics={realtime[node.uuid]}
              showUptime={showUptime}
            />
          ))}
        </div>
      ) : (
        <NodeTable
          nodes={filtered}
          onlineIds={onlineIds}
          realtime={realtime}
        />
      )}
    </div>
  );
}
