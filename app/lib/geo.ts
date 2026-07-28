import { getRegionCode } from "~/lib/region";
import type { NodeInfo } from "~/types/komari";

/** Country centroid (lat, lon) from region flag / code */
const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [39.83, -98.58],
  CN: [35.86, 104.2],
  JP: [36.2, 138.25],
  KR: [35.91, 127.77],
  SG: [1.35, 103.82],
  HK: [22.32, 114.17],
  TW: [23.7, 120.96],
  DE: [51.17, 10.45],
  GB: [55.38, -3.44],
  FR: [46.23, 2.21],
  NL: [52.13, 5.29],
  AU: [-25.27, 133.78],
  CA: [56.13, -106.35],
  IN: [20.59, 78.96],
  BR: [-14.24, -51.93],
  RU: [61.52, 105.32],
  IE: [53.14, -7.69],
  SE: [60.13, 18.64],
  NO: [60.47, 8.47],
  FI: [61.92, 25.75],
  PL: [51.92, 19.15],
  ES: [40.46, -3.75],
  IT: [41.87, 12.57],
  CH: [46.82, 8.23],
  AT: [47.52, 14.55],
  BE: [50.5, 4.47],
  PT: [39.4, -8.22],
  TR: [38.96, 35.24],
  AE: [23.42, 53.85],
  ZA: [-30.56, 22.94],
  MX: [23.63, -102.55],
  AR: [-38.42, -63.62],
  CL: [-35.68, -71.54],
  NZ: [-40.9, 174.89],
  TH: [15.87, 100.99],
  VN: [14.06, 108.28],
  MY: [4.21, 101.98],
  ID: [-0.79, 113.92],
  PH: [12.88, 121.77],
  KZ: [48.02, 66.92],
};

export interface NodeMapPoint {
  uuid: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
}

/** Sync: place markers by region flag only (fast, no network). */
export function resolveNodeMapPoints(nodes: NodeInfo[]): NodeMapPoint[] {
  const points: NodeMapPoint[] = [];
  for (const n of nodes) {
    const code = getRegionCode(n.region);
    if (!code) continue;
    const c = COUNTRY_COORDS[code];
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
