import {
  IconButton,
  InlineNotification,
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
  Download,
  Grid,
  IbmCloudBareMetalServer,
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
  disk: IbmCloudBareMetalServer,
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
  scrollY: number;
}

function readHomeUi(): HomeUiState | null {
  try {
    const raw = sessionStorage.getItem(HOME_UI_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HomeUiState;
  } catch {
    return null;
  }
}

function writeHomeUi(state: HomeUiState) {
  try {
    sessionStorage.setItem(HOME_UI_KEY, JSON.stringify(state));
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

  const saved = useMemo(() => {
    if (typeof window === "undefined") return null;
    // POP = back/forward; restore UI. PUSH/REPLACE = fresh entry.
    return navType === "POP" ? readHomeUi() : null;
  }, [navType]);

  const [group, setGroup] = useState(saved?.group ?? "all");
  const [searchOpen, setSearchOpen] = useState(saved?.searchOpen ?? false);
  const [search, setSearch] = useState(saved?.search ?? "");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const restoredScroll = useRef(false);

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

  // Persist filters + throttled scroll
  useEffect(() => {
    writeHomeUi({
      group,
      search,
      searchOpen,
      scrollY: window.scrollY,
    });
  }, [group, search, searchOpen]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        const prev = readHomeUi();
        writeHomeUi({
          group: prev?.group ?? group,
          search: prev?.search ?? search,
          searchOpen: prev?.searchOpen ?? searchOpen,
          scrollY: window.scrollY,
        });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      onScroll();
      window.removeEventListener("scroll", onScroll);
    };
  }, [group, search, searchOpen]);

  // Restore scroll after back navigation once nodes are ready
  useEffect(() => {
    if (restoredScroll.current) return;
    if (navType !== "POP") return;
    const y = saved?.scrollY ?? readHomeUi()?.scrollY ?? 0;
    if (y <= 0 || nodes.length === 0) return;
    restoredScroll.current = true;
    const id = window.requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [navType, nodes.length, saved?.scrollY]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearch("");
  };

  if (error) {
    return (
      <InlineNotification
        className="page-banner"
        kind="error"
        title={t("app.error")}
        subtitle={error}
        lowContrast
        hideCloseButton
      />
    );
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header__left">
          <div className="home-stat-grid">
            {homeStats.map((stat) =>
              stat.id === "remaining" ? (
                <FinancePopover
                  key={stat.id}
                  nodes={nodes}
                  label={t(stat.labelKey)}
                />
              ) : (
                <HomeStatCard
                  key={stat.id}
                  label={t(stat.labelKey)}
                  value={stat.value}
                  unit={stat.unit}
                  suffix={stat.suffix}
                  icon={ICONS[stat.icon]}
                />
              ),
            )}
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
              scrollIntoView
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
                closeButtonLabelText={t("app.search")}
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
