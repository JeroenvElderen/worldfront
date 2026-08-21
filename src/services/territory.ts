import { booleanIntersects, booleanPointInPolygon, union } from '@turf/turf'
import { featureCollection, point } from '@turf/helpers'
import { townBoundaries } from '../data/townBoundaries'
import type { Coordinates } from '../models/game'

export type TerritoryPolygon = NonNullable<ReturnType<typeof union>>

export const getTownBoundary = (townId: string) => townBoundaries[townId]

/** Turf union removes internal borders so adjacent purchases act as one territory. */
export function combineTownBoundaries(townIds: string[]): TerritoryPolygon | null {
  const polygons = townIds.flatMap((id) => townBoundaries[id] ? [townBoundaries[id]] : [])
  if (!polygons.length) return null
  if (polygons.length === 1) return polygons[0] as TerritoryPolygon
  return union(featureCollection(polygons))
}

export const isInsideTerritory = (coordinates: Coordinates, territory: TerritoryPolygon) =>
  booleanPointInPolygon(point(coordinates), territory)

export const isTownAdjacentToTerritory = (townId: string, ownedTownIds: string[]) => {
  const candidate = getTownBoundary(townId)
  const owned = combineTownBoundaries(ownedTownIds)
  return Boolean(candidate && owned && booleanIntersects(candidate, owned))
}
