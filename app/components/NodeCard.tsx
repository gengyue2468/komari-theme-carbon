import { ClickableTile, Tag } from "@carbon/react";
import { ArrowDown, ArrowUp } from "@carbon/icons-react";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { cardPingFromMetrics, pickThreeNetworks } from "~/lib/ping-display";
import { barToneClass, latencyToneClass } from "~/lib/ping-tone";
import { QuickIcon } from "~/components/BrandIcon";
import { RegionFlag } from "~/components/RegionFlag";
import {
  formatBytes,
  formatRate,
  formatUptime,
  parseTags,
  percentOf,
  trafficUsedBytes,
} from "~/lib/format";
import { getArchIcon, getOsIcon, getVirtIcon } from "~/lib/os-arch";
import type { NodeInfo, RealtimeMetrics } from "~/types/komari";

interface NodeCardProps {
  node: NodeInfo;
  online: boolean;
  metrics?: RealtimeMetrics;
  showUptime?: boolean;
}

/* ── Minimal helpers ── */

function Bar({ pct }: { pct: number }) {
  const v = Math.min(100, Math.max(0, pct));
  return (
    <div className="card-bar">
      <div
        className={`card-bar__fill${v >= 90 ? " card-bar__fill--error" : v >= 75 ? " card-bar__fill--warn" : ""}`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

function Kv({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="card-kv">
      <div className="card-kv__head">
        <span className="card-kv__label">{label}</span>
        {(value || unit) && (
          <span className="card-kv__value mono">
            {value}
            {unit && <span className="card-kv__unit">{unit}</span>}
          </span>
        )}
      </div>
      <Bar pct={parseFloat(value) || 0} />
      {hint && <span className="card-kv__hint mono">{hint}</span>}
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card-row">
      <span className="card-row__label">{label}</span>
      <span className="card-row__value">{children}</span>
    </div>
  );
}

/* ── Ping sparkline ── */

const SPARK_CELLS = 12;

/**
 * Dense "quality barcode": fixed-width strip of small uniform cells. Realtime
 * status only carries current per-task numbers, so each task's live tone is
 * tiled across the fixed grid — a snapshot, not a time series.
 */
function Spark({ label, display, metric, bars }: {
  label: string; display: string; metric: "latency" | "loss";
  bars: Array<{ time: string; latency: number | null; loss: number | null }>;
}) {
  const cells =
    bars.length > 0
      ? Array.from({ length: SPARK_CELLS }, (_, i) => bars[i % bars.length])
      : [];

  return (
    <div className="card-spark">
      <div className="card-row">
        <span className="card-row__label">{label}</span>
        <span className="card-row__value mono">{display}</span>
      </div>
      <div className="card-spark__track" aria-hidden>
        {cells.map((p, i) => {
          const v = metric === "latency" ? p.latency : p.loss;
          return (
            <span
              key={`${p.time}-${i}`}
              className={`card-spark__cell ${barToneClass(metric, v)}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── Card ── */

function StatGroup({ node, online, metrics, showUptime }: NodeCardProps) {
  const { t } = useTranslation();
  const cpu = metrics?.cpu.usage ?? 0;
  const ram = metrics ? percentOf(metrics.ram.used, metrics.ram.total) : 0;
  const disk = metrics ? percentOf(metrics.disk.used, metrics.disk.total) : 0;
  const trafficUsed = metrics
    ? trafficUsedBytes(
        metrics.network.totalUp,
        metrics.network.totalDown,
        node.traffic_limit_type,
      )
    : 0;
  const trafficPct =
    node.traffic_limit > 0 ? percentOf(trafficUsed, node.traffic_limit) : 0;

  const price =
    node.price < 0
      ? t("detail.free")
      : node.price === 0
        ? "—"
        : `${node.currency}${node.price}/${node.billing_cycle}${t("detail.days")}`;

  const ramUsed = metrics ? formatBytes(metrics.ram.used) : "—";
  const ramTotal = formatBytes(node.mem_total);
  const diskUsed = metrics ? formatBytes(metrics.disk.used) : "—";
  const diskTotal = formatBytes(node.disk_total);

  return (
    <>
      <section className="card-section">
        <h3 className="card-section__title">{t("detail.system")}</h3>
        <div className="card-kv-grid">
          <Kv label={t("metrics.cpu")} value={cpu.toFixed(0)} unit="%" hint={metrics ? `${metrics.load.load1.toFixed(2)}, ${metrics.load.load5.toFixed(2)}, ${metrics.load.load15.toFixed(2)}` : "—"} />
          <Kv label={t("metrics.ram")} value={ram.toFixed(0)} unit="%" hint={`${ramUsed} / ${ramTotal}`} />
          <Kv label={t("metrics.disk")} value={disk.toFixed(0)} unit="%" hint={`${diskUsed} / ${diskTotal}`} />
          <Kv label={t("metrics.traffic")} value={trafficPct.toFixed(0)} unit="%" hint={node.traffic_limit > 0 ? `${formatBytes(trafficUsed)} / ${formatBytes(node.traffic_limit)}` : "∞"} />
        </div>
      </section>

      <section className="card-section">
        <h3 className="card-section__title">{t("detail.network")}</h3>
        <Row label={t("metrics.rate")}>
          <span className="card-rate mono">
            <span className="card-rate__up"><ArrowUp size={12} />{metrics ? formatRate(metrics.network.up) : "—"}</span>
            <span className="card-rate__down"><ArrowDown size={12} />{metrics ? formatRate(metrics.network.down) : "—"}</span>
          </span>
        </Row>
        {showUptime && <Row label={t("metrics.uptime")}><span className="mono">{formatUptime(metrics?.uptime ?? 0)}</span></Row>}
        <Row label={t("detail.price")}><span className="mono">{price}</span></Row>
      </section>

      <SectionPing metrics={metrics} />
    </>
  );
}

function SectionPing({ metrics }: { metrics?: RealtimeMetrics }) {
  const { t } = useTranslation();
  const ping = useMemo(() => cardPingFromMetrics(metrics), [metrics]);
  const threeNets = useMemo(
    () => pickThreeNetworks(metrics?.ping),
    [metrics?.ping],
  );

  const ispLabel = (cat: "CT" | "CU" | "CM") =>
    cat === "CT" ? t("metrics.ct") : cat === "CU" ? t("metrics.cu") : t("metrics.cm");

  return (
    <section className="card-section">
      <h3 className="card-section__title">{t("metrics.isp")}</h3>
      {threeNets.length > 0 ? (
        <div className="card-isp mono">
          {threeNets.map((net) => (
            <span key={net.category}>
              <span className={net.latencyMs != null ? latencyToneClass(net.latencyMs) : undefined}>
                {ispLabel(net.category)}
              </span>
              <span className="card-isp__val">{net.latencyMs != null ? `${net.latencyMs}ms` : "—"}</span>
            </span>
          ))}
        </div>
      ) : (
        <span className="card-row__value mono">N/A</span>
      )}
      <div className="card-spark-grid">
        <Spark label={t("metrics.latency")} display={ping.avgLatencyMs > 0 ? `${ping.avgLatencyMs} ms` : "N/A"} metric="latency" bars={ping.bars} />
        <Spark label={t("metrics.loss")} display={`${ping.avgLossPct.toFixed(1)}%`} metric="loss" bars={ping.bars} />
      </div>
    </section>
  );
}

export const NodeCard = memo(
  function NodeCard({ node, online, metrics, showUptime }: NodeCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const os = useMemo(() => getOsIcon(node.os), [node.os]);
  const arch = useMemo(
    () => getArchIcon(node.arch, node.cpu_name),
    [node.arch, node.cpu_name],
  );
  const tags = useMemo(() => parseTags(node.tags), [node.tags]);

  return (
    <ClickableTile
      className="node-card"
      href={`/node/${node.uuid}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(`/node/${node.uuid}`);
      }}
    >
      <div className="node-card__head">
        <div className="node-card__head-left">
          <h3 className="node-card__title" title={node.name}>
            <RegionFlag region={node.region} className="node-card__flag" />
            {node.name}
          </h3>
        </div>
        <div className="node-card__head-right">
          <Tag type={online ? "blue" : "red"} size="sm">
            {online ? t("app.online") : t("app.offline")}
          </Tag>
        </div>
      </div>

      <div className="node-card__sub">
        {node.group ? (
          <Tag type="blue" size="sm">
            {node.group}
          </Tag>
        ) : null}
        <div className="node-card__badges">
          <QuickIcon icon={os.icon} size={16} title={os.label} />
          <QuickIcon icon={arch.icon} size={16} title={arch.label} />
        </div>
        <span className="node-card__cpu mono">{node.cpu_name}</span>
      </div>

      <StatGroup
        node={node}
        online={online}
        metrics={metrics}
        showUptime={showUptime}
      />

      {tags.length > 0 && (
        <div className="node-card__tags">
          {tags.map((tag) => (
            <Tag key={tag} type="gray" size="sm">
              {tag}
            </Tag>
          ))}
        </div>
      )}
    </ClickableTile>
  );
  },
  (prev, next) =>
    prev.online === next.online &&
    prev.showUptime === next.showUptime &&
    prev.node === next.node &&
    prev.metrics === next.metrics,
);
