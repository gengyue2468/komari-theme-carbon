import { Button, Tag, Tile } from "@carbon/react";
import {
  Application,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  Chip,
  Code,
  Currency,
  DataBackup,
  DataBase,
  DataVolume,
  Download,
  RecentlyViewed,
  Temperature,
  Time,
  Video,
} from "@carbon/icons-react";
import Marquee from "react-fast-marquee";
import {
  lazy,
  type ComponentType,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { QuickIcon } from "~/components/BrandIcon";
import { PageSpinner } from "~/components/PageSpinner";
import { RegionFlag } from "~/components/RegionFlag";
import {
  formatBillingCycle,
  formatBytes,
  formatRate,
  formatRemainTime,
  formatUptime,
  isNeverExpire,
  parseTags,
  percentOf,
  trafficLimitTypeLabel,
  trafficUsedBytes,
} from "~/lib/format";
import { nodeFinance } from "~/lib/home-stats";
import { getArchIcon, getOsIcon, getVirtIcon } from "~/lib/os-arch";
import { useNodesStore } from "~/stores/nodes";
import type { Route } from "./+types/node";

const LoadChart = lazy(async () => {
  const m = await import("~/components/LoadChart");
  return { default: m.LoadChart };
});
const PingChart = lazy(async () => {
  const m = await import("~/components/PingChart");
  return { default: m.PingChart };
});

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Komari Monitor" },
    { name: "description", content: "A simple server monitor tool." },
  ];
}

// Distinct tag colors by index
const TAG_TYPES = ["blue", "cyan", "purple", "teal", "magenta"] as const;

/**
 * Long node names auto-scroll (marquee) instead of squeezing the status dot /
 * badges. The <Marquee> is always mounted so the DOM stays stable (no
 * remount flicker); `play`/`autoFill` are toggled based on whether the name
 * actually overflows its container.
 */
function ScrollingName({ name }: { name: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const check = () => {
      const text = textRef.current;
      if (!text) return;
      setOverflow(text.scrollWidth > wrap.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [name]);

  // Interop with react-fast-marquee (CJS): Vite dev's optimizeDeps exposes the
  // module.exports object (component on .default); the production bundle
  // interops the component directly. Handle both.
  const MarqueeComp =
    (Marquee as unknown as { default?: ComponentType }).default ?? Marquee;

  return (
    <div ref={wrapRef} className="detail-title__marquee">
      <MarqueeComp
        play={overflow}
        autoFill={overflow}
        gradient={false}
        speed={40}
        pauseOnHover
      >
        <span ref={textRef} className="detail-title__name">
          {name}
        </span>
      </MarqueeComp>
    </div>
  );
}

export default function NodeDetail() {
  const { uuid = "" } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const nodes = useNodesStore((s) => s.nodes);
  const onlineIds = useNodesStore((s) => s.onlineIds);
  const realtime = useNodesStore((s) => s.realtime);
  const loading = useNodesStore((s) => s.loading);
  const recordEnabled =
    useNodesStore((s) => s.publicSettings?.record_enabled) !== false;

  const node = useMemo(() => nodes.find((n) => n.uuid === uuid), [nodes, uuid]);
  const online = onlineIds.includes(uuid);
  const metrics = realtime[uuid];

  if (!node) {
    if (loading) return <PageSpinner />;
    // Unified error handling: root ErrorBoundary renders the banner.
    throw new Error(t("detail.notFound"));
  }

  const tags = parseTags(node.tags);
  const os = getOsIcon(node.os);
  const arch = getArchIcon(node.arch, node.cpu_name);
  const virt = getVirtIcon(node.virtualization);

  const trafficUsed = metrics
    ? trafficUsedBytes(
        metrics.network.totalUp,
        metrics.network.totalDown,
        node.traffic_limit_type,
      )
    : 0;
  const hasLimit = node.traffic_limit > 0;
  const trafficPct = hasLimit ? percentOf(trafficUsed, node.traffic_limit) : 0;

  const priceText =
    node.price < 0
      ? t("detail.free")
      : node.price === 0
        ? "—"
        : `${node.currency}${node.price}`;
  const cycleText = formatBillingCycle(node.billing_cycle);

  const remainTimeText = formatRemainTime(node.expired_at);
  const expireDateText =
    node.expired_at && !isNeverExpire(node.expired_at)
      ? new Date(node.expired_at).toLocaleDateString()
      : undefined;

  const finance = nodeFinance(node);

  // Live metric cards: quick snapshot before finance
  const cpuPct = metrics?.cpu.usage ?? 0;
  const ramUsed = metrics?.ram.used ?? 0;
  const ramTotal = node.mem_total || metrics?.ram.total || 0;
  const ramPct = percentOf(ramUsed, ramTotal);
  const diskUsed = metrics?.disk.used ?? 0;
  const diskTotal = node.disk_total || metrics?.disk.total || 0;
  const diskPct = percentOf(diskUsed, diskTotal);
  const tcpConns = metrics?.connections.tcp ?? 0;
  const udpConns = metrics?.connections.udp ?? 0;
  const conns = tcpConns + udpConns;
  const swapUsed = metrics?.swap.used ?? 0;
  const hasGpu = !!node.gpu_name && node.gpu_name !== "None";
  const gpuPct = metrics?.gpu?.average_usage ?? 0;
  const gpuDetails = metrics?.gpu?.detailed_info ?? [];
  const agentMessage = metrics?.message?.trim() || "";

  const liveCards = [
    {
      key: "cpu",
      label: t("metrics.cpu"),
      value: `${cpuPct.toFixed(0)}%`,
      icon: <Chip size={16} />,
      bar: cpuPct,
      hint: metrics
        ? `${metrics.load.load1.toFixed(2)} · ${metrics.load.load5.toFixed(2)} · ${metrics.load.load15.toFixed(2)}`
        : "",
    },
    {
      key: "ram",
      label: t("metrics.ram"),
      value: formatBytes(ramUsed),
      icon: <DataBase size={16} />,
      bar: ramPct,
      hint: `${ramPct.toFixed(0)}% / ${formatBytes(ramTotal)}`,
    },
    {
      key: "disk",
      label: t("metrics.disk"),
      value: formatBytes(diskUsed),
      icon: <DataVolume size={16} />,
      bar: diskPct,
      hint: `${diskPct.toFixed(0)}% / ${formatBytes(diskTotal)}`,
    },
    {
      key: "conn",
      label: t("metrics.connections"),
      value: String(conns),
      icon: <Application size={16} />,
      bar: 0,
      hint: `TCP ${tcpConns} · UDP ${udpConns}`,
    },
    ...(hasGpu
      ? [
          {
            key: "gpu",
            label: t("metrics.gpu"),
            value: `${gpuPct.toFixed(0)}%`,
            icon: <Video size={16} />,
            bar: gpuPct,
            hint: node.gpu_name,
          },
        ]
      : []),
  ];

  const financeCards = [
    { key: "price", label: t("detail.nodePrice"), value: priceText, unit: cycleText || undefined, Icon: Currency },
    { key: "monthly", label: t("stats.monthlyCost"), value: finance.monthly, Icon: Currency },
    { key: "remain-time", label: t("detail.remainTime"), value: remainTimeText, unit: expireDateText, Icon: Calendar },
    { key: "remain-value", label: t("stats.remaining"), value: finance.remaining, Icon: Currency },
  ];

  const cpuCoresText =
    node.cpu_physical_cores > 0
      ? t("detail.coresDetail", {
          logical: node.cpu_cores,
          physical: node.cpu_physical_cores,
        })
      : `×${node.cpu_cores}`;

  const hardwareItems = [
    {
      label: t("metrics.cpu"),
      value: `${node.cpu_name} (${cpuCoresText})`,
      icon: <Chip size={16} />,
      wide: true,
    },
    {
      label: t("detail.arch"),
      value: node.arch,
      icon: <QuickIcon icon={arch.icon} size={16} title={arch.label} />,
    },
    {
      label: t("detail.virt"),
      value: node.virtualization || "—",
      icon: <QuickIcon icon={virt.icon} size={16} title={virt.label} />,
    },
    {
      label: t("metrics.gpu"),
      value: node.gpu_name && node.gpu_name !== "None" ? node.gpu_name : "—",
      icon: <Video size={16} />,
    },
  ];
  const systemItems = [
    {
      label: t("detail.os"),
      value: node.os,
      icon: <QuickIcon icon={os.icon} size={16} title={os.label} />,
    },
    {
      label: t("detail.kernel"),
      value: node.kernel_version,
      icon: <Code size={16} />,
    },
    {
      label: t("metrics.uptime"),
      value: formatUptime(metrics?.uptime ?? 0),
      icon: <Time size={16} />,
    },
    {
      label: t("detail.lastSeen"),
      value: metrics?.updated_at
        ? new Date(metrics.updated_at).toLocaleString(i18n.language)
        : "—",
      icon: <RecentlyViewed size={16} />,
    },
    ...(metrics?.temp != null && metrics.temp > 0
      ? [
          {
            label: t("metrics.temperature"),
            value: `${metrics.temp.toFixed(0)}°C`,
            icon: <Temperature size={16} />,
          },
        ]
      : []),
  ];
  const storageItems = [
    {
      label: t("metrics.ram"),
      value: ramUsed > 0 ? formatBytes(ramUsed) : formatBytes(node.mem_total),
      sub: ramUsed > 0 ? `/ ${formatBytes(ramTotal)}` : "",
      pct: ramPct,
      icon: <DataBase size={16} />,
    },
    {
      label: t("detail.swap"),
      value: swapUsed > 0 ? formatBytes(swapUsed) : formatBytes(node.swap_total),
      sub: swapUsed > 0 ? `/ ${formatBytes(node.swap_total)}` : "",
      pct: node.swap_total > 0 ? percentOf(swapUsed, node.swap_total) : 0,
      icon: <DataBackup size={16} />,
    },
    {
      label: t("metrics.disk"),
      value: diskUsed > 0 ? formatBytes(diskUsed) : formatBytes(node.disk_total),
      sub: diskUsed > 0 ? `/ ${formatBytes(diskTotal)}` : "",
      pct: diskPct,
      icon: <DataVolume size={16} />,
    },
  ];

  return (
    <div className="detail">
      <div className="detail-top row-between">
        <div className="detail-top__left">
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={ArrowLeft}
            iconDescription={t("detail.back")}
            onClick={() => navigate("/")}
          />
          <RegionFlag region={node.region} className="detail-flag" />
          <h1 className="detail-title">
            <ScrollingName name={node.name} />
          </h1>
          <span
            className={`status-dot${online ? " is-on" : ""}`}
            title={online ? t("app.online") : t("app.offline")}
            aria-label={online ? t("app.online") : t("app.offline")}
          />
          {tags.map((tag, i) => (
            <Tag key={tag} type={TAG_TYPES[i % TAG_TYPES.length]} size="sm">
              {tag}
            </Tag>
          ))}
          {node.auto_renewal ? (
            <Tag type="blue" size="sm">
              {t("detail.autoRenewal")}
            </Tag>
          ) : null}
        </div>
      </div>

      {node.public_remark?.trim() ? (
        <p className="detail-remark">{node.public_remark.trim()}</p>
      ) : null}

      {agentMessage ? (
        <p className="detail-agent-message" role="status">
          {agentMessage}
        </p>
      ) : null}

      <div className={`detail-live-grid${hasGpu ? " is-gpu" : ""}`}>
        {liveCards.map((card) => (
          <Tile key={card.key} className="detail-metric-card">
            <div className="detail-metric-card__top row-between">
              <span className="detail-metric-card__label">{card.label}</span>
              {card.icon}
            </div>
            <div className="detail-metric-card__value-row">
              <span className="detail-metric-card__value mono">{card.value}</span>
            </div>
            {card.bar > 0 && (
              <div className="detail-metric-card__bar-track">
                <div
                  className={`detail-metric-card__bar-fill${card.bar >= 90 ? " is-warn" : ""}${card.bar >= 98 ? " is-error" : ""}`}
                  style={{ width: `${Math.min(100, card.bar)}%` }}
                />
              </div>
            )}
            {card.hint ? (
              <span className="detail-metric-card__hint mono">{card.hint}</span>
            ) : null}
          </Tile>
        ))}
      </div>

      <div className="detail-finance-grid">
        {financeCards.map((card) => (
          <Tile key={card.key} className="detail-metric-card">
            <div className="detail-metric-card__top row-between">
              <span className="detail-metric-card__label">{card.label}</span>
              <card.Icon size={16} className="detail-metric-card__icon" />
            </div>
            <div className="detail-metric-card__value-row">
              <span className="detail-metric-card__value mono">{card.value}</span>
              {card.unit ? (
                <span className="detail-metric-card__unit mono">{card.unit}</span>
              ) : null}
            </div>
          </Tile>
        ))}
      </div>

      <div className="detail-info-grid">
        <Tile className="detail-section">
          <h3 className="detail-section__title">{t("detail.hardware")}</h3>
          <div className="detail-info-cells">
            {hardwareItems.map((item) => (
              <div
                key={item.label}
                className={`detail-info-cell${item.wide ? " is-wide" : ""}`}
              >
                <div className="detail-info-cell__label">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                <div className="detail-info-cell__value" title={item.value}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </Tile>

        <Tile className="detail-section">
          <h3 className="detail-section__title">{t("detail.system")}</h3>
          <div className="detail-info-cells detail-info-cells--2">
            {systemItems.map((item) => (
              <div key={item.label} className="detail-info-cell">
                <div className="detail-info-cell__label">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                <div className="detail-info-cell__value" title={item.value}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </Tile>

        <Tile className="detail-section">
          <h3 className="detail-section__title">{t("detail.storage")}</h3>
          <div className="detail-info-cells detail-info-cells--3">
            {storageItems.map((item) => (
              <div key={item.label} className="detail-info-cell">
                <div className="detail-info-cell__label">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                <div className="detail-info-cell__value mono">
                  {item.value}
                  {item.sub ? (
                    <span className="detail-info-cell__sub"> {item.sub}</span>
                  ) : null}
                </div>
                {item.pct > 0 && (
                  <div className="detail-info-cell__bar-track">
                    <div
                      className={`detail-info-cell__bar-fill${item.pct >= 90 ? " is-warn" : ""}${item.pct >= 98 ? " is-error" : ""}`}
                      style={{ width: `${Math.min(100, item.pct)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Tile>

        <Tile className="detail-section">
          <h3 className="detail-section__title">{t("detail.network")}</h3>
          <div className="detail-network-grid">
            <div
              className={`detail-info-cell detail-info-cell--traffic${
                trafficPct >= 90
                  ? " is-error"
                  : trafficPct >= 75
                    ? " is-warn"
                    : ""
              }`}
            >
              {hasLimit ? (
                <div
                  className="detail-traffic-fill"
                  style={{ width: `${trafficPct}%` }}
                  aria-hidden
                />
              ) : null}
              <div className="detail-info-cell__body">
                <div className="detail-info-cell__label">
                  <Download size={16} />
                  <span>{t("metrics.traffic")}</span>
                  {metrics ? (
                    <span className="detail-traffic-ud mono">
                      {formatBytes(metrics.network.totalUp)} /{" "}
                      {formatBytes(metrics.network.totalDown)}
                    </span>
                  ) : null}
                </div>
                <div className="detail-info-cell__value mono">
                  {hasLimit
                    ? `${formatBytes(trafficUsed)} / ${formatBytes(node.traffic_limit)}`
                    : t("detail.unlimited")}
                  {hasLimit ? (
                    <span className="detail-traffic-pct">
                      {" "}
                      · {trafficPct.toFixed(1)}%
                    </span>
                  ) : null}
                  {hasLimit ? (
                    <span className="detail-traffic-pct">
                      {" "}
                      · {trafficLimitTypeLabel(node.traffic_limit_type)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="detail-info-cell">
              <div className="detail-info-cell__label">
                <ArrowUp size={16} />
                <span>{t("metrics.rate")}</span>
              </div>
              <div className="detail-info-cell__value mono rate-pair">
                <span className="rate-pair__up">
                  <ArrowUp size={12} />
                  {metrics ? formatRate(metrics.network.up) : "—"}
                </span>
                <span className="rate-pair__down">
                  <ArrowDown size={12} />
                  {metrics ? formatRate(metrics.network.down) : "—"}
                </span>
              </div>
            </div>
          </div>
        </Tile>
      </div>

      {gpuDetails.length > 0 ? (
        <div className="detail-gpu-grid">
          {gpuDetails.map((g, i) => {
            const memPct =
              g.memory_total > 0
                ? percentOf(g.memory_used, g.memory_total)
                : 0;
            return (
              <Tile key={`${g.name}-${i}`} className="detail-metric-card">
                <div className="detail-metric-card__top row-between">
                  <span className="detail-metric-card__label">
                    {g.name || `${t("metrics.gpu")} ${i + 1}`}
                  </span>
                  <Video size={16} className="detail-metric-card__icon" />
                </div>
                <div className="detail-metric-card__value-row">
                  <span className="detail-metric-card__value mono">
                    {g.utilization.toFixed(0)}%
                  </span>
                  {g.temperature > 0 ? (
                    <span className="detail-metric-card__unit mono">
                      {g.temperature}°C
                    </span>
                  ) : null}
                </div>
                {memPct > 0 ? (
                  <>
                    <div className="detail-metric-card__bar-track">
                      <div
                        className={`detail-metric-card__bar-fill${memPct >= 90 ? " is-warn" : ""}${memPct >= 98 ? " is-error" : ""}`}
                        style={{ width: `${Math.min(100, memPct)}%` }}
                      />
                    </div>
                    <span className="detail-metric-card__hint mono">
                      {formatBytes(g.memory_used)} / {formatBytes(g.memory_total)}
                    </span>
                  </>
                ) : null}
              </Tile>
            );
          })}
        </div>
      ) : null}

      {recordEnabled ? (
        <>
          <Suspense fallback={<PageSpinner />}>
            <LoadChart uuid={node.uuid} />
          </Suspense>

          <Suspense fallback={<PageSpinner />}>
            <PingChart uuid={node.uuid} online={online} />
          </Suspense>
        </>
      ) : (
        <p className="empty">{t("detail.recordsDisabled")}</p>
      )}
    </div>
  );
}
