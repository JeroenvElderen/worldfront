import type { Coordinates, PostalRoute, Vehicle } from '../models/game'

export const POSTAL_MIN_HOURS = 1
export const POSTAL_MAX_HOURS = 8
export const POSTAL_HOUR_MS = 60 * 60_000

const randomInteger = (minimum: number, maximum: number, random: () => number) =>
  Math.floor(random() * (maximum - minimum + 1)) + minimum

/** Builds a self-contained, random delivery round lasting no more than a working day. */
export function createPostalRoute(vehicle: Vehicle, cityCenter: Coordinates, now = Date.now(), random = Math.random): PostalRoute {
  const start = vehicle.position ?? cityCenter
  const plannedHours = randomInteger(POSTAL_MIN_HOURS, POSTAL_MAX_HOURS, random)
  const stopCount = Math.max(3, Math.min(16, plannedHours * 2 + randomInteger(-1, 1, random)))
  const longitudeScale = 1 / Math.max(0.35, Math.cos(cityCenter[1] * Math.PI / 180))
  const deliveryStops = Array.from({ length: stopCount }, (_, index) => {
    const angle = (index / stopCount) * Math.PI * 2 + (random() - 0.5) * 0.7
    const radius = 0.008 + random() * (0.012 + plannedHours * 0.003)
    return {
      id: crypto.randomUUID(),
      label: `Post stop ${index + 1}`,
      coordinates: [
        cityCenter[0] + Math.cos(angle) * radius * longitudeScale,
        cityCenter[1] + Math.sin(angle) * radius,
      ] as Coordinates,
    }
  })

  return {
    stops: [
      { id: crypto.randomUUID(), label: 'Postal depot', coordinates: start },
      ...deliveryStops,
      { id: crypto.randomUUID(), label: 'Postal depot', coordinates: start },
    ],
    startedAt: new Date(now).toISOString(),
    arrivesAt: new Date(now + plannedHours * POSTAL_HOUR_MS).toISOString(),
    reward: plannedHours * 110 + stopCount * 15,
    plannedHours,
  }
}

export const postalRouteProgress = (route: PostalRoute, now = Date.now()) =>
  Math.max(0, Math.min(1, (now - new Date(route.startedAt).getTime()) /
    (new Date(route.arrivesAt).getTime() - new Date(route.startedAt).getTime())))
