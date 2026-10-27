import { mapboxAccessToken } from '../config/mapbox'
import type { Coordinates, TaxiFerryCrossing } from '../models/game'
import { resolveLandsideFerryTerminals } from './ferryTerminals'

export type RouteSpeedLimit = { speed: number; unit: 'km/h' | 'mph' } | { unknown: true } | { none: true }

export interface RoadRouteDetails {
  coordinates: Coordinates[]
  speedLimits: RouteSpeedLimit[]
  ferryCrossings: TaxiFerryCrossing[]
  durationMinutes: number
  distanceKm: number
  origin: Coordinates
  destination: Coordinates
}

export interface RoadRouteOptions {
  excludeFerries?: boolean
  /** Active road closure points. Routes intersecting these points are rejected. */
  closedRoadPoints?: Coordinates[]
}

type MapboxStep = {
  mode?: string
  name?: string
  duration?: number
  geometry?: { coordinates?: unknown }
}

type MapboxRoute = {
  duration?: number
  distance?: number
  geometry?: { coordinates?: unknown }
  legs?: Array<{
    annotation?: { maxspeed?: RouteSpeedLimit[] }
    steps?: MapboxStep[]
  }>
}

const isCoordinates = (value: unknown): value is Coordinates =>
  Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every((part) => typeof part === 'number' && Number.isFinite(part))

const nearestCoordinateIndex = (coordinates: Coordinates[], target: Coordinates, fromIndex = 0) => {
  let nearest = Math.min(fromIndex, coordinates.length - 1)
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let index = nearest; index < coordinates.length; index += 1) {
    const longitude = coordinates[index][0] - target[0]
    const latitude = coordinates[index][1] - target[1]
    const distance = longitude * longitude + latitude * latitude
    if (distance < nearestDistance) {
      nearest = index
      nearestDistance = distance
    }
  }
  return nearest
}

/** Convert Mapbox's explicit ferry steps into durable ranges on the full route. */
const ferryCrossingsForRoute = (coordinates: Coordinates[], legs: MapboxRoute['legs']) => {
  const crossings: TaxiFerryCrossing[] = []
  let cursor = 0
  for (const step of legs?.flatMap((leg) => leg.steps ?? []) ?? []) {
    if (step.mode !== 'ferry') continue
    const stepCoordinates = step.geometry?.coordinates
    if (!Array.isArray(stepCoordinates) || stepCoordinates.length < 2 || !stepCoordinates.every(isCoordinates)) continue
    const startIndex = nearestCoordinateIndex(coordinates, stepCoordinates[0], cursor)
    const matchedEnd = nearestCoordinateIndex(coordinates, stepCoordinates.at(-1)!, startIndex)
    const endIndex = Math.min(coordinates.length - 1, Math.max(startIndex + 1, matchedEnd))
    if (endIndex <= startIndex) continue
    crossings.push({
      startIndex,
      endIndex,
      boardAt: coordinates[startIndex],
      disembarkAt: coordinates[endIndex],
      durationMinutes: Math.max(1, (step.duration ?? 60) / 60),
      name: step.name || 'Vehicle ferry',
    })
    cursor = endIndex
  }
  return resolveLandsideFerryTerminals(coordinates, crossings)
}

/** Resolve a real drivable route and retain any ferry legs Mapbox selected. */
export async function resolveRoadRoute(
  from: Coordinates,
  to: Coordinates,
  signal?: AbortSignal,
  profiles: Array<'driving-traffic' | 'driving'> = ['driving-traffic', 'driving'],
  options: RoadRouteOptions = {},
): Promise<RoadRouteDetails | null> {
  if (!mapboxAccessToken) return null
  for (const profile of profiles) {
    const query = new URLSearchParams({
      alternatives: options.closedRoadPoints?.length ? 'true' : 'false',
      continue_straight: 'true',
      geometries: 'geojson',
      overview: 'full',
      steps: 'true',
      annotations: 'maxspeed',
      access_token: mapboxAccessToken,
    })
    if (options.excludeFerries) query.set('exclude', 'ferry')
    const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${from.join(',')};${to.join(',')}?${query}`, { signal })
    if (!response.ok) continue
    const result = await response.json() as {
      waypoints?: Array<{ location?: unknown }>
      routes?: MapboxRoute[]
    }
    const validRoutes = (result.routes ?? []).filter((route) => {
      if (options.excludeFerries && route.legs?.some((leg) => leg.steps?.some((step) => step.mode === 'ferry'))) return false
      return typeof route.duration === 'number' &&
        Array.isArray(route.geometry?.coordinates) &&
        route.geometry.coordinates.length >= 2 &&
        route.geometry.coordinates.every(isCoordinates)
    })
    // Check road geometry rather than straight-line distance between route
    // endpoints. A closure rejects only the nearby part of a route.
    const metersToSegment = (point: Coordinates, a: Coordinates, b: Coordinates) => {
      const scale = Math.cos(point[1] * Math.PI / 180)
      const ax = (a[0] - point[0]) * 111_320 * scale
      const ay = (a[1] - point[1]) * 111_320
      const bx = (b[0] - point[0]) * 111_320 * scale
      const by = (b[1] - point[1]) * 111_320
      const dx = bx - ax, dy = by - ay
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / Math.max(1e-8, dx * dx + dy * dy)))
      return Math.hypot(ax + dx * t, ay + dy * t)
    }
    const avoidsClosures = (candidate: MapboxRoute) => {
      const closures = options.closedRoadPoints ?? []
      const coords = candidate.geometry!.coordinates as Coordinates[]
      return closures.every((closure) => coords.slice(1).every((end, i) =>
        metersToSegment(closure, coords[i], end) > 25))
    }
    const route = validRoutes.filter(avoidsClosures).reduce<MapboxRoute | null>((fastest, candidate) =>
      !fastest || candidate.duration! < fastest.duration! ? candidate : fastest, null)
    if (!route) continue
    const coordinates = route.geometry!.coordinates as Coordinates[]
    const snappedOrigin = result.waypoints?.[0]?.location
    const snappedDestination = result.waypoints?.[1]?.location
    const ferryCrossings = ferryCrossingsForRoute(coordinates, route.legs)
    return {
      coordinates,
      speedLimits: route.legs?.flatMap((leg) => leg.annotation?.maxspeed ?? []) ?? [],
      ferryCrossings,
      durationMinutes: Math.max(1, (route.duration ?? 60) / 60) + ferryCrossings.length * 4,
      distanceKm: Math.max(.1, (route.distance ?? 100) / 1_000),
      origin: isCoordinates(snappedOrigin) ? snappedOrigin : coordinates[0],
      destination: isCoordinates(snappedDestination) ? snappedDestination : coordinates.at(-1)!,
    }
  }
  return null
}
