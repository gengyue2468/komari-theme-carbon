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
  calcMonthlyValueCny,
  calcRemainingValueCny,
  calcValueCny,
  convertFromCny,
  formatFinanceAmount,
  getDailyExchangeRates,
  getStoredFinanceCurrency,
  DEFAULT_EXCHANGE_RATES,
  type CurrencyCode,
  type ExchangeRates,
} from "~/lib/finance";
import {
  formatBillingCycle,
  formatBytes,
  formatRate,
  formatRemainTime,
  formatUptimeWithFormat,
  isNeverExpire,
  parseTags,
  percentOf,
  trafficLimitTypeLabel,
  trafficUsedBytes,
} from "~/lib/format";
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
    const resizeObserver = new ResizeObserver(check);
    resizeObserver.observe(wrap);
    return () => resizeObserver.disconnect();
  }, [name]);

  // react-fast-marquee exposes different interop shapes between dev and prod.
  const MarqueeComponent =
    (Marquee as unknown as { default?: ComponentType }).default ?? Marquee;

  return (
    <div ref={wrapRef} className="detail-title__marquee">
      <MarqueeComponent
        play={overflow}
        autoFill={overflow}
        gradient={false}
        speed={40}
        pauseOnHover
      >
        <span ref={textRef} className="detail-title__name" title={name}>
          {name}
        </span>
      </MarqueeComponent>
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
  const realtimeReady = useNodesStore((s) => s.realtimeReady);
  const realtimeUpdatedAt = useNodesStore((s) => s.realtimeUpdatedAt);
  const loading = useNodesStore((s) => s.loading);
  const recordEnabled =
    useNodesStore((s) => s.publicSettings?.record_enabled) !== false;
  const [financeBase] = useState<CurrencyCode>(() =>
    typeof window !== "undefined" ? getStoredFinanceCurrency() : "CNY",
  );
  const [financeRates, setFinanceRates] = useState<ExchangeRates>(
    DEFAULT_EXCHANGE_RATES,
  );

  useEffect(() => {
    let cancelled = false;
    void getDailyExchangeRates().then((rates) => {
      if (!cancelled) setFinanceRates(rates);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const node = useMemo(() => nodes.find((n) => n.uuid === uuid), [nodes, uuid]);
  const online = realtimeReady && onlineIds.includes(uuid);
  const metrics = realtimeReady ? realtime[uuid] : undefined;

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
  const trafficPct =
    metrics && hasLimit ? percentOf(trafficUsed, node.traffic_limit) : null;

  const priceCny = calcValueCny(node, financeRates);
  const monthlyCny = calcMonthlyValueCny(node, financeRates);
  const remainingValueCny = calcRemainingValueCny(node, financeRates);
  const priceMetric = formatFinanceAmount(
    convertFromCny(priceCny, financeBase, financeRates),
    financeBase,
    i18n.language,
  );
  const monthlyMetric = formatFinanceAmount(
    convertFromCny(monthlyCny, financeBase, financeRates),
    financeBase,
    i18n.language,
  );
  const remainingMetric = formatFinanceAmount(
    convertFromCny(remainingValueCny, financeBase, financeRates),
    financeBase,
    i18n.language,
  );
  const priceText = `${priceMetric.symbol}${priceMetric.value}`;
  const cycleText = formatBillingCycle(node.billing_cycle);

  const remainTimeText = formatRemainTime(node.expired_at);
  const expireDateText =
    node.expired_at && !isNeverExpire(node.expired_at)
      ? new Date(node.expired_at).toLocaleDateString()
      : undefined;

  // Live metric cards: quick snapshot before finance
  const cpuPct = metrics?.cpu.usage ?? null;
  const ramUsed = metrics?.ram.used ?? 0;
  const ramTotal = node.mem_total || metrics?.ram.total || 0;
  const ramPct = metrics && ramTotal > 0 ? percentOf(ramUsed, ramTotal) : null;
  const diskUsed = metrics?.disk.used ?? 0;
  const diskTotal = node.disk_total || metrics?.disk.total || 0;
  const diskPct =
    metrics && diskTotal > 0 ? percentOf(diskUsed, diskTotal) : null;
  const tcpConns = metrics?.connections.tcp ?? 0;
  const udpConns = metrics?.connections.udp ?? 0;
  const conns = tcpConns + udpConns;
  const swapUsed = metrics?.swap.used ?? 0;
  const swapTotal = node.swap_total || metrics?.swap.total || 0;
  const hasGpu = !!node.gpu_name && node.gpu_name !== "None";
  const gpuPct = metrics?.gpu?.average_usage ?? null;
  const gpuDetails = metrics?.gpu?.detailed_info ?? [];
  const agentMessage = metrics?.message?.trim() || "";

  const liveCards = [
    {
      key: "cpu",
      label: t("metrics.cpu"),
       value: cpuPct != null ? `${cpuPct.toFixed(1)}%` : "—",
      icon: <Chip size={16} />,
      bar: cpuPct,
      hint: metrics
        ? `${metrics.load.load1.toFixed(2)} · ${metrics.load.load5.toFixed(2)} · ${metrics.load.load15.toFixed(2)}`
        : "",
    },
    {
      key: "ram",
      label: t("metrics.ram"),
      value: metrics ? formatBytes(ramUsed) : "—",
      icon: <DataBase size={16} />,
      bar: ramPct,
      hint:
        metrics && ramPct != null
           ? `${ramPct.toFixed(1)}% / ${formatBytes(ramTotal)}`
          : "",
    },
    {
      key: "disk",
      label: t("metrics.disk"),
      value: metrics ? formatBytes(diskUsed) : "—",
      icon: <DataVolume size={16} />,
      bar: diskPct,
      hint:
        metrics && diskPct != null
           ? `${diskPct.toFixed(1)}% / ${formatBytes(diskTotal)}`
          : "",
    },
    {
      key: "conn",
      label: t("metrics.connections"),
      value: metrics ? String(conns) : "—",
      icon: <Application size={16} />,
      bar: null,
      hint: metrics ? `TCP ${tcpConns} · UDP ${udpConns}` : "",
    },
    ...(hasGpu
      ? [
          {
            key: "gpu",
            label: t("metrics.gpu"),
             value: gpuPct != null ? `${gpuPct.toFixed(1)}%` : "—",
            icon: <Video size={16} />,
            bar: gpuPct,
            hint: metrics?.gpu ? node.gpu_name : "",
          },
        ]
      : []),
  ];

  const financeCards = [
    {
      key: "price",
      label: t("detail.nodePrice"),
      value: priceText,
      unit: node.price > 0 ? `${priceMetric.currency} · ${cycleText}` : undefined,
      Icon: Currency,
    },
    {
      key: "monthly",
      label: t("stats.monthlyCost"),
      value:
        node.billing_cycle > 0
          ? `${monthlyMetric.symbol}${monthlyMetric.value}`
          : t("detail.notApplicable"),
      unit:
        node.billing_cycle > 0 ? `${monthlyMetric.currency} / mo` : undefined,
      Icon: Currency,
    },
    {
      key: "remain-time",
      label: t("detail.remainTime"),
      value: remainTimeText,
      unit: expireDateText,
      Icon: Calendar,
    },
    {
      key: "remain-value",
      label: t("stats.remaining"),
      value: `${remainingMetric.symbol}${remainingMetric.value}`,
      unit: remainingMetric.currency,
      Icon: Currency,
    },
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
      value: metrics ? formatUptimeWithFormat(metrics.uptime, "minute") : "—",
      icon: <Time size={16} />,
    },
    {
      label: t("detail.lastSeen"),
      value: (realtimeReady && (realtimeUpdatedAt[uuid] ?? metrics?.updated_at))
        ? new Date(
            realtimeUpdatedAt[uuid] ?? metrics?.updated_at ?? "",
          ).toLocaleString(i18n.language)
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
      value: metrics ? formatBytes(ramUsed) : "—",
      sub: ramTotal > 0 ? `/ ${formatBytes(ramTotal)}` : "",
      pct: ramPct,
      icon: <DataBase size={16} />,
    },
    {
      label: t("detail.swap"),
      value: metrics ? formatBytes(swapUsed) : "—",
      sub: swapTotal > 0 ? `/ ${formatBytes(swapTotal)}` : "",
      pct: metrics && swapTotal > 0 ? percentOf(swapUsed, swapTotal) : null,
      icon: <DataBackup size={16} />,
    },
    {
      label: t("metrics.disk"),
      value: metrics ? formatBytes(diskUsed) : "—",
      sub: diskTotal > 0 ? `/ ${formatBytes(diskTotal)}` : "",
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
          <div className="detail-top__meta">
            <Tag
              type={!realtimeReady ? "cool-gray" : online ? "blue" : "red"}
              size="sm"
              title={
                !realtimeReady
                  ? t("app.statusLoading")
                  : online
                    ? t("app.online")
                    : t("app.offline")
              }
            >
              {!realtimeReady
                ? t("app.statusLoading")
                : online
                  ? t("app.online")
                  : t("app.offline")}
            </Tag>
            {tags.map((tag) => (
              <Tag key={tag} type="gray" size="sm">
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
          <Tile
            key={card.key}
            className={`detail-metric-card${!realtimeReady ? " is-loading" : ""}`}
          >
            <div className="detail-metric-card__top row-between">
              <span className="detail-metric-card__label">{card.label}</span>
              {card.icon}
            </div>
            <div className="detail-metric-card__value-row">
              <span className="detail-metric-card__value mono">{card.value}</span>
            </div>
            {card.bar != null && (
              <div className="detail-metric-card__bar-track">
                <div
                  className={`detail-metric-card__bar-fill${card.bar >= 60 ? " is-warn" : ""}${card.bar >= 80 ? " is-error" : ""}`}
                  style={{ width: `${Math.min(100, Math.max(0, card.bar))}%` }}
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
          <Tile
            key={card.key}
            className="detail-metric-card detail-finance-card"
          >
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
                {item.pct != null && (
                  <div className="detail-info-cell__bar-track">
                    <div
                      className={`detail-info-cell__bar-fill${item.pct >= 60 ? " is-warn" : ""}${item.pct >= 80 ? " is-error" : ""}`}
                      style={{ width: `${Math.min(100, Math.max(0, item.pct))}%` }}
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
                trafficPct != null && trafficPct >= 80
                  ? " is-error"
                  : trafficPct != null && trafficPct >= 60
                    ? " is-warn"
                    : ""
              }`}
            >
              {hasLimit && metrics ? (
                <div
                  className="detail-traffic-fill"
                  style={{ width: `${trafficPct ?? 0}%` }}
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
                  {hasLimit && metrics
                    ? `${formatBytes(trafficUsed)} / ${formatBytes(node.traffic_limit)}`
                    : hasLimit
                      ? "—"
                      : t("detail.unlimited")}
                  {hasLimit && trafficPct != null ? (
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
                     {g.utilization.toFixed(1)}%
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
                        className={`detail-metric-card__bar-fill${memPct >= 60 ? " is-warn" : ""}${memPct >= 80 ? " is-error" : ""}`}
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
            <PingChart
              uuid={node.uuid}
              online={online}
              realtimeReady={realtimeReady}
            />
          </Suspense>
        </>
      ) : (
        <p className="empty">{t("detail.recordsDisabled")}</p>
      )}
    </div>
  );
}
