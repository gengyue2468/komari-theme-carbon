import {
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@carbon/react";
import { ArrowDown, ArrowUp } from "@carbon/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
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
import { getArchIcon, getOsIcon } from "~/lib/os-arch";
import { pickThreeNetworks } from "~/lib/ping-display";
import type { NodeInfo, RealtimeMetrics } from "~/types/komari";

interface NodeTableProps {
  nodes: NodeInfo[];
  onlineIds: string[];
  realtime: Record<string, RealtimeMetrics>;
}

function MiniBar({ pct }: { pct: number }) {
  const v = Math.min(100, Math.max(0, pct));
  const tone =
    v >= 90 ? " card-bar__fill--error" : v >= 75 ? " card-bar__fill--warn" : "";
  return (
    <div className="card-bar card-bar--sm">
      <div className={`card-bar__fill${tone}`} style={{ width: `${v}%` }} />
    </div>
  );
}

function MetricCell({ pct, sub }: { pct: number; sub?: string }) {
  return (
    <div className="table-metric">
      <span className="table-metric__pct mono">{pct.toFixed(0)}%</span>
      <MiniBar pct={pct} />
      {sub ? <span className="table-metric__sub mono">{sub}</span> : null}
    </div>
  );
}

function sortPad(n: number): string {
  return n.toFixed(2).padStart(8, "0");
}

export function NodeTable({ nodes, onlineIds, realtime }: NodeTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);

  const headers = useMemo(
    () => [
      { key: "status", header: t("table.status") },
      { key: "os", header: t("table.os") },
      { key: "arch", header: t("table.arch") },
      { key: "name", header: t("table.name") },
      { key: "tags", header: t("table.tags") },
      { key: "cpu", header: t("table.cpu") },
      { key: "mem", header: t("table.ram") },
      { key: "disk", header: t("table.disk") },
      { key: "traffic", header: t("table.traffic") },
      { key: "rate", header: t("table.rate") },
      { key: "isp", header: t("table.isp") },
    ],
    [t],
  );

  const rows = useMemo(
    () =>
      nodes.map((n) => {
        const on = onlineSet.has(n.uuid);
        const m = realtime[n.uuid];
        const cpu = m?.cpu.usage ?? 0;
        const ramPct = m ? percentOf(m.ram.used, m.ram.total) : 0;
        const diskPct = m ? percentOf(m.disk.used, m.disk.total) : 0;
        const tUsed = m
          ? trafficUsedBytes(
              m.network.totalUp,
              m.network.totalDown,
              n.traffic_limit_type,
            )
          : 0;
        const tPct = n.traffic_limit > 0 ? percentOf(tUsed, n.traffic_limit) : 0;
        const tags = parseTags(n.tags);
        const price =
          n.price < 0
            ? t("detail.free")
            : n.price === 0
              ? ""
              : `${n.currency}${n.price}${n.billing_cycle > 0 ? `/${n.billing_cycle}${t("detail.days")}` : ""}`;

        return {
          id: n.uuid,
          status: on ? "1" : "0",
          os: n.os || "",
          arch: n.arch || "",
          name: n.name || "",
          tags: [n.group, ...tags].filter(Boolean).join(" "),
          cpu: sortPad(cpu),
          mem: sortPad(ramPct),
          disk: sortPad(diskPct),
          traffic: sortPad(tPct),
          rate: sortPad((m?.network.up ?? 0) + (m?.network.down ?? 0)),
          isp: "",
          _on: on,
          _m: m,
          _n: n,
          _os: getOsIcon(n.os),
          _arch: getArchIcon(n.arch, n.cpu_name),
          _tags: tags,
          _cpu: cpu,
          _ramPct: ramPct,
          _diskPct: diskPct,
          _tPct: tPct,
          _tUsed: tUsed,
          _tLimit: n.traffic_limit,
          _netUp: m ? formatRate(m.network.up) : "—",
          _netDown: m ? formatRate(m.network.down) : "—",
          _uptime: formatUptime(m?.uptime ?? 0),
          _price: price,
          _threeNets: pickThreeNetworks(m?.ping),
        };
      }),
    [nodes, onlineSet, realtime, t],
  );

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  return (
    <div className="node-table-wrap">
      <DataTable rows={rows} headers={headers} isSortable size="lg">
        {({
          rows: dtRows,
          headers: dtHeaders,
          getHeaderProps,
          getRowProps,
          getTableProps,
          getTableContainerProps,
        }) => (
          <TableContainer {...getTableContainerProps()}>
            <Table {...getTableProps()} size="lg">
              <TableHead>
                <TableRow>
                  {dtHeaders.map((header) => {
                    const sortable =
                      header.key !== "tags" && header.key !== "isp";
                    const { key, ...rest } = getHeaderProps({
                      header,
                      isSortable: sortable,
                    });
                    return (
                      <TableHeader key={key} {...rest}>
                        {header.header}
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {dtRows.map((row) => {
                  const d = byId.get(row.id);
                  if (!d) return null;
                  const { key, ...rowRest } = getRowProps({ row });
                  return (
                    <TableRow
                      key={key}
                      {...rowRest}
                      className={
                        d._on
                          ? "table-row-clickable"
                          : "table-row-clickable is-offline"
                      }
                      tabIndex={0}
                      role="link"
                      aria-label={d.name || row.id}
                      onClick={() => navigate(`/node/${row.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/node/${row.id}`);
                        }
                      }}
                    >
                      <TableCell>
                        <span
                          className={`table-dot${d._on ? " is-on" : ""}`}
                          aria-label={
                            d._on ? t("app.online") : t("app.offline")
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <span className="table-icon-cell" title={d._os.label}>
                          <QuickIcon icon={d._os.icon} size={16} title={d._os.label} />
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="table-icon-cell" title={d._arch.label}>
                          <QuickIcon
                            icon={d._arch.icon}
                            size={16}
                            title={d._arch.label}
                          />
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className={d._on ? "table-name" : "table-name is-dim"}>
                          <div className="table-name__top">
                            <RegionFlag
                              region={d._n.region}
                              className="table-flag"
                            />
                            <span className="table-name__text">{d.name}</span>
                          </div>
                          <span className="table-name__sub mono">
                            {d._on ? d._uptime : t("app.offline")}
                            {d._price ? ` · ${d._price}` : ""}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="table-chips">
                          {d._n.group ? (
                            <Tag type="blue" size="sm">
                              {d._n.group}
                            </Tag>
                          ) : null}
                          {d._tags.slice(0, 2).map((tag) => (
                            <Tag key={tag} type="gray" size="sm">
                              {tag}
                            </Tag>
                          ))}
                        </div>
                      </TableCell>

                      <TableCell>
                        <MetricCell
                          pct={d._cpu}
                          sub={
                            d._m
                              ? `${d._m.load.load1.toFixed(2)} / ${d._m.load.load5.toFixed(2)} / ${d._m.load.load15.toFixed(2)}`
                              : undefined
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <MetricCell
                          pct={d._ramPct}
                          sub={
                            d._m
                              ? `${formatBytes(d._m.ram.used)} / ${formatBytes(d._n.mem_total)}`
                              : undefined
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <MetricCell
                          pct={d._diskPct}
                          sub={
                            d._m
                              ? `${formatBytes(d._m.disk.used)} / ${formatBytes(d._n.disk_total)}`
                              : undefined
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <MetricCell
                          pct={d._tPct}
                          sub={
                            d._tLimit > 0
                              ? `${formatBytes(d._tUsed)} / ${formatBytes(d._tLimit)}`
                              : "∞"
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <div className="table-rate-cell">
                          <span className="table-rate-cell__line table-rate__up mono">
                            <ArrowUp size={12} />
                            {d._netUp}
                          </span>
                          <span className="table-rate-cell__line table-rate__down mono">
                            <ArrowDown size={12} />
                            {d._netDown}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="table-isp-cell">
                          {d._threeNets.map((net) => (
                            <span
                              key={net.category}
                              className="table-isp-cell__line mono"
                            >
                              <span className="table-isp-cell__name">
                                {net.category === "CT" ? t("metrics.ct") : net.category === "CU" ? t("metrics.cu") : t("metrics.cm")}
                              </span>
                              <span className="table-isp-cell__val">
                                {net.latencyMs != null
                                  ? `${net.latencyMs}ms`
                                  : "—"}
                              </span>
                            </span>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
}
