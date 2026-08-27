import type { City, Coordinates, Passenger, TaxiJob } from '../models/game'
import { mapboxAccessToken } from '../config/mapbox'
import { BASE_JOB_DISTANCE_KM } from './companyProgression'
import { distanceKmBetween, taxiFareForDistance } from './jobEngine'
import { addJobsToJobJson, jobRouteSignature, readJobJson, type StoredJobRoute } from './jobJsonService'
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

const mapboxToken = mapboxAccessToken
const RANDOM_LOCATIONS_PER_OFFER = 32

const isCoordinates = (value: unknown): value is Coordinates =>
  Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every((part) => typeof part === 'number' && Number.isFinite(part))

/** Resolve a pair of places to curbside stops connected by a drivable route. */
async function roadStops(from: Coordinates, to: Coordinates, signal?: AbortSignal) {
  try {
    const coordinates = `${from.join(',')};${to.join(',')}`
    const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?alternatives=true&geometries=geojson&overview=full&access_token=${mapboxToken}`, { signal })
    if (!response.ok) return null
    const result = await response.json() as { waypoints?: Array<{ location?: unknown }>; routes?: Array<{ distance?: number; geometry?: { coordinates?: unknown } }> }
    const pickup = result.waypoints?.[0]?.location
    const destination = result.waypoints?.[1]?.location
    const routes = (result.routes ?? []).filter((route) => typeof route.distance === 'number' && route.geometry)
    const shortestDistance = Math.min(...routes.map((route) => route.distance!))
    // Vary journeys without selecting implausible detours: only alternatives no
    // more than 25% longer than the shortest route participate in the draw.
    const reasonableRoutes = routes.filter((route) => route.distance! <= shortestDistance * 1.25)
    const selectedRoute = reasonableRoutes[Math.floor(Math.random() * reasonableRoutes.length)] ?? routes[0]
    const routeCoordinates = selectedRoute?.geometry?.coordinates
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
): Promise<{ jobs: TaxiJob[]; passengers: Passenger[]; signatures: string[] }> {
  const excluded = new Set(excludedRoutes)
  // Use the exact OSM/fallback polygons rendered by GameMap. Previously this
  // used only synthetic polygons, allowing calls to appear in visibly locked
  // land whenever Mapbox displayed a real administrative village boundary.
  const ownedTerritories = await resolveVillageTerritories(territoryCenters)
  const isUnlocked = (coordinates: Coordinates) => isInsideTerritoryFeatures(coordinates, ownedTerritories)
  let routes: Array<{ pickup: MapboxPlace; destination: MapboxPlace; distanceKm: number; signature: string; stored?: StoredJobRoute }>
  try {
    signal?.throwIfAborted()
    const places = randomTerritoryLocations(city, ownedTerritories, Math.max(64, count * RANDOM_LOCATIONS_PER_OFFER))
    const uniqueRoutes = new Map<string, (typeof routes)[number]>()
    for (const pickup of places) for (const destination of places) {
      const distanceKm = Math.round(distanceKmBetween(pickup.coordinates, destination.coordinates) * 10) / 10
      const signature = jobRouteSignature(pickup.name, destination.name)
      if (pickup.id !== destination.id &&
        isUnlocked(pickup.coordinates) &&
        isUnlocked(destination.coordinates) &&
        distanceKm >= MIN_JOB_DISTANCE_KM && distanceKm <= maxDistanceKm &&
        !excluded.has(signature) && !uniqueRoutes.has(signature)) {
        uniqueRoutes.set(signature, { pickup, destination, distanceKm, signature })
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
        stored.distanceKm >= MIN_JOB_DISTANCE_KM && stored.distanceKm <= maxDistanceKm
        ? [{ pickup: { id: signature, name: stored.pickupLabel, coordinates: stored.pickup }, destination: { id: signature, name: stored.destinationLabel, coordinates: stored.destination }, distanceKm: stored.distanceKm, signature, stored }]
        : []
    })).slice(0, count)
  }

  if (!routes.length) throw new Error('No new routes were found inside the owned territory.')

  const resolvedRoutes: Array<(typeof routes)[number] & { stops: NonNullable<Awaited<ReturnType<typeof roadStops>>> }> = []
  for (const route of routes) {
    const stops = route.stored
      ? { pickupRoad: route.stored.pickupRoad ?? route.pickup.coordinates, destinationRoad: route.stored.destinationRoad ?? route.destination.coordinates, routeCoordinates: route.stored.routeCoordinates ?? [route.stored.pickup, route.stored.destination] }
      : await roadStops(route.pickup.coordinates, route.destination.coordinates, signal)
    if (!stops) continue
    // Both stops must remain inside owned territory after Mapbox snaps them onto
    // nearby roads. The route between them may cross locked land; completing
    // that journey is what permanently explores its corridor.
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
