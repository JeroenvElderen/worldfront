import type { City, Coordinates, Passenger, ServiceType, TaxiJob } from '../models/game'
import { mapboxAccessToken } from '../config/mapbox'
import { BASE_JOB_DISTANCE_KM } from './companyProgression'
import { distanceKmBetween, taxiFareForDistance } from './jobEngine'

export const MIN_JOB_DISTANCE_KM = 6
export const MAX_PICKUP_DISTANCE_KM = 5

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
const placeSearches = ['airport', 'train station', 'hotel', 'hospital', 'shopping centre', 'museum', 'university', 'stadium', 'tourist attraction', 'restaurant']
const MAPBOX_REQUEST_INTERVAL_MS = 250
interface PlaceCacheEntry { loadedRadiusKm: number; places: MapboxPlace[]; pending?: Promise<void> }
const placeCache = new Map<string, PlaceCacheEntry>()

const isCoordinates = (value: unknown): value is Coordinates =>
  Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every((part) => typeof part === 'number' && Number.isFinite(part))

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
      url.searchParams.set('types', 'poi')
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

  const places = responses.flatMap(({ features = [] }) => features.flatMap((feature): MapboxPlace[] => {
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

const routeSignature = (pickup: string, destination: string) =>
  `${pickup.trim().toLocaleLowerCase()}→${destination.trim().toLocaleLowerCase()}`

const shuffled = <T,>(values: T[]) => values
  .map((value) => ({ value, order: Math.random() }))
  .sort((left, right) => left.order - right.order)
  .map(({ value }) => value)

/** Uses Mapbox-grounded places and an on-device selector; no AI or game backend is involved. */
export async function generateJobOffers(
  city: City,
  count: number,
  excludedRoutes: string[],
  maxDistanceKm = BASE_JOB_DISTANCE_KM,
  signal?: AbortSignal,
  taxiPositions: Coordinates[] = [city.coordinates],
  fareMultiplier = 1,
  serviceType: ServiceType = 'taxi'
): Promise<{ jobs: TaxiJob[]; passengers: Passenger[]; signatures: string[] }> {
  const places = await findMapboxPlaces(city, maxDistanceKm, signal)
  const excluded = new Set(excludedRoutes)
  const routes = shuffled(places.flatMap((pickup) => places.flatMap((destination) => {
    const distanceKm = Math.round(distanceKmBetween(pickup.coordinates, destination.coordinates) * 10) / 10
    const signature = routeSignature(pickup.name, destination.name)
    return pickup.id !== destination.id &&
      taxiPositions.every((position) => distanceKmBetween(position, pickup.coordinates) <= MAX_PICKUP_DISTANCE_KM) &&
      distanceKmBetween(city.coordinates, pickup.coordinates) <= maxDistanceKm &&
      distanceKmBetween(city.coordinates, destination.coordinates) <= maxDistanceKm &&
      distanceKm >= MIN_JOB_DISTANCE_KM && distanceKm <= maxDistanceKm &&
      !excluded.has(signature)
      ? [{ pickup, destination, distanceKm, signature }]
      : []
  }))).slice(0, count)

  if (!routes.length) throw new Error(`No new routes have a pickup within ${MAX_PICKUP_DISTANCE_KM} km of every available taxi. Try again when your taxis are closer together.`)

  const passengers = serviceType === 'taxi' ? routes.map(() => ({
    id: crypto.randomUUID(),
    name: passengerNames[Math.floor(Math.random() * passengerNames.length)],
    partySize: 1 + Math.floor(Math.random() * 4),
  })) : []
  const serviceLabels: Record<ServiceType, string> = {
    taxi: 'Passenger', bicycle: 'Express document', food: 'Restaurant order', parcel: 'Parcel delivery',
    accessible: 'Accessible passenger', rental: 'Vehicle transfer', shuttle: 'Shuttle group', travel: 'Tour group',
  }
  const serviceRates: Record<ServiceType, number> = { taxi: 1, bicycle: .8, food: 1, parcel: 1.8, accessible: 2.2, rental: 2, shuttle: 3.5, travel: 5 }
  const offeredAt = new Date().toISOString()
  const jobs = routes.map((route, index): TaxiJob => ({
    id: crypto.randomUUID(), cityId: city.id, serviceType, customerLabel: serviceLabels[serviceType],
    pickup: route.pickup.coordinates, destination: route.destination.coordinates,
    pickupLabel: route.pickup.name, destinationLabel: route.destination.name,
    passengerIds: passengers[index] ? [passengers[index].id] : [], fare: Math.round(taxiFareForDistance(route.distanceKm) * serviceRates[serviceType] * fareMultiplier * 100) / 100,
    distanceKm: route.distanceKm, durationMinutes: Math.max(5, Math.round(route.distanceKm * 3.2)), status: 'offered', offeredAt,
  }))

  return {
    jobs,
    passengers,
    signatures: routes.map((route) => route.signature),
  }
}
