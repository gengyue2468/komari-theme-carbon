import { IconButton, Tile } from "@carbon/react";
import { Reset } from "@carbon/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { resolveNodeMapPoints } from "~/lib/geo";
import { layoutMapMarkers, type MapMarker } from "~/lib/map-cluster";
import { getRegionCode } from "~/lib/region";
import type { NodeInfo } from "~/types/komari";
// Bundled locally so the map renders offline (no jsdelivr dependency).
import worldGeo from "~/data/countries-110m.json";

const DEFAULT_CENTER: [number, number] = [12, 6];
const DEFAULT_ZOOM = 1;

const ALPHA2_TO_NUM: Record<string, string> = {
  SG: "702",
  US: "840",
  DE: "276",
  JP: "392",
  CN: "156",
  HK: "344",
  AU: "036",
  TW: "158",
  KR: "410",
  GB: "826",
  FR: "250",
  CA: "124",
  NL: "528",
  IN: "356",
  BR: "076",
  RU: "643",
  IE: "372",
};

interface NodeWorldMapProps {
  nodes: NodeInfo[];
  onlineIds: string[];
}

export function NodeWorldMap({ nodes, onlineIds }: NodeWorldMapProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);
  const [hover, setHover] = useState<MapMarker | null>(null);
  const [position, setPosition] = useState({
    coordinates: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
  });

  useEffect(() => {
    if (!hover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hover]);

  // Sync region centroids — no async geo / name parsing
  const points = useMemo(() => resolveNodeMapPoints(nodes), [nodes]);

  const markers = useMemo(
    () => layoutMapMarkers(points, onlineSet),
    [points, onlineSet],
  );

  const activeCountryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of nodes) {
      const alpha = getRegionCode(n.region);
      if (!alpha) continue;
      const num = ALPHA2_TO_NUM[alpha];
      if (num) ids.add(num);
      if (alpha === "HK") ids.add("156");
    }
    return ids;
  }, [nodes]);

  const onlineCount = points.filter((p) => onlineSet.has(p.uuid)).length;

  const viewDirty =
    position.zoom !== DEFAULT_ZOOM ||
    Math.abs(position.coordinates[0] - DEFAULT_CENTER[0]) > 0.01 ||
    Math.abs(position.coordinates[1] - DEFAULT_CENTER[1]) > 0.01;

  const resetView = () => {
    setPosition({ coordinates: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    setHover(null);
  };

  return (
    <Tile className="node-map">
      <div className="node-map__head">
        <span className="node-map__title">{t("map.title")}</span>
        <span className="node-map__meta mono">
          {onlineCount}/{points.length} {t("app.online")}
        </span>
      </div>

      <div className="node-map__canvas">
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{ scale: 155, center: [12, 6] }}
          width={800}
          height={360}
          style={{ width: "100%", height: "100%" }}
          className="node-map__svg"
        >
          <ZoomableGroup
            center={position.coordinates}
            zoom={position.zoom}
            minZoom={1}
            maxZoom={8}
            onMoveEnd={(pos) => {
              setPosition({
                coordinates: pos.coordinates as [number, number],
                zoom: pos.zoom,
              });
            }}
          >
            <Geographies geography={worldGeo}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const id = String(geo.id ?? "");
                  const active = activeCountryIds.has(id);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      className={
                        active ? "node-map__land is-active" : "node-map__land"
                      }
                      tabIndex={-1}
                      style={{
                        default: { outline: "none" },
                        hover: { outline: "none" },
                        pressed: { outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>

            {markers.map((m) => {
              const clusterOnline = m.onlineCount > 0;
              const active = hover?.key === m.key;
              const label =
                m.count === 1
                  ? m.name
                  : t("map.nodesAt", { count: m.count });
              return (
                <Marker key={m.key} coordinates={[m.lon, m.lat]}>
                  <g
                    className={
                      clusterOnline
                        ? "node-map__marker is-on"
                        : "node-map__marker is-off"
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    aria-expanded={active}
                    onMouseEnter={() => setHover(m)}
                    onFocus={() => setHover(m)}
                    onBlur={() => {
                      // Delay so focus can move into panel buttons
                      window.setTimeout(() => {
                        const ae = document.activeElement;
                        if (
                          ae &&
                          ae.closest?.(".node-map__panel, .node-map__marker")
                        ) {
                          return;
                        }
                        setHover((prev) => (prev?.key === m.key ? null : prev));
                      }, 0);
                    }}
                    onClick={() => {
                      if (m.count === 1) navigate(`/node/${m.uuid}`);
                      else setHover((prev) => (prev?.key === m.key ? null : m));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (m.count === 1) navigate(`/node/${m.uuid}`);
                        else
                          setHover((prev) =>
                            prev?.key === m.key ? null : m,
                          );
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      r={active ? 7 : m.count > 1 ? 6 : 4.5}
                      className="node-map__dot"
                    />
                    <circle r={14} className="node-map__hit" />
                    {m.count > 1 ? (
                      <text
                        className="node-map__count"
                        textAnchor="middle"
                        dy="0.35em"
                        fontSize={8}
                      >
                        {m.count}
                      </text>
                    ) : null}
                  </g>
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>

        {hover ? (
          <div
            className="node-map__panel"
            role="dialog"
            aria-label={
              hover.count > 1
                ? t("map.nodesAt", { count: hover.count })
                : hover.name
            }
            onMouseEnter={() => setHover(hover)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="node-map__panel-head mono">
              <span>
                {hover.city}
                {hover.count > 1 ? ` · ${hover.count}` : ""}
              </span>
              <span>
                {hover.onlineCount}/{hover.count} {t("app.online")}
              </span>
            </div>
            <div className="node-map__cards">
              {hover.members.map((mem) => {
                const on = onlineSet.has(mem.uuid);
                return (
                  <button
                    key={mem.uuid}
                    type="button"
                    className={`node-map__card${on ? " is-on" : " is-off"}`}
                    aria-label={t("map.openNode")}
                    onClick={() => navigate(`/node/${mem.uuid}`)}
                  >
                    <span
                      className={`node-map__card-dot${on ? " is-on" : ""}`}
                      aria-hidden
                    />
                    <span className="node-map__card-body">
                      <span className="node-map__card-name">{mem.name}</span>
                      <span className="node-map__card-meta mono">
                        {mem.city} · {on ? t("app.online") : t("app.offline")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {viewDirty ? (
          <div className="node-map__corner">
            <IconButton
              kind="ghost"
              size="sm"
              label={t("map.reset")}
              onClick={resetView}
              className="node-map__reset"
            >
              <Reset size={16} />
            </IconButton>
          </div>
        ) : null}
      </div>
    </Tile>
  );
}
