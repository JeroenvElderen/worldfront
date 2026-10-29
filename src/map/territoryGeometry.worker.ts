import { featureCollection } from "@turf/helpers";
import simplify from "@turf/simplify";
import { lockedTerritoryMask, mergeVillageTerritories } from "../services/territoryGeometry";

self.onmessage = (event: MessageEvent<{ id: number; territories: Parameters<typeof mergeVillageTerritories>[0] }>) => {
  const { id, territories } = event.data;
  try {
    const unlocked = mergeVillageTerritories(territories);
    // Simplification affects rendering only; authoritative explored geometry remains untouched.
    const simplifyDisplay = <T extends GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>(feature: T): T =>
      simplify(feature, { tolerance: 0.00005, highQuality: false, mutate: false }) as T;
    const displayUnlocked = unlocked ? simplifyDisplay(unlocked) : null;
    const displayLocked = simplifyDisplay(lockedTerritoryMask(unlocked));
    self.postMessage({ id, coverage: featureCollection(displayUnlocked ? [displayUnlocked] : []), locked: featureCollection([displayLocked]) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
