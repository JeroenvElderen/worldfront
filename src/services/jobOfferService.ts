import type { City, Coordinates, Passenger, TaxiJob } from '../models/game'
import { createPassengerStory } from './operationsIncidents'
import { BASE_JOB_DISTANCE_KM } from './companyProgression'
import { distanceKmBetween, taxiFareForDistance } from './jobEngine'
import { addJobsToJobJson, jobRouteSignature, readJobJson, type StoredJobRoute } from './jobJsonService'
import { resolveRoadRoute } from './roadRoutes'
import { area, bbox, booleanPointInPolygon, pointOnFeature } from '@turf/turf'
import { polygon } from '@turf/helpers'
import { isInsideTerritoryFeatures, mergeVillageTerritories, resolveVillageTerritories, type TerritoryFeature, type VillageTerritoryCenter } from './territoryGeometry'

// Short local trips keep the board useful even when the player's first owned
// village has a compact administrative boundary.
export const MIN_JOB_DISTANCE_KM = 1
const passengerNames = [
  'Aoife Murphy', 'Cian Kelly', 'Niamh Byrne', 'Oisín Walsh', 'Saoirse Doyle', 'Fionn Ryan',
  'Ella O’Brien', 'Jack McCarthy', 'Maya Khan', 'Noah Chen', 'Sofia Rossi', 'Daniel Silva',
]

interface MapboxPlace { id: string; name: string; coordinates: Coordinates }

const RANDOM_LOCATIONS_PER_OFFER = 32

// New jobs should begin close to the taxi that generated the offer.
export const MAX_PICKUP_DISTANCE_KM = 2

/** Resolve a pair of places to curbside stops connected by a drivable route. */
async function roadStops(from: Coordinates, to: Coordinates, signal?: AbortSignal) {
  try {
    const route = await resolveRoadRoute(from, to, signal, ['driving'])
    if (!route) return null
    return {
      pickupRoad: route.origin,
      destinationRoad: route.destination,
      routeCoordinates: route.coordinates,
      ferryCrossings: route.ferryCrossings,
      durationMinutes: route.durationMinutes,
      distanceKm: route.distanceKm,
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    return null
  }
}

/** Split merged coverage into disjoint polygons so area weighting does not count overlaps twice. */
const territoryComponents = (territories: TerritoryFeature[]) => {
  const merged = mergeVillageTerritories(territories)
  if (!merged) return []
  return (merged.geometry.type === 'Polygon' ? [merged.geometry.coordinates] : merged.geometry.coordinates)
    .map((coordinates, index) => polygon(coordinates, { id: `owned-${index}` }))
}

/** Uniformly sample the actual owned polygons, independent of stations and vehicles. */
const randomTerritoryLocations = (city: City, territories: TerritoryFeature[], count: number): MapboxPlace[] => {
  const components = territoryComponents(territories)
  const weighted = components.map((component) => ({ component, area: area(component), bounds: bbox(component) }))
  const totalArea = weighted.reduce((sum, item) => sum + item.area, 0)
  if (!weighted.length || totalArea <= 0) return []

  return Array.from({ length: count }, (_, index) => {
    let draw = Math.random() * totalArea
    const selected = weighted.find((item) => (draw -= item.area) <= 0) ?? weighted[weighted.length - 1]
    const [west, south, east, north] = selected.bounds
    const fallback = pointOnFeature(selected.component).geometry.coordinates
    let coordinates: Coordinates = [fallback[0], fallback[1]]
    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      const candidate: Coordinates = [west + Math.random() * (east - west), south + Math.random() * (north - south)]
      if (booleanPointInPolygon(candidate, selected.component)) {
        coordinates = candidate
        break
      }
    }
    return {
      id: `territory-location:${city.id}:${crypto.randomUUID()}`,
      name: `Random location ${index + 1} in ${city.name}`,
      coordinates,
    }
  })
}

/** Generate pickup candidates close to the taxi requesting work. */
const randomNearbyPickupLocations = (
  city: City,
  isUnlocked: (coordinates: Coordinates) => boolean,
  count: number,
): MapboxPlace[] => {
  const locations: MapboxPlace[] = []

  const [longitude, latitude] = city.coordinates

  const latitudeKmPerDegree = 111.32
  const longitudeKmPerDegree =
    111.32 *
    Math.max(
      0.1,
      Math.cos(latitude * Math.PI / 180),
    )

  const maxAttempts = Math.max(500, count * 100)

  for (
    let attempt = 0;
    attempt < maxAttempts && locations.length < count;
    attempt += 1
  ) {
    const distanceKm =
      Math.sqrt(Math.random()) * MAX_PICKUP_DISTANCE_KM

    const angle = Math.random() * Math.PI * 2

    const candidate: Coordinates = [
      longitude +
        Math.cos(angle) *
          distanceKm /
          longitudeKmPerDegree,

      latitude +
        Math.sin(angle) *
          distanceKm /
          latitudeKmPerDegree,
    ]

    if (!isUnlocked(candidate)) continue

    locations.push({
      id: `pickup-location:${city.id}:${crypto.randomUUID()}`,
      name: `Pickup ${locations.length + 1} in ${city.name}`,
      coordinates: candidate,
    })
  }

  return locations
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
  fareMultiplier = 1,
  territoryCenters: VillageTerritoryCenter[] = [{ id: city.id, coordinates: city.coordinates }],
  exploredTerritory: TerritoryFeature | null = null,
): Promise<{ jobs: TaxiJob[]; passengers: Passenger[]; signatures: string[] }> {
  const excluded = new Set(excludedRoutes)
  // Use the exact OSM/fallback polygons rendered by GameMap. Previously this
  // used only synthetic polygons, allowing calls to appear in visibly locked
  // land whenever Mapbox displayed a real administrative village boundary.
  const villageTerritories = await resolveVillageTerritories(territoryCenters)
  const unlockedTerritory = mergeVillageTerritories([
    ...villageTerritories,
    ...(exploredTerritory ? [exploredTerritory] : []),
  ])
  const ownedTerritories = unlockedTerritory ? [unlockedTerritory] : []
  const isUnlocked = (coordinates: Coordinates) => isInsideTerritoryFeatures(coordinates, ownedTerritories)
  let routes: Array<{ pickup: MapboxPlace; destination: MapboxPlace; distanceKm: number; signature: string; stored?: StoredJobRoute }>
  try {
    signal?.throwIfAborted()
    const pickupPlaces = randomNearbyPickupLocations(
  city,
  isUnlocked,
  Math.max(24, count * 12),
)

const destinationPlaces = randomTerritoryLocations(
  city,
  ownedTerritories,
  Math.max(64, count * RANDOM_LOCATIONS_PER_OFFER),
)

const uniqueRoutes = new Map<string, (typeof routes)[number]>()

for (const pickup of pickupPlaces) {
  for (const destination of destinationPlaces) {
    const distanceKm =
      Math.round(
        distanceKmBetween(
          pickup.coordinates,
          destination.coordinates,
        ) * 10,
      ) / 10

    const signature = jobRouteSignature(
      pickup.name,
      destination.name,
    )

    if (
      pickup.id !== destination.id &&
      isUnlocked(pickup.coordinates) &&
      isUnlocked(destination.coordinates) &&
      distanceKm >= MIN_JOB_DISTANCE_KM &&
      distanceKm <= maxDistanceKm &&
      !excluded.has(signature) &&
      !uniqueRoutes.has(signature)
    ) {
      uniqueRoutes.set(signature, {
        pickup,
        destination,
        distanceKm,
        signature,
      })
    }
  }
}

routes = shuffled([...uniqueRoutes.values()])
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
  isUnlocked(stored.pickup) &&
  isUnlocked(stored.destination) &&
  stored.distanceKm >= MIN_JOB_DISTANCE_KM &&
  stored.distanceKm <= maxDistanceKm &&
  distanceKmBetween(
    city.coordinates,
    stored.pickupRoad ?? stored.pickup,
  ) <= MAX_PICKUP_DISTANCE_KM
        ? [{ pickup: { id: signature, name: stored.pickupLabel, coordinates: stored.pickup }, destination: { id: signature, name: stored.destinationLabel, coordinates: stored.destination }, distanceKm: stored.distanceKm, signature, stored }]
        : []
    })).slice(0, count)
  }

  if (!routes.length) throw new Error('No new routes were found inside the owned territory.')

  const resolvedRoutes: Array<(typeof routes)[number] & { stops: NonNullable<Awaited<ReturnType<typeof roadStops>>> }> = []
  const resolveRoute = async (route: (typeof routes)[number]) => {
    const stops = route.stored
      ? { pickupRoad: route.stored.pickupRoad ?? route.pickup.coordinates, destinationRoad: route.stored.destinationRoad ?? route.destination.coordinates, routeCoordinates: route.stored.routeCoordinates ?? [route.stored.pickup, route.stored.destination], ferryCrossings: route.stored.ferryCrossings ?? [], durationMinutes: route.stored.durationMinutes, distanceKm: route.stored.distanceKm }
      : await roadStops(route.pickup.coordinates, route.destination.coordinates, signal)
    if (!stops) return null
    // Both stops must remain inside owned territory after Mapbox snaps them onto
    // nearby roads. The route between them may cross locked land; completing
    // that journey is what permanently explores its corridor.
    if (
  !isUnlocked(stops.pickupRoad) ||
  !isUnlocked(stops.destinationRoad)
) {
  return null
}

// Mapbox can move the generated pickup when snapping it to a road.
// Reject the route if the actual road pickup becomes too far from the taxi.
if (
  distanceKmBetween(
    city.coordinates,
    stops.pickupRoad,
  ) > MAX_PICKUP_DISTANCE_KM
) {
  return null
}

    return { ...route, stops }
  }
  const ROUTE_REQUEST_CONCURRENCY = 4
  for (let index = 0; index < routes.length && resolvedRoutes.length < count; index += ROUTE_REQUEST_CONCURRENCY) {
    const batch = await Promise.all(routes.slice(index, index + ROUTE_REQUEST_CONCURRENCY).map(resolveRoute))
    for (const route of batch) {
      if (route) resolvedRoutes.push(route)
      if (resolvedRoutes.length >= count) break
    }
  }
  if (!resolvedRoutes.length) throw new Error('No drivable routes were found. Try refreshing the available jobs.')

  const passengers = resolvedRoutes.map(() => ({
    id: crypto.randomUUID(),
    name: passengerNames[Math.floor(Math.random() * passengerNames.length)],
    partySize: 1 + Math.floor(Math.random() * 4),
  }))
  const offeredAt = new Date().toISOString()
  const jobs = resolvedRoutes.map((route, index): TaxiJob => {
    const story = createPassengerStory()
    return {
    id: crypto.randomUUID(), cityId: city.id,
    pickup: route.pickup.coordinates, destination: route.destination.coordinates,
    pickupRoad: route.stops.pickupRoad, destinationRoad: route.stops.destinationRoad,
    routeCoordinates: route.stops.routeCoordinates,
    ferryCrossings: route.stops.ferryCrossings,
    routeResolved: !route.stored || Boolean(route.stored.routeCoordinates && route.stored.routeCoordinates.length > 2),
    pickupLabel: route.pickup.name, destinationLabel: route.destination.name,
    passengerIds: [passengers[index].id], fare: Math.round(taxiFareForDistance(route.stops.distanceKm) * fareMultiplier * (story?.fareMultiplier ?? 1) * 100) / 100,
    distanceKm: Math.round(route.stops.distanceKm * 10) / 10, durationMinutes: Math.max(5, Math.round(route.stops.durationMinutes)), story, status: 'offered', offeredAt,
  }})

  addJobsToJobJson(jobs)

  return {
    jobs,
    passengers,
    signatures: resolvedRoutes.map((route) => route.signature),
  }
}
