import type { City, Coordinates, Passenger, TaxiJob } from '../models/game'
import { mapboxAccessToken } from '../config/mapbox'
import { BASE_JOB_DISTANCE_KM } from './companyProgression'
import { distanceKmBetween, taxiFareForDistance } from './jobEngine'
import { addJobsToJobJson, jobRouteSignature, readJobJson, type StoredJobRoute } from './jobJsonService'
import { isInsideTerritoryFeatures, resolveVillageTerritories, type VillageTerritoryCenter } from './territoryGeometry'

export const MIN_JOB_DISTANCE_KM = 6
/** Prefer nearby calls, but do not stop generating work after those routes are exhausted. */
export const PREFERRED_PICKUP_DISTANCE_KM = 5

const passengerNames = [
  'Aoife Murphy', 'Cian Kelly', 'Niamh Byrne', 'Oisín Walsh', 'Saoirse Doyle', 'Fionn Ryan',
  'Ella O’Brien', 'Jack McCarthy', 'Maya Khan', 'Noah Chen', 'Sofia Rossi', 'Daniel Silva',
]

interface MapboxPlace { id: string; name: string; coordinates: Coordinates }

interface MapboxFeature {
  geometry?: { coordinates?: unknown }
  properties?: { mapbox_id?: unknown; name?: unknown; full_address?: unknown }
}

const mapboxToken = mapboxAccessToken
/**
 * Search across the places a passenger might actually name. Searchbox also
 * returns useful non-POI features (addresses, streets, neighbourhoods and
 * localities), so requests intentionally do not restrict results to `poi`.
 */
export const placeSearches = [
  'restaurant', 'cafe', 'hotel', 'hostel', 'guest house', 'holiday rental', 'Airbnb',
  'supermarket', 'shop', 'shopping centre', 'market', 'convenience store',
  'airport', 'train station', 'bus station', 'ferry terminal', 'taxi rank', 'car park',
  'hospital', 'medical clinic', 'pharmacy', 'school', 'university', 'library',
  'office', 'business park', 'factory', 'warehouse', 'bank', 'post office',
  'park', 'forest', 'mountain', 'beach', 'lake', 'nature reserve', 'viewpoint',
  'landmark', 'tourist attraction', 'museum', 'monument', 'place of worship',
  'stadium', 'sports centre', 'cinema', 'theatre', 'nightclub', 'government office',
]
const RANDOM_LOCATIONS_PER_BOX = 12
const MAPBOX_REQUEST_INTERVAL_MS = 250
interface PlaceCacheEntry { loadedRadiusKm: number; places: MapboxPlace[]; pending?: Promise<void> }
const placeCache = new Map<string, PlaceCacheEntry>()

const isCoordinates = (value: unknown): value is Coordinates =>
  Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every((part) => typeof part === 'number' && Number.isFinite(part))

/** Resolve a pair of places to curbside stops connected by a drivable route. */
async function roadStops(from: Coordinates, to: Coordinates, signal?: AbortSignal) {
  try {
    const coordinates = `${from.join(',')};${to.join(',')}`
    const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&access_token=${mapboxToken}`, { signal })
    if (!response.ok) return null
    const result = await response.json() as { waypoints?: Array<{ location?: unknown }>; routes?: Array<{ geometry?: { coordinates?: unknown } }> }
    const pickup = result.waypoints?.[0]?.location
    const destination = result.waypoints?.[1]?.location
    const routeCoordinates = result.routes?.[0]?.geometry?.coordinates
    if (!isCoordinates(pickup) || !isCoordinates(destination) ||
      !Array.isArray(routeCoordinates) || routeCoordinates.length < 2 || !routeCoordinates.every(isCoordinates)) return null
    return {
      pickupRoad: [pickup[0], pickup[1]] as Coordinates,
      destinationRoad: [destination[0], destination[1]] as Coordinates,
      routeCoordinates: routeCoordinates.map((coordinate) => [coordinate[0], coordinate[1]] as Coordinates),
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    return null
  }
}

type BoundingBox = [west: number, south: number, east: number, north: number]

const boundingBoxAround = ([longitude, latitude]: Coordinates, radiusKm: number): BoundingBox => {
  const latitudeDelta = radiusKm / 110.574
  const longitudeDelta = radiusKm / (111.32 * Math.max(0.01, Math.cos(latitude * Math.PI / 180)))
  return [longitude - longitudeDelta, latitude - latitudeDelta, longitude + longitudeDelta, latitude + latitudeDelta]
}

/** Splits the newly unlocked square into non-overlapping boxes around the already cached square. */
const boxesForNewArea = (center: Coordinates, previousRadiusKm: number, radiusKm: number): BoundingBox[] => {
  const outer = boundingBoxAround(center, radiusKm)
  if (previousRadiusKm <= 0) return [outer]
  const inner = boundingBoxAround(center, previousRadiusKm)
  return [
    [outer[0], inner[3], outer[2], outer[3]],
    [outer[0], outer[1], outer[2], inner[1]],
    [outer[0], inner[1], inner[0], inner[3]],
    [inner[2], inner[1], outer[2], inner[3]],
  ]
}

/** Add unlabeled points from across the map so jobs are not limited to indexed businesses. */
const randomMapLocations = (city: City, boxes: BoundingBox[], previousRadiusKm: number, radiusKm: number): MapboxPlace[] =>
  boxes.flatMap((box, boxIndex) => Array.from({ length: RANDOM_LOCATIONS_PER_BOX }, (_, locationIndex) => {
    const longitude = box[0] + Math.random() * (box[2] - box[0])
    const latitude = box[1] + Math.random() * (box[3] - box[1])
    const coordinates: Coordinates = [longitude, latitude]
    const distanceFromBase = distanceKmBetween(city.coordinates, coordinates)
    if (distanceFromBase <= previousRadiusKm || distanceFromBase > radiusKm) return null
    return {
      id: `map-location:${city.id}:${longitude.toFixed(5)}:${latitude.toFixed(5)}`,
      name: `Map location near ${city.name} ${boxIndex + 1}-${locationIndex + 1}`,
      coordinates,
    }
  }).filter((place): place is MapboxPlace => place !== null))

const wait = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const onAbort = () => {
    clearTimeout(timeout)
    reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
  }
  const timeout = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort)
    resolve()
  }, milliseconds)
  signal?.addEventListener('abort', onAbort, { once: true })
})

async function fetchMapboxPlaces(city: City, previousRadiusKm: number, radiusKm: number, signal?: AbortSignal): Promise<MapboxPlace[]> {
  const responses: Array<{ features?: MapboxFeature[] }> = []
  const boxes = boxesForNewArea(city.coordinates, previousRadiusKm, radiusKm)
  for (const box of boxes) {
    for (const search of placeSearches) {
      const url = new URL('https://api.mapbox.com/search/searchbox/v1/forward')
      url.searchParams.set('q', search)
      url.searchParams.set('access_token', mapboxToken)
      url.searchParams.set('proximity', city.coordinates.join(','))
      url.searchParams.set('bbox', box.join(','))
      url.searchParams.set('country', city.countryCode)
      url.searchParams.set('limit', '10')
      url.searchParams.set('language', 'en')
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`Mapbox place search returned ${response.status}.`)
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.toLocaleLowerCase().includes('application/json')) throw new Error('Mapbox place search returned an invalid response.')
      responses.push(await response.json() as { features?: MapboxFeature[] })
      await wait(MAPBOX_REQUEST_INTERVAL_MS, signal)
    }
  }

  const indexedPlaces = responses.flatMap(({ features = [] }) => features.flatMap((feature): MapboxPlace[] => {
    const id = feature.properties?.mapbox_id
    const name = feature.properties?.name ?? feature.properties?.full_address
    const rawCoordinates = feature.geometry?.coordinates
    if (typeof id !== 'string' || typeof name !== 'string' || !isCoordinates(rawCoordinates)) return []
    const coordinates: Coordinates = [rawCoordinates[0], rawCoordinates[1]]
    const distanceFromBase = distanceKmBetween(city.coordinates, coordinates)
    return distanceFromBase > previousRadiusKm && distanceFromBase <= radiusKm
      ? [{ id, name: name.trim(), coordinates }]
      : []
  }))
  const places = [...indexedPlaces, ...randomMapLocations(city, boxes, previousRadiusKm, radiusKm)]
  return [...new Map(places.map((place) => [place.id, place])).values()]
}

async function findMapboxPlaces(city: City, radiusKm: number, signal?: AbortSignal) {
  const cacheKey = `${city.id}:${city.coordinates.join(',')}`
  const cached = placeCache.get(cacheKey) ?? { loadedRadiusKm: 0, places: [] }
  placeCache.set(cacheKey, cached)

  if (cached.loadedRadiusKm < radiusKm) {
    const load = async () => {
      if (cached.loadedRadiusKm >= radiusKm) return
      const previousRadiusKm = cached.loadedRadiusKm
      const additions = await fetchMapboxPlaces(city, previousRadiusKm, radiusKm, signal)
      cached.places = [...new Map([...cached.places, ...additions].map((place) => [place.id, place])).values()]
      cached.loadedRadiusKm = radiusKm
    }
    const queuedLoad = (cached.pending ?? Promise.resolve()).then(load)
    cached.pending = queuedLoad
    try { await queuedLoad } finally {
      if (cached.pending === queuedLoad) cached.pending = undefined
    }
  } else if (cached.pending) {
    await cached.pending
  }

  const unlockedPlaces = cached.places.filter((place) => distanceKmBetween(city.coordinates, place.coordinates) <= radiusKm)
  if (unlockedPlaces.length < 2) throw new Error(`Mapbox could not find enough real places within ${radiusKm} km of ${city.name}.`)
  return unlockedPlaces
}

const shuffled = <T,>(values: T[]) => values
  .map((value) => ({ value, order: Math.random() }))
  .sort((left, right) => left.order - right.order)
  .map(({ value }) => value)

/** Uses indexed places plus ordinary map coordinates; no AI or game backend is involved. */
export async function generateJobOffers(
  city: City,
  count: number,
  excludedRoutes: string[],
  maxDistanceKm = BASE_JOB_DISTANCE_KM,
  signal?: AbortSignal,
  taxiPositions: Coordinates[] = [city.coordinates],
  fareMultiplier = 1,
  territoryCenters: VillageTerritoryCenter[] = [{ id: city.id, coordinates: city.coordinates }],
): Promise<{ jobs: TaxiJob[]; passengers: Passenger[]; signatures: string[] }> {
  const excluded = new Set(excludedRoutes)
  // Use the exact OSM/fallback polygons rendered by GameMap. Previously this
  // used only synthetic polygons, allowing calls to appear in visibly locked
  // land whenever Mapbox displayed a real administrative village boundary.
  const ownedTerritories = await resolveVillageTerritories(territoryCenters)
  const isUnlocked = (coordinates: Coordinates) => isInsideTerritoryFeatures(coordinates, ownedTerritories)
  let routes: Array<{ pickup: MapboxPlace; destination: MapboxPlace; distanceKm: number; signature: string; stored?: StoredJobRoute }>
  try {
    const places = await findMapboxPlaces(city, maxDistanceKm, signal)
    const uniqueRoutes = new Map<string, (typeof routes)[number] & { pickupDistanceKm: number }>()
    for (const pickup of places) for (const destination of places) {
      const distanceKm = Math.round(distanceKmBetween(pickup.coordinates, destination.coordinates) * 10) / 10
      const signature = jobRouteSignature(pickup.name, destination.name)
      const pickupDistanceKm = Math.min(...taxiPositions.map((position) => distanceKmBetween(position, pickup.coordinates)))
      if (pickup.id !== destination.id &&
        isUnlocked(pickup.coordinates) && isUnlocked(destination.coordinates) &&
        pickupDistanceKm <= maxDistanceKm &&
        distanceKmBetween(city.coordinates, pickup.coordinates) <= maxDistanceKm &&
        distanceKmBetween(city.coordinates, destination.coordinates) <= maxDistanceKm &&
        distanceKm >= MIN_JOB_DISTANCE_KM && distanceKm <= maxDistanceKm &&
        !excluded.has(signature) && !uniqueRoutes.has(signature)) {
        uniqueRoutes.set(signature, { pickup, destination, distanceKm, signature, pickupDistanceKm })
      }
    }
    // Keep the old 5 km behaviour as a preference rather than a hard gate.
    // Once nearby route signatures have been used, calls farther inside the
    // unlocked service area can still keep an idle taxi working.
    routes = shuffled([...uniqueRoutes.values()]).sort((left, right) =>
      Number(left.pickupDistanceKm > PREFERRED_PICKUP_DISTANCE_KM) - Number(right.pickupDistanceKm > PREFERRED_PICKUP_DISTANCE_KM)
      || left.pickupDistanceKm - right.pickupDistanceKm)
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    // A Mapbox/API error is not proof that the device is offline. Reusing a
    // stored mission here made online refreshes silently serve JSON routes
    // whenever live generation failed. Only use the offline cache when the
    // browser explicitly reports that there is no network connection.
    if (typeof navigator === 'undefined' || navigator.onLine) throw error
    routes = shuffled(readJobJson().routes.flatMap((stored) => {
      const signature = jobRouteSignature(stored.pickupLabel, stored.destinationLabel)
      return stored.cityId === city.id && !excluded.has(signature) &&
        isUnlocked(stored.pickup) && isUnlocked(stored.destination) &&
        taxiPositions.some((position) => distanceKmBetween(position, stored.pickup) <= maxDistanceKm) &&
        distanceKmBetween(city.coordinates, stored.pickup) <= maxDistanceKm &&
        distanceKmBetween(city.coordinates, stored.destination) <= maxDistanceKm &&
        stored.distanceKm >= MIN_JOB_DISTANCE_KM && stored.distanceKm <= maxDistanceKm
        ? [{ pickup: { id: signature, name: stored.pickupLabel, coordinates: stored.pickup }, destination: { id: signature, name: stored.destinationLabel, coordinates: stored.destination }, distanceKm: stored.distanceKm, signature, stored }]
        : []
    })).slice(0, count)
  }

  if (!routes.length) throw new Error('No new routes were found inside the available taxis\' service area.')

  const resolvedRoutes: Array<(typeof routes)[number] & { stops: NonNullable<Awaited<ReturnType<typeof roadStops>>> }> = []
  for (const route of routes) {
    const stops = route.stored
      ? { pickupRoad: route.stored.pickupRoad ?? route.pickup.coordinates, destinationRoad: route.stored.destinationRoad ?? route.destination.coordinates, routeCoordinates: route.stored.routeCoordinates ?? [route.stored.pickup, route.stored.destination] }
      : await roadStops(route.pickup.coordinates, route.destination.coordinates, signal)
    if (!stops) continue
    if (!isUnlocked(stops.pickupRoad) || !isUnlocked(stops.destinationRoad)) continue
    resolvedRoutes.push({ ...route, stops })
    if (resolvedRoutes.length >= count) break
  }
  if (!resolvedRoutes.length) throw new Error('No drivable routes were found. Try refreshing the available jobs.')

  const passengers = resolvedRoutes.map(() => ({
    id: crypto.randomUUID(),
    name: passengerNames[Math.floor(Math.random() * passengerNames.length)],
    partySize: 1 + Math.floor(Math.random() * 4),
  }))
  const offeredAt = new Date().toISOString()
  const jobs = resolvedRoutes.map((route, index): TaxiJob => ({
    id: crypto.randomUUID(), cityId: city.id,
    pickup: route.pickup.coordinates, destination: route.destination.coordinates,
    pickupRoad: route.stops.pickupRoad, destinationRoad: route.stops.destinationRoad,
    routeCoordinates: route.stops.routeCoordinates,
    pickupLabel: route.pickup.name, destinationLabel: route.destination.name,
    passengerIds: [passengers[index].id], fare: Math.round(taxiFareForDistance(route.distanceKm) * fareMultiplier * 100) / 100,
    distanceKm: route.distanceKm, durationMinutes: route.stored?.durationMinutes ?? Math.max(5, Math.round(route.distanceKm * 3.2)), status: 'offered', offeredAt,
  }))

  addJobsToJobJson(jobs)

  return {
    jobs,
    passengers,
    signatures: resolvedRoutes.map((route) => route.signature),
  }
}
