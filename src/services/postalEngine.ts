import type { Coordinates, PostalRoute, PostalRoutePlan, PostalServiceLevel, Vehicle } from '../models/game'
import { SIMULATED_MINUTE_MS } from './jobEngine'

export const POSTAL_MIN_HOURS = 1
export const POSTAL_MAX_HOURS = 8
// Postal rounds run on the same accelerated game clock as taxi journeys.
export const POSTAL_HOUR_MS = 60 * SIMULATED_MINUTE_MS

const randomInteger = (minimum: number, maximum: number, random: () => number) =>
  Math.floor(random() * (maximum - minimum + 1)) + minimum

const serviceMultiplier: Record<PostalServiceLevel, number> = {
  standard: 1,
  express: 1.45,
  business: 1.25,
}

const distanceKmBetween = (from: Coordinates, to: Coordinates) => {
  const latitudeDelta = (to[1] - from[1]) * Math.PI / 180
  const longitudeDelta = (to[0] - from[0]) * Math.PI / 180
  const fromLatitude = from[1] * Math.PI / 180
  const toLatitude = to[1] * Math.PI / 180
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export const defaultPostalRoutePlan = (seed = Math.floor(Math.random() * 2_147_483_647)): PostalRoutePlan => ({
  plannedHours: 4,
  radiusKm: 8,
  loadPercent: 75,
  serviceLevel: 'standard',
  seed,
})

export const postalRandom = (seed: number) => {
  let value = Math.max(1, Math.floor(seed)) % 2_147_483_647
  return () => {
    value = value * 16_807 % 2_147_483_647
    return (value - 1) / 2_147_483_646
  }
}

/** Builds a self-contained, random delivery round lasting no more than a working day. */
export function createPostalRoute(vehicle: Vehicle, cityCenter: Coordinates, now = Date.now(), random = Math.random, requestedPlan?: Partial<PostalRoutePlan>): PostalRoute {
  const plan = { ...defaultPostalRoutePlan(), ...requestedPlan }
  const routeRandom = requestedPlan?.seed == null ? random : postalRandom(plan.seed)
  const start = vehicle.position ?? cityCenter
  const plannedHours = requestedPlan?.plannedHours == null
    ? randomInteger(POSTAL_MIN_HOURS, POSTAL_MAX_HOURS, routeRandom)
    : Math.max(POSTAL_MIN_HOURS, Math.min(POSTAL_MAX_HOURS, Math.round(plan.plannedHours)))
  const radiusKm = Math.max(2, Math.min(30, plan.radiusKm))
  const loadPercent = Math.max(25, Math.min(100, plan.loadPercent))
  const parcelCount = Math.max(1, Math.round(vehicle.capacity * loadPercent / 100))
  const stopsPerHour = plan.serviceLevel === 'express' ? 1.5 : plan.serviceLevel === 'business' ? 2 : 2.5
  const stopCount = Math.max(3, Math.min(24, Math.round(plannedHours * stopsPerHour)))
  const longitudeScale = 1 / Math.max(0.35, Math.cos(cityCenter[1] * Math.PI / 180))
  const deliveryStops = Array.from({ length: stopCount }, (_, index) => {
    const angle = (index / stopCount) * Math.PI * 2 + (routeRandom() - 0.5) * 0.75
    const radius = (0.25 + routeRandom() * 0.75) * radiusKm / 111
    return {
      id: crypto.randomUUID(),
      label: `${plan.serviceLevel === 'express' ? 'Express' : plan.serviceLevel === 'business' ? 'Business' : 'Delivery'} stop ${index + 1}`,
      coordinates: [
        cityCenter[0] + Math.cos(angle) * radius * longitudeScale,
        cityCenter[1] + Math.sin(angle) * radius,
      ] as Coordinates,
    }
  })

  const stops = [{ id: crypto.randomUUID(), label: 'Postal depot', coordinates: start }, ...deliveryStops, { id: crypto.randomUUID(), label: 'Postal depot', coordinates: start }]
  const distanceKm = stops.slice(1).reduce((total, stop, index) => total + distanceKmBetween(stops[index].coordinates, stop.coordinates), 0)
  const reward = Math.round((plannedHours * 95 + parcelCount * 1.8 + distanceKm * 2.5) * serviceMultiplier[plan.serviceLevel])

  return {
    stops,
    startedAt: new Date(now).toISOString(),
    arrivesAt: new Date(now + plannedHours * POSTAL_HOUR_MS).toISOString(),
    reward,
    plannedHours,
    distanceKm: Math.round(distanceKm * 10) / 10,
    parcelCount,
    loadPercent,
    serviceLevel: plan.serviceLevel,
    radiusKm,
  }
}

export const postalRouteProgress = (route: PostalRoute, now = Date.now()) =>
  Math.max(0, Math.min(1, (now - new Date(route.startedAt).getTime()) /
    (new Date(route.arrivesAt).getTime() - new Date(route.startedAt).getTime())))
