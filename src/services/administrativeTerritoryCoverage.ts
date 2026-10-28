import { area, intersect, featureCollection } from '@turf/turf'
import type { TerritoryFeature } from '../models/game'
import type { AdministrativeBoundaries } from './administrativeBoundaries'
import type { RegionRoadCoverage } from './administrativeProgression'

/** Recalculate only after the discovered polygon changes, never per map frame. */
export function calculateAdministrativeTerritoryCoverage(
  boundaries: AdministrativeBoundaries,
  discovered: TerritoryFeature | null,
): RegionRoadCoverage[] {
  if (!discovered) return boundaries.features.map((feature) => ({
    regionId: feature.properties.gameRegionId, eligibleRoadKm: 0, exploredRoadKm: 0,
    inventoryComplete: true, eligibleAreaKm2: area(feature) / 1e6, exploredAreaKm2: 0,
  }))
  return boundaries.features.map((feature) => {
    const eligibleAreaKm2 = area(feature) / 1e6
    let exploredAreaKm2 = 0
    try {
      const clipped = intersect(featureCollection([feature, discovered] as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]))
      if (clipped) exploredAreaKm2 = Math.min(eligibleAreaKm2, area(clipped) / 1e6)
    } catch (error) {
      // Invalid upstream geometry must never grant free exploration credits.
      console.warn('Unable to intersect administrative region', feature.properties.gameRegionId, error)
    }
    return {
      regionId: feature.properties.gameRegionId,
      eligibleRoadKm: 0, exploredRoadKm: 0, inventoryComplete: true,
      eligibleAreaKm2, exploredAreaKm2,
    }
  })
}
