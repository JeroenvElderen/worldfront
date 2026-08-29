import type { Coordinates, FerryRouteOption } from '../models/game'
import { distanceKmBetween } from './jobEngine'
import { curatedFerryRoutes } from '../data/ferryRoutes'

const OVERPASS_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]
const HARBOUR_SEARCH_RADIUS_METRES = 50_000
const MAX_LOCAL_TERMINAL_DISTANCE_KM = 5

interface OsmTags {
  name?: string
  'name:en'?: string
  from?: string
  'from:en'?: string
  to?: string
  'to:en'?: string
  destination?: string
  'destination:en'?: string
  duration?: string
}
interface OsmGeometryPoint { lon: number; lat: number }
interface OsmElement { id: number; type: 'node' | 'way'; lat?: number; lon?: number; tags?: OsmTags; geometry?: OsmGeometryPoint[] }

const isCoordinates = (value: Coordinates | undefined): value is Coordinates =>
  Boolean(value && value.every(Number.isFinite))

const routeDistanceKm = (coordinates: Coordinates[]) => coordinates.slice(1).reduce(
  (total, coordinate, index) => total + distanceKmBetween(coordinates[index], coordinate),
  0,
)

export const harbourId = (coordinates: Coordinates) =>
  `harbour:${coordinates.map((part) => part.toFixed(4)).join(',')}`

const durationMinutes = (duration: string | undefined) => {
  if (!duration) return undefined
  const parts = duration.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return undefined
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] * 60 + parts[1] + parts[2] / 60
}

const terminalCoordinates = (element: OsmElement): Coordinates | undefined =>
  element.type === 'node' && Number.isFinite(element.lon) && Number.isFinite(element.lat)
    ? [element.lon!, element.lat!]
    : undefined

// OpenStreetMap commonly stores a local label in `name` and an English label
// in `name:en`. Prefer the latter anywhere a harbour name is player-facing.
const englishName = (tags: OsmTags | undefined) => tags?.['name:en'] ?? tags?.name
const englishRoutePlace = (tags: OsmTags | undefined, key: 'from' | 'to' | 'destination') =>
  tags?.[`${key}:en`] ?? tags?.[key]

const nearestTerminalName = (coordinate: Coordinates, terminals: OsmElement[]) => {
  const nearest = terminals
    .flatMap((terminal) => {
      const position = terminalCoordinates(terminal)
      const name = englishName(terminal.tags)
      return position && name ? [{ name, distance: distanceKmBetween(coordinate, position) }] : []
    })
    .sort((left, right) => left.distance - right.distance)[0]
  return nearest && nearest.distance <= 2 ? nearest.name : undefined
}

const nearbyCuratedRoutes = (cityCoordinates: Coordinates): FerryRouteOption[] => curatedFerryRoutes.flatMap((route) => {
  const startDistance = distanceKmBetween(cityCoordinates, route.coordinates[0])
  const endDistance = distanceKmBetween(cityCoordinates, route.coordinates.at(-1)!)
  if (Math.min(startDistance, endDistance) > MAX_LOCAL_TERMINAL_DISTANCE_KM) return []
  const reversed = endDistance < startDistance
  const routeCoordinates = reversed ? [...route.coordinates].reverse() : route.coordinates
  return [{
    id: `curated-ferry-${route.id}${reversed ? '-reverse' : ''}`,
    name: route.name,
    originName: reversed ? route.destinationName : route.originName,
    destinationName: reversed ? route.originName : route.destinationName,
    originCoordinates: routeCoordinates[0],
    destinationCoordinates: routeCoordinates.at(-1)!,
    routeCoordinates,
    distanceKm: Math.round(routeDistanceKm(routeCoordinates) * 10) / 10,
    durationMinutes: route.durationMinutes,
    source: 'curated' as const,
  }]
})

const parseRoutes = (elements: OsmElement[], cityCoordinates: Coordinates): FerryRouteOption[] => {
  const terminals = elements.filter((element) => element.type === 'node')
  const routes = elements.flatMap((element): FerryRouteOption[] => {
    if (element.type !== 'way' || !element.geometry || element.geometry.length < 2) return []
    let coordinates = element.geometry
      .map(({ lon, lat }) => [lon, lat] as Coordinates)
      .filter(isCoordinates)
    if (coordinates.length < 2) return []

    const startDistance = distanceKmBetween(cityCoordinates, coordinates[0])
    const endDistance = distanceKmBetween(cityCoordinates, coordinates.at(-1)!)
    const reversed = endDistance < startDistance
    if (reversed) coordinates = [...coordinates].reverse()
    const localDistance = Math.min(startDistance, endDistance)
    const distanceKm = routeDistanceKm(coordinates)
    if (localDistance > MAX_LOCAL_TERMINAL_DISTANCE_KM || distanceKm < .5) return []

    const originTerminal = nearestTerminalName(coordinates[0], terminals)
    const destinationTerminal = nearestTerminalName(coordinates.at(-1)!, terminals)
    const originName = originTerminal
      ?? englishRoutePlace(element.tags, reversed ? 'to' : 'from')
      ?? 'Local harbour'
    const destinationName = destinationTerminal
      ?? englishRoutePlace(element.tags, reversed ? 'from' : 'to')
      ?? englishRoutePlace(element.tags, 'destination')
      ?? englishName(element.tags)
      ?? 'Ferry destination'
    const routeName = englishName(element.tags) ?? `${originName} → ${destinationName}`

    return [{
      id: `osm-ferry-${element.id}`,
      name: routeName,
      originName,
      destinationName,
      originCoordinates: coordinates[0],
      destinationCoordinates: coordinates.at(-1)!,
      routeCoordinates: coordinates,
      distanceKm: Math.round(distanceKm * 10) / 10,
      durationMinutes: durationMinutes(element.tags?.duration),
      source: 'openstreetmap',
    }]
  })

  return [...new Map(routes.map((route) => [
    `${route.destinationName}:${route.destinationCoordinates.map((part) => part.toFixed(3)).join(',')}`,
    route,
  ])).values()]
    .sort((left, right) => distanceKmBetween(cityCoordinates, left.originCoordinates) - distanceKmBetween(cityCoordinates, right.originCoordinates))
    .slice(0, 12)
}

/** Find passenger services whose mapped ferry line starts near a placed harbour. */
export async function discoverFerryRoutes(harbourCoordinates: Coordinates, signal?: AbortSignal) {
  const [longitude, latitude] = harbourCoordinates
  const query = `[out:json][timeout:25];way(around:${HARBOUR_SEARCH_RADIUS_METRES},${latitude},${longitude})["route"="ferry"]->.routes;(.routes;node(w.routes)["amenity"="ferry_terminal"];);out tags geom;`
  let lastError: unknown
  const curated = nearbyCuratedRoutes(harbourCoordinates)

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const requestController = new AbortController()
    const cancelRequest = () => requestController.abort()
    signal?.addEventListener('abort', cancelRequest, { once: true })
    const timeout = setTimeout(cancelRequest, curated.length ? 4_000 : 10_000)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        signal: requestController.signal,
      })
      if (!response.ok) throw new Error(`OpenStreetMap ferry lookup failed (${response.status})`)
      const result = await response.json() as { elements?: OsmElement[] }
      const routes = parseRoutes(result.elements ?? [], harbourCoordinates)
      return routes.length ? routes : curated
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = (error as Error).name === 'AbortError'
        ? new Error('OpenStreetMap ferry lookup timed out.')
        : error
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', cancelRequest)
    }
  }

  if (curated.length) return curated
  throw lastError instanceof Error ? lastError : new Error('Ferry routes are temporarily unavailable.')
}
