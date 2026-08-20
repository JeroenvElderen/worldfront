import type { Coordinates, PostalRoute, Vehicle } from '../models/game'

export const POST_ROUTE_DURATION_MS = 75_000

const stopOffsets: Coordinates[] = [
  [0.018, 0.008],
  [0.012, -0.014],
  [-0.016, -0.009],
  [-0.013, 0.014],
]

/** Builds a compact, repeatable delivery round around the vehicle's home city. */
export function createPostalRoute(vehicle: Vehicle, cityCenter: Coordinates, now = Date.now()): PostalRoute {
  const start = vehicle.position ?? cityCenter
  const deliveryStops = stopOffsets.map(([longitude, latitude], index) => ({
    id: crypto.randomUUID(),
    label: `Post stop ${index + 1}`,
    coordinates: [cityCenter[0] + longitude, cityCenter[1] + latitude] as Coordinates,
  }))

  return {
    stops: [
      { id: crypto.randomUUID(), label: 'Postal depot', coordinates: start },
      ...deliveryStops,
      { id: crypto.randomUUID(), label: 'Postal depot', coordinates: cityCenter },
    ],
    startedAt: new Date(now).toISOString(),
    arrivesAt: new Date(now + POST_ROUTE_DURATION_MS).toISOString(),
    reward: 420,
  }
}

export const postalRouteProgress = (route: PostalRoute, now = Date.now()) =>
  Math.max(0, Math.min(1, (now - new Date(route.startedAt).getTime()) /
    (new Date(route.arrivesAt).getTime() - new Date(route.startedAt).getTime())))
