import type { Coordinates } from "../models/game";

export interface ClosedRoadSegment {
  id: string; // OpenStreetMap way id and consecutive node index.
  coordinates: [Coordinates, Coordinates];
}
const cache = new Map<string, Promise<ClosedRoadSegment | null>>();

export const distanceToRoadSegmentMeters = (p: Coordinates, a: Coordinates, b: Coordinates): number => {
  const scale = Math.cos(p[1] * Math.PI / 180);
  const ax = (a[0] - p[0]) * 111_320 * scale, ay = (a[1] - p[1]) * 111_320;
  const dx = (b[0] - a[0]) * 111_320 * scale, dy = (b[1] - a[1]) * 111_320;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / Math.max(1e-9, dx * dx + dy * dy)));
  return Math.hypot(ax + t * dx, ay + t * dy);
};

export const routeIntersectsClosedSegment = (route: Coordinates[], closed: ClosedRoadSegment): boolean => {
  // Mapbox geometry and OSM nodes need not coincide exactly. Sample both ends
  // and the midpoint of the OSM segment against the route polyline.
  const [a, b] = closed.coordinates;
  const samples: Coordinates[] = [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]];
  return samples.some(p => route.slice(1).some((end, i) =>
    distanceToRoadSegmentMeters(p, route[i], end) <= 8));
};

export async function resolveClosedRoadSegment(location: Coordinates, signal?: AbortSignal): Promise<ClosedRoadSegment | null> {
  const key = location.map(v => v.toFixed(5)).join(",");
  if (!cache.has(key)) {
    const promise = (async () => {
      const query = `[out:json][timeout:12];way(around:45,${location[1]},${location[0]})["highway"]["area"!="yes"];out geom;`;
      const response = await fetch("https://overpass.kumi.systems/api/interpreter", {
        method: "POST", body: new URLSearchParams({ data: query }), signal,
      });
      if (!response.ok) throw new Error(`OpenStreetMap road lookup failed: ${response.status}`);
      const data = await response.json() as {
        elements?: Array<{ id: number; geometry?: Array<{ lon: number; lat: number }> }>;
      };
      let closest: ClosedRoadSegment | null = null;
      let minDistance = 45;
      for (const way of data.elements ?? []) {
        const nodes = way.geometry ?? [];
        for (let i = 1; i < nodes.length; i++) {
          const a: Coordinates = [nodes[i - 1].lon, nodes[i - 1].lat];
          const b: Coordinates = [nodes[i].lon, nodes[i].lat];
          const distance = distanceToRoadSegmentMeters(location, a, b);
          if (distance < minDistance) {
            minDistance = distance;
            closest = { id: `${way.id}:${i - 1}`, coordinates: [a, b] };
          }
        }
      }
      return closest;
    })();
    cache.set(key, promise);
    void promise.catch(() => cache.delete(key));
  }
  return cache.get(key)!;
}
