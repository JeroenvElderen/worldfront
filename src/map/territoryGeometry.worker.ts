import { featureCollection } from "@turf/helpers";
import { lockedTerritoryMask, mergeVillageTerritories } from "../services/territoryGeometry";

self.onmessage = (event: MessageEvent<{ id: number; territories: Parameters<typeof mergeVillageTerritories>[0] }>) => {
  const { id, territories } = event.data;
  try {
    const unlocked = mergeVillageTerritories(territories);
    self.postMessage({ id, coverage: featureCollection(unlocked ? [unlocked] : []), locked: featureCollection([lockedTerritoryMask(unlocked)]) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
