import type { NodeMapPoint } from "~/lib/geo";

export interface MapMarker {
  key: string;
  lat: number;
  lon: number;
  /** Primary node (first member) */
  uuid: string;
  name: string;
  city: string;
  count: number;
  members: NodeMapPoint[];
  onlineCount: number;
}

function bucketKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * One marker per co-located group (same region / near-identical coords).
 * Hover UI lists all members as cards.
 */
export function layoutMapMarkers(
  points: NodeMapPoint[],
  onlineIds: Set<string>,
): MapMarker[] {
  const groups = new Map<string, NodeMapPoint[]>();
  for (const p of points) {
    const k = bucketKey(p.lat, p.lon);
    const list = groups.get(k);
    if (list) list.push(p);
    else groups.set(k, [p]);
  }

  const markers: MapMarker[] = [];

  for (const [key, members] of groups) {
    const lat =
      members.reduce((s, m) => s + m.lat, 0) / Math.max(1, members.length);
    const lon =
      members.reduce((s, m) => s + m.lon, 0) / Math.max(1, members.length);
    const primary = members[0];
    markers.push({
      key,
      lat,
      lon,
      uuid: primary.uuid,
      name: primary.name,
      city: primary.city,
      count: members.length,
      members,
      onlineCount: members.filter((m) => onlineIds.has(m.uuid)).length,
    });
  }

  return markers;
}
