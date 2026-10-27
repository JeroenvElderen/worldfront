import type { Coordinates, FerryRouteOption } from '../models/game'
import { curatedFerryRoutes } from '../data/ferryRoutes'
import { distanceKmBetween } from './jobEngine'
import { harbourId } from './maritimeRoutes'

export interface WorldHarbour { id: string; name: string; coordinates: Coordinates }
const key = (coordinates: Coordinates) => coordinates.map((v) => v.toFixed(4)).join(':')
export const worldHarbours: WorldHarbour[] = Array.from(new Map(
  curatedFerryRoutes.flatMap((route) => [
    { name: route.originName, coordinates: route.coordinates[0] },
    { name: route.destinationName, coordinates: route.coordinates[route.coordinates.length - 1] },
  ]).map((port) => [key(port.coordinates), { ...port, id: harbourId(port.coordinates) }]),
).values())

export function worldRoutesForHarbour(port: WorldHarbour): FerryRouteOption[] {
  return curatedFerryRoutes.flatMap((route) => {
    const first = route.coordinates[0]
    const last = route.coordinates[route.coordinates.length - 1]
    const reverse = key(last) === key(port.coordinates)
    if (!reverse && key(first) !== key(port.coordinates)) return []
    const path = reverse ? [...route.coordinates].reverse() : route.coordinates
    const distanceKm = path.slice(1).reduce((sum, point, i) => sum + distanceKmBetween(path[i], point), 0)
    return [{
      id: `world-${route.id}${reverse ? '-reverse' : ''}`,
      name: route.name,
      originName: port.name,
      destinationName: reverse ? route.originName : route.destinationName,
      originCoordinates: path[0],
      destinationCoordinates: path[path.length - 1],
      routeCoordinates: path,
      distanceKm,
      durationMinutes: route.durationMinutes,
      source: 'curated' as const,
      harbourId: port.id,
    }]
  })
}

export function nearestWorldHarbour(coordinates: Coordinates, maxKm = 2): WorldHarbour | undefined {
  return worldHarbours.map((port) => ({ port, distance: distanceKmBetween(port.coordinates, coordinates) }))
    .filter((item) => item.distance <= maxKm).sort((a, b) => a.distance - b.distance)[0]?.port
}
