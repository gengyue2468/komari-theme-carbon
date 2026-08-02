import { getCountryCoords } from "~/lib/countries";
import { getRegionCode } from "~/lib/region";
import type { NodeInfo } from "~/types/komari";

export interface NodeMapPoint {
  uuid: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
}

/** Sync: place markers by region flag only (fast, no network). Coordinates
 * come from the `world-countries` dataset, so any resolvable region works. */
export function resolveNodeMapPoints(nodes: NodeInfo[]): NodeMapPoint[] {
  const points: NodeMapPoint[] = [];
  for (const n of nodes) {
    const code = getRegionCode(n.region);
    if (!code) continue;
    const c = getCountryCoords(code);
    if (!c) continue;
    points.push({
      uuid: n.uuid,
      name: n.name,
      city: code,
      lat: c[0],
      lon: c[1],
    });
  }
  return points;
}
