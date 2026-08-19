import type { City, Coordinates, Passenger, TaxiJob } from '../models/game'
import { distanceKmBetween, taxiFareForDistance } from './jobEngine'

export const MIN_JOB_DISTANCE_KM = 6
export const MAX_JOB_DISTANCE_KM = 100
const MAX_PLACE_DISTANCE_FROM_CITY_KM = 100

const passengerNames = [
  'Aoife Murphy', 'Cian Kelly', 'Niamh Byrne', 'Oisín Walsh', 'Saoirse Doyle', 'Fionn Ryan',
  'Ella O’Brien', 'Jack McCarthy', 'Maya Khan', 'Noah Chen', 'Sofia Rossi', 'Daniel Silva',
]

interface MapboxPlace { id: string; name: string; coordinates: Coordinates }

interface MapboxFeature {
  geometry?: { coordinates?: unknown }
  properties?: { mapbox_id?: unknown; name?: unknown; full_address?: unknown }
}

const configuredToken = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim()
const mapboxToken = configuredToken && !configuredToken.includes('your_public_mapbox_token') ? configuredToken : undefined
const placeSearches = ['airport', 'train station', 'hotel', 'hospital', 'shopping centre', 'museum', 'university', 'stadium', 'tourist attraction', 'restaurant']
const placeCache = new Map<string, Promise<MapboxPlace[]>>()

const isCoordinates = (value: unknown): value is Coordinates =>
  Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every((part) => typeof part === 'number' && Number.isFinite(part))

async function fetchMapboxPlaces(city: City, signal?: AbortSignal): Promise<MapboxPlace[]> {
  if (!mapboxToken) throw new Error('Add VITE_MAPBOX_ACCESS_TOKEN to .env, then rebuild the app to find taxi requests.')

  const responses = await Promise.all(placeSearches.map(async (search) => {
    const url = new URL('https://api.mapbox.com/search/searchbox/v1/forward')
    url.searchParams.set('q', `${search} in ${city.name}`)
    url.searchParams.set('access_token', mapboxToken)
    url.searchParams.set('proximity', city.coordinates.join(','))
    url.searchParams.set('country', city.countryCode)
    url.searchParams.set('types', 'poi')
    url.searchParams.set('limit', '10')
    url.searchParams.set('language', 'en')
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Mapbox place search returned ${response.status}.`)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLocaleLowerCase().includes('application/json')) throw new Error('Mapbox place search returned an invalid response.')
    return response.json() as Promise<{ features?: MapboxFeature[] }>
  }))

  const places = responses.flatMap(({ features = [] }) => features.flatMap((feature): MapboxPlace[] => {
    const id = feature.properties?.mapbox_id
    const name = feature.properties?.name ?? feature.properties?.full_address
    const rawCoordinates = feature.geometry?.coordinates
    if (typeof id !== 'string' || typeof name !== 'string' || !isCoordinates(rawCoordinates)) return []
    const coordinates: Coordinates = [rawCoordinates[0], rawCoordinates[1]]
    return distanceKmBetween(city.coordinates, coordinates) <= MAX_PLACE_DISTANCE_FROM_CITY_KM
      ? [{ id, name: name.trim(), coordinates }]
      : []
  }))
  const unique = [...new Map(places.map((place) => [place.id, place])).values()]
  if (unique.length < 2) throw new Error(`Mapbox could not find enough real places near ${city.name}.`)
  return unique
}

function findMapboxPlaces(city: City, signal?: AbortSignal) {
  const cached = placeCache.get(city.id)
  if (cached) return cached
  const request = fetchMapboxPlaces(city, signal).catch((error) => {
    placeCache.delete(city.id)
    throw error
  })
  placeCache.set(city.id, request)
  return request
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
  signal?: AbortSignal
): Promise<{ jobs: TaxiJob[]; passengers: Passenger[]; signatures: string[] }> {
  const places = await findMapboxPlaces(city, signal)
  const excluded = new Set(excludedRoutes)
  const routes = shuffled(places.flatMap((pickup) => places.flatMap((destination) => {
    const distanceKm = Math.round(distanceKmBetween(pickup.coordinates, destination.coordinates) * 10) / 10
    const signature = routeSignature(pickup.name, destination.name)
    return pickup.id !== destination.id &&
      distanceKm >= MIN_JOB_DISTANCE_KM && distanceKm <= MAX_JOB_DISTANCE_KM &&
      !excluded.has(signature)
      ? [{ pickup, destination, distanceKm, signature }]
      : []
  }))).slice(0, count)

  if (!routes.length) throw new Error('No new local routes are available yet. Complete a journey and try again.')

  const passengers = routes.map(() => ({
    id: crypto.randomUUID(),
    name: passengerNames[Math.floor(Math.random() * passengerNames.length)],
    partySize: 1 + Math.floor(Math.random() * 4),
  }))
  const jobs = routes.map((route, index): TaxiJob => ({
    id: crypto.randomUUID(), cityId: city.id,
    pickup: route.pickup.coordinates, destination: route.destination.coordinates,
    pickupLabel: route.pickup.name, destinationLabel: route.destination.name,
    passengerIds: [passengers[index].id], fare: taxiFareForDistance(route.distanceKm),
    distanceKm: route.distanceKm, durationMinutes: Math.max(5, Math.round(route.distanceKm * 3.2)), status: 'offered',
  }))

  return {
    jobs,
    passengers,
    signatures: routes.map((route) => route.signature),
  }
}
