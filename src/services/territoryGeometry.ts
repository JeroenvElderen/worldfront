import { featureCollection, lineString, polygon } from '@turf/helpers'
import { booleanPointInPolygon, buffer, circle, simplify, union } from '@turf/turf'
import type { Coordinates } from '../models/game'

const EARTH_KM_PER_LATITUDE_DEGREE = 110.574
export const VILLAGE_TERRITORY_RADIUS_KM = 6
// Keep route discovery local without creating the excessive checkpoint and
// save-data volume that a street-scale 100 m radius would require.
export const TAXI_DISCOVERY_RADIUS_KM = 1

export interface VillageTerritoryCenter { id: string; coordinates: Coordinates; routeCoordinates?: Coordinates[]; source?: 'village' | 'taxi-discovery'; radiusKm?: number }
type TerritoryGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
export type TerritoryFeature = {
  type: 'Feature'
  geometry: TerritoryGeometry
  properties: { id: string; unlocked: true; source?: 'openstreetmap' }
}

const realBoundaryCache = new Map<string, Promise<TerritoryFeature | null>>()

/**
 * Resolve the administrative boundary containing a territory's coordinates.
 * Nominatim returns the actual OpenStreetMap relation geometry when one exists;
 * callers retain the generated territory as a fallback for unmapped places or
 * when the boundary service is unavailable.
 */
export const realVillageTerritory = (id: string, [longitude, latitude]: Coordinates) => {
  const cacheKey = `${longitude.toFixed(5)},${latitude.toFixed(5)}`
  const cached = realBoundaryCache.get(cacheKey)
  if (cached) return cached

  const request = (async (): Promise<TerritoryFeature | null> => {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse')
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('lat', String(latitude))
      url.searchParams.set('lon', String(longitude))
      url.searchParams.set('zoom', '14')
      url.searchParams.set('addressdetails', '0')
      url.searchParams.set('polygon_geojson', '1')
      const response = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      if (!response.ok) return null
      const geometry = (await response.json() as { geojson?: TerritoryGeometry }).geojson
      if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return null
      return { type: 'Feature', geometry, properties: { id, unlocked: true, source: 'openstreetmap' } }
    } catch {
      return null
    }
  })()
  realBoundaryCache.set(cacheKey, request)
  return request
}

const hash = (value: string) => {
  let result = 2166136261
  for (const character of value) {
    result ^= character.charCodeAt(0)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

/** A stable pseudo-random value, so a village keeps the same border after reloading. */
const noise = (seed: number, index: number) => {
  let value = seed + Math.imul(index + 1, 0x6d2b79f5)
  value = Math.imul(value ^ value >>> 15, value | 1)
  value ^= value + Math.imul(value ^ value >>> 7, value | 61)
  return ((value ^ value >>> 14) >>> 0) / 4294967296
}

/**
 * Creates an organic service territory around a settlement. It deliberately uses
 * uneven sectors rather than a buffer, making expansion resemble neighboring
 * village borders instead of perfect station-radius circles.
 */
export const villageTerritory = (id: string, center: Coordinates, radiusKm: number): TerritoryFeature => {
  const seed = hash(id)
  const sectorCount = 18
  const [longitude, latitude] = center
  const longitudeKmPerDegree = 111.32 * Math.max(.15, Math.cos(latitude * Math.PI / 180))
  const points: Coordinates[] = Array.from({ length: sectorCount }, (_, index) => {
    const angleJitter = (noise(seed, index * 2) - .5) * .16
    const angle = index / sectorCount * Math.PI * 2 + angleJitter
    const neighboringNoise = (noise(seed, index * 2 + 1) + noise(seed, ((index + 1) % sectorCount) * 2 + 1)) / 2
    const distanceKm = radiusKm * (.72 + neighboringNoise * .42)
    return [
      longitude + Math.cos(angle) * distanceKm / longitudeKmPerDegree,
      latitude + Math.sin(angle) * distanceKm / EARTH_KM_PER_LATITUDE_DEGREE,
    ]
  })
  points.push(points[0])
  return polygon([points], { id, unlocked: true })
}

/** A taxi permanently discovers a circular area around each travelled checkpoint. */
export const taxiDiscoveryTerritory = (id: string, center: Coordinates, radiusKm = TAXI_DISCOVERY_RADIUS_KM): TerritoryFeature =>
  circle(center, radiusKm, { steps: 24, units: 'kilometers', properties: { id, unlocked: true } }) as TerritoryFeature

/** Treat one completed taxi journey as one buffered territory checkpoint. */
export const taxiDiscoveryRouteTerritory = (id: string, route: Coordinates[], radiusKm = TAXI_DISCOVERY_RADIUS_KM): TerritoryFeature =>
  buffer(simplify(lineString(route, { id, unlocked: true }), { tolerance: .0001, highQuality: false }), radiusKm, { steps: 8, units: 'kilometers' }) as TerritoryFeature

export const mergeVillageTerritories = (territories: TerritoryFeature[]) => {
  if (!territories.length) return null
  if (territories.length === 1) return territories[0]
  return union(featureCollection(territories)) as TerritoryFeature | null
}

/**
 * Fold completed taxi discoveries into the owned territory geometry. The map
 * renders only this combined result, never the individual discovery buffers.
 */
export const appendDiscoveriesToTerritory = (
  ownedTerritories: TerritoryFeature[],
  discoveries: Array<{ id: string; coordinates: Coordinates; routeCoordinates?: Coordinates[]; radiusKm?: number }>,
) => {
  // Build discoveries from the current state on every territory update. A
  // discovery can retain its id while its route is replaced with the final
  // Mapbox route, so caching by id can otherwise leave setData() with stale
  // geometry until the application is reloaded and the cache is rebuilt.
  const discoveryTerritories = discoveries.map((discovery) =>
    discovery.routeCoordinates && discovery.routeCoordinates.length >= 2
      ? taxiDiscoveryRouteTerritory(discovery.id, discovery.routeCoordinates, discovery.radiusKm)
      : taxiDiscoveryTerritory(discovery.id, discovery.coordinates, discovery.radiusKm)
  )
  const discoveryTerritory = mergeVillageTerritories(discoveryTerritories)
  return mergeVillageTerritories([...ownedTerritories, ...(discoveryTerritory ? [discoveryTerritory] : [])])
}

/** True when a location belongs to at least one purchased village territory. */
export const isInsideVillageTerritories = (coordinates: Coordinates, centers: VillageTerritoryCenter[]) =>
  centers.some((center) => booleanPointInPolygon(
    coordinates,
    villageTerritory(center.id, center.coordinates, VILLAGE_TERRITORY_RADIUS_KM),
  ))

/**
 * Resolve the same territory features displayed by the map. Job generation must
 * use these rather than only the generated fallbacks, otherwise an OSM village
 * border can be visible while offers are tested against a different polygon.
 */
export const resolveVillageTerritories = async (centers: VillageTerritoryCenter[]) =>
  Promise.all(centers.map(async (center) =>
    center.source === 'taxi-discovery'
      ? center.routeCoordinates && center.routeCoordinates.length >= 2
        ? taxiDiscoveryRouteTerritory(center.id, center.routeCoordinates, center.radiusKm)
        : taxiDiscoveryTerritory(center.id, center.coordinates, center.radiusKm)
      : await realVillageTerritory(center.id, center.coordinates)
        ?? villageTerritory(center.id, center.coordinates, VILLAGE_TERRITORY_RADIUS_KM)))

/** True when a location belongs to one of the supplied map territory features. */
export const isInsideTerritoryFeatures = (coordinates: Coordinates, territories: TerritoryFeature[]) =>
  territories.some((territory) => booleanPointInPolygon(coordinates, territory))

/** A red world overlay with the purchased territory cut out as transparent holes. */
export const lockedTerritoryMask = (unlocked: ReturnType<typeof mergeVillageTerritories>) => {
  const worldRing: Coordinates[] = [[-179.9, -85], [179.9, -85], [179.9, 85], [-179.9, 85], [-179.9, -85]]
  if (!unlocked) return polygon([worldRing], { locked: true })
  // GeoJSON interior rings must wind in the opposite direction to their outer
  // ring. Village territories wind counter-clockwise, just like worldRing, so
  // passing them through unchanged makes Mapbox fill them instead of treating
  // them as transparent unlocked areas.
  const holes = unlocked.geometry.type === 'Polygon'
    ? [unlocked.geometry.coordinates[0].slice().reverse() as Coordinates[]]
    : unlocked.geometry.coordinates.map((part: number[][][]) => part[0].slice().reverse() as Coordinates[])
  return polygon([worldRing, ...holes], { locked: true })
}
