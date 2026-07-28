import { Button, Tag, Tile } from "@carbon/react";
import {
  Application,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  Currency,
  DataBase,
  Time,
  Video,
} from "@carbon/icons-react";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { QuickIcon } from "~/components/BrandIcon";
import { PageSpinner } from "~/components/PageSpinner";
import { RegionFlag } from "~/components/RegionFlag";
import {
  formatBytes,
  formatRate,
  formatRemainTime,
  formatUptime,
  isNeverExpire,
  parseTags,
  percentOf,
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

export default function NodeDetail() {
  const { uuid = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const nodes = useNodesStore((s) => s.nodes);
  const onlineIds = useNodesStore((s) => s.onlineIds);
  const realtime = useNodesStore((s) => s.realtime);
  const loading = useNodesStore((s) => s.loading);

  const node = useMemo(() => nodes.find((n) => n.uuid === uuid), [nodes, uuid]);
  const online = onlineIds.includes(uuid);
  const metrics = realtime[uuid];

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [uuid]);

  if (!node) {
    if (loading) return <PageSpinner />;
    return (
      <div className="detail">
        <Tile className="detail-empty">
          <p>{t("detail.notFound")}</p>
          <Button kind="primary" size="md" onClick={() => navigate("/")}>
            {t("detail.back")}
          </Button>
        </Tile>
      </div>
    );
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
  const cycleText =
    node.billing_cycle > 0 ? ` / ${node.billing_cycle}${t("detail.days")}` : "";

  const remainTimeText = formatRemainTime(node.expired_at);
  const expireDateText =
    node.expired_at && !isNeverExpire(node.expired_at)
      ? new Date(node.expired_at).toLocaleDateString()
      : undefined;

  const finance = nodeFinance(node);
  const financeCards = [
    {
      key: "price",
      label: t("detail.nodePrice"),
      value: priceText,
      unit: cycleText.trim() || undefined,
      Icon: Currency,
    },
    {
      key: "monthly",
      label: t("stats.monthlyCost"),
      value: finance.monthly,
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
      value: finance.remaining,
      Icon: Currency,
    },
  ];

  const hardwareItems = [
    {
      label: t("metrics.cpu"),
      value: `${node.cpu_name} (×${node.cpu_cores})`,
      icon: <QuickIcon icon={arch.icon} size={16} title={arch.label} />,
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
      icon: <Application size={16} />,
    },
    {
      label: t("metrics.uptime"),
      value: formatUptime(metrics?.uptime ?? 0),
      icon: <Time size={16} />,
    },
    {
      label: t("detail.lastSeen"),
      value: metrics?.updated_at
        ? new Date(metrics.updated_at).toLocaleString()
        : "—",
      icon: <Time size={16} />,
    },
  ];
  const storageItems = [
    {
      label: t("metrics.ram"),
      value: formatBytes(node.mem_total),
      icon: <DataBase size={16} />,
    },
    {
      label: t("detail.swap"),
      value: formatBytes(node.swap_total),
      icon: <DataBase size={16} />,
    },
    {
      label: t("metrics.disk"),
      value: formatBytes(node.disk_total),
      icon: <DataBase size={16} />,
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
          <h1 className="detail-title">
            <RegionFlag region={node.region} className="detail-flag" />
            {node.name}
          </h1>
          <span
            className={`status-dot${online ? " is-on" : ""}`}
            title={online ? t("app.online") : t("app.offline")}
            aria-label={online ? t("app.online") : t("app.offline")}
          />
          {tags.map((tag) => (
            <Tag key={tag} type="blue" size="sm">
              {tag}
            </Tag>
          ))}
        </div>
      </div>

      {node.public_remark?.trim() ? (
        <p className="detail-remark">{node.public_remark.trim()}</p>
      ) : null}

      <div className="detail-finance-grid">
        {financeCards.map((card) => (
          <Tile key={card.key} className="detail-metric-card">
            <div className="detail-metric-card__top row-between">
              <span className="detail-metric-card__label">{card.label}</span>
              <card.Icon size={20} className="detail-metric-card__icon" />
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
                <div className="detail-info-cell__value mono">{item.value}</div>
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
                  <DataBase size={14} />
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
                </div>
              </div>
            </div>
            <div className="detail-info-cell">
              <div className="detail-info-cell__label">
                <ArrowUp size={14} />
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

      <Suspense fallback={<PageSpinner />}>
        <LoadChart uuid={node.uuid} />
      </Suspense>

      <Suspense fallback={<PageSpinner />}>
        <PingChart uuid={node.uuid} online={online} />
      </Suspense>
    </div>
  );
}
