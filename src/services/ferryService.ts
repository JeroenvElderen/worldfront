import type { TaxiFerryCrossing, TransportAsset, TransportRoute } from '../models/game'

export interface ActiveFerryService {
  route: TransportRoute
  asset: TransportAsset
}

export interface FerryServiceMatch extends ActiveFerryService {
  direction: 'outbound' | 'returning'
}

// Directions and OpenStreetMap can place the road queue and harbour node a
// little apart. This still keeps matching local to the same pair of terminals.
const TERMINAL_MATCH_RADIUS_KM = 4

const distanceKmBetween = (from: [number, number], to: [number, number]) => {
  const latitudeKm = (to[1] - from[1]) * 111.32
  const longitudeKm = (to[0] - from[0]) * 111.32 * Math.cos(((from[1] + to[1]) / 2) * Math.PI / 180)
  return Math.hypot(latitudeKm, longitudeKm)
}

export const activeFerryServices = (
  routes: TransportRoute[],
  assets: TransportAsset[],
): ActiveFerryService[] => routes.flatMap((route) => {
  if (
    route.mode !== 'ferry' ||
    !route.originCoordinates ||
    !route.destinationCoordinates ||
    !route.routeCoordinates?.length
  ) return []

  const asset = assets.find((candidate) =>
    candidate.mode === 'ferry' &&
    candidate.status === 'on-route' &&
    candidate.journey?.routeId === route.id &&
    (!route.assetId || route.assetId === candidate.id))

  return asset ? [{ route, asset }] : []
})

const terminalDistances = (
  crossing: TaxiFerryCrossing,
  service: ActiveFerryService,
  direction: FerryServiceMatch['direction'],
) => {
  const board = direction === 'outbound'
    ? service.route.originCoordinates!
    : service.route.destinationCoordinates!
  const disembark = direction === 'outbound'
    ? service.route.destinationCoordinates!
    : service.route.originCoordinates!
  return [
    distanceKmBetween(crossing.boardAt, board),
    distanceKmBetween(crossing.disembarkAt, disembark),
  ] as const
}

/** Match a Directions ferry step to one purchased, dispatched shuttle. */
export const activeFerryServiceForCrossing = (
  crossing: TaxiFerryCrossing,
  routes: TransportRoute[],
  assets: TransportAsset[],
): FerryServiceMatch | null => {
  let best: { match: FerryServiceMatch; score: number } | null = null

  for (const service of activeFerryServices(routes, assets)) {
    for (const direction of ['outbound', 'returning'] as const) {
      const distances = terminalDistances(crossing, service, direction)
      if (distances.some((distance) => distance > TERMINAL_MATCH_RADIUS_KM)) continue
      const score = distances[0] + distances[1]
      if (!best || score < best.score) best = { match: { ...service, direction }, score }
    }
  }

  return best?.match ?? null
}

export const ferryCrossingsHaveActiveService = (
  crossings: TaxiFerryCrossing[],
  routes: TransportRoute[],
  assets: TransportAsset[],
) => crossings.every((crossing) => Boolean(activeFerryServiceForCrossing(crossing, routes, assets)))
