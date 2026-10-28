import { featureCollection, lineString, polygon } from '@turf/helpers'
import { bbox, booleanPointInPolygon, buffer, circle, difference, simplify, union } from '@turf/turf'
import type { Coordinates, TerritoryFeature, TerritoryGeometry } from '../models/game'

const EARTH_KM_PER_LATITUDE_DEGREE = 110.574
export const VILLAGE_TERRITORY_RADIUS_KM = 6
// Reveal only a narrow corridor beside roads actually travelled.
// This radius applies to live taxi exploration and completed-trip backfill;
// manually purchased village territory retains its separate 6 km radius.
export const TAXI_DISCOVERY_RADIUS_KM = 0.15

export interface VillageTerritoryCenter { id: string; coordinates: Coordinates; routeCoordinates?: Coordinates[]; source?: 'village' | 'starting-station' | 'taxi-discovery' | 'ferry-discovery'; radiusKm?: number }
export type { TerritoryFeature } from '../models/game'

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
  buffer(lineString(route, { id, unlocked: true }), radiusKm, { steps: 8, units: 'kilometers' }) as TerritoryFeature

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

/** Add one completed route to compact persisted exploration coverage. */
export const extendExploredTerritory = (
  existing: TerritoryFeature | null,
  route: Coordinates[],
  id = 'taxi-exploration',
) => {
  if (route.length < 2) return existing
  const discovery = taxiDiscoveryRouteTerritory(id, route)
  const merged = mergeVillageTerritories(existing ? [existing, discovery] : [discovery])
  if (!merged) return existing
  const optimized = simplify(merged, { tolerance: .000001, highQuality: false }) as TerritoryFeature
  return { ...optimized, properties: { id: 'taxi-exploration', unlocked: true as const } }
}

/** Merge all continuous segments of a completed journey in one union pass.
 * This avoids repeatedly unioning and simplifying the entire explored map.
 */
export const extendExploredTerritorySegments = (
  existing: TerritoryFeature | null,
  segments: Coordinates[][],
  id = 'taxi-exploration',
): TerritoryFeature | null => {
  const valid = segments.filter((segment) => segment.length >= 2)
  if (!valid.length) return existing
  const discoveries = valid.map((segment, index) => taxiDiscoveryRouteTerritory(`${id}-${index}`, segment))
  const merged = mergeVillageTerritories([...(existing ? [existing] : []), ...discoveries])
  if (!merged) return existing
  const optimized = simplify(merged, { tolerance: .000001, highQuality: false }) as TerritoryFeature
  return { ...optimized, properties: { id: 'taxi-exploration', unlocked: true as const } }
}

/** One-time migration for saves that persisted every historical taxi route. */
export const compactLegacyDiscoveries = (
  existing: TerritoryFeature | null | undefined,
  discoveries: Array<{ id: string; coordinates: Coordinates; routeCoordinates?: Coordinates[]; radiusKm?: number }>,
) => {
  if (!discoveries.length) return existing ?? null
  const legacy = appendDiscoveriesToTerritory([], discoveries)
  const merged = mergeVillageTerritories([...(existing ? [existing] : []), ...(legacy ? [legacy] : [])])
  if (!merged) return existing ?? null
  const optimized = simplify(merged, { tolerance: .000001, highQuality: false }) as TerritoryFeature
  return { ...optimized, properties: { id: 'taxi-exploration', unlocked: true as const } }
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
    center.source === 'starting-station'
      ? villageTerritory(center.id, center.coordinates, 0.35)
      : center.source === 'taxi-discovery'
      ? center.routeCoordinates && center.routeCoordinates.length >= 2
        ? taxiDiscoveryRouteTerritory(center.id, center.routeCoordinates, center.radiusKm)
        : taxiDiscoveryTerritory(center.id, center.coordinates, center.radiusKm)
      : center.source === 'ferry-discovery'
        ? center.routeCoordinates && center.routeCoordinates.length >= 2
          ? taxiDiscoveryRouteTerritory(center.id, center.routeCoordinates, center.radiusKm)
          : taxiDiscoveryTerritory(center.id, center.coordinates, center.radiusKm)
      : await realVillageTerritory(center.id, center.coordinates)
        ?? villageTerritory(center.id, center.coordinates, VILLAGE_TERRITORY_RADIUS_KM)))

/** Bounding boxes are cached by feature identity, not by id: completed routes
 * can replace the geometry of an existing discovery without changing its id.
 * WeakMap entries disappear when their geometry is no longer referenced.
 */
const territoryBounds = new WeakMap<TerritoryFeature, [number, number, number, number]>()
const boundsForTerritory = (territory: TerritoryFeature): [number, number, number, number] => {
  const cached = territoryBounds.get(territory)
  if (cached) return cached
  const bounds = bbox(territory) as [number, number, number, number]
  territoryBounds.set(territory, bounds)
  return bounds
}

/** Reject points outside the bounding box before expensive polygon checks.
 * The polygon test remains authoritative, preserving holes and islands.
 */
export const isInsideTerritoryFeatures = (coordinates: Coordinates, territories: TerritoryFeature[]) =>
  territories.some((territory) => {
    const [west, south, east, north] = boundsForTerritory(territory)
    return coordinates[0] >= west && coordinates[0] <= east &&
      coordinates[1] >= south && coordinates[1] <= north &&
      booleanPointInPolygon(coordinates, territory)
  })

/** A red world overlay with the purchased territory cut out as transparent holes. */
export const lockedTerritoryMask = (unlocked: ReturnType<typeof mergeVillageTerritories>) => {
  const worldRing: Coordinates[] = [[-179.9, -85], [179.9, -85], [179.9, 85], [-179.9, 85], [-179.9, -85]]
  const world = polygon([worldRing], { locked: true })
  if (!unlocked) return world

  // Subtract the actual union geometry rather than constructing one world
  // polygon with hand-written holes. The latter drops interior rings of
  // explored polygons and incorrectly reveals enclosed, untravelled islands.
  // Turf preserves all nested holes and disconnected components.
  return difference(featureCollection([world, { ...unlocked, properties: { locked: true } }])) ?? world
}
