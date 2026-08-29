import type { Coordinates, TaxiFerryCrossing, TaxiJob } from '../models/game'
import { resolveLandsideFerryTerminals } from './ferryTerminals'

const JOB_JSON_STORAGE_KEY = 'travel-empire-job-json-v1'

export interface StoredJobRoute {
  cityId: string
  pickup: Coordinates
  destination: Coordinates
  pickupRoad?: Coordinates
  destinationRoad?: Coordinates
  routeCoordinates?: Coordinates[]
  ferryCrossings?: TaxiFerryCrossing[]
  pickupLabel: string
  destinationLabel: string
  distanceKm: number
  durationMinutes: number
}

interface JobJson { version: 1; routes: StoredJobRoute[] }

/** Pickup and destination labels identify an offer despite cosmetic text differences. */
export const jobRouteSignature = (pickup: string, destination: string) =>
  `${normalizeRouteLabel(pickup)}→${normalizeRouteLabel(destination)}`

const normalizeRouteLabel = (label: string) => label
  .normalize('NFKC')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase()

/**
 * Coordinates, rather than mutable POI labels, are the durable identity of a
 * stored route. Five decimal places is precise to roughly one metre, while
 * still absorbing insignificant floating-point differences from Mapbox.
 */
const storedRouteKey = (route: Pick<StoredJobRoute, 'cityId' | 'pickup' | 'destination'>) =>
  `${route.cityId}:${route.pickup.map((part) => part.toFixed(5)).join(',')}→${route.destination.map((part) => part.toFixed(5)).join(',')}`

const uniqueStoredRoutes = (routes: StoredJobRoute[]) =>
  [...new Map(routes.map((route) => [storedRouteKey(route), route])).values()]

const repairStoredFerryTerminals = (route: StoredJobRoute): StoredJobRoute => {
  if (!route.routeCoordinates || !route.ferryCrossings?.length) return route
  const ferryCrossings = resolveLandsideFerryTerminals(route.routeCoordinates, route.ferryCrossings)
  return ferryCrossings === route.ferryCrossings ? route : { ...route, ferryCrossings }
}

const emptyJobJson = (): JobJson => ({ version: 1, routes: [] })

export function readJobJson(): JobJson {
  if (typeof localStorage === 'undefined') return emptyJobJson()
  try {
    const parsed = JSON.parse(localStorage.getItem(JOB_JSON_STORAGE_KEY) ?? '') as Partial<JobJson>
    return parsed.version === 1 && Array.isArray(parsed.routes)
      ? { version: 1, routes: uniqueStoredRoutes(parsed.routes.map(repairStoredFerryTerminals)) }
      : emptyJobJson()
  } catch {
    return emptyJobJson()
  }
}

/**
 * Saves generated missions as JSON for later offline use. Existing pickup /
 * destination pairs win, so repeated online searches never grow duplicates.
 */
export function addJobsToJobJson(jobs: TaxiJob[]) {
  if (typeof localStorage === 'undefined' || !jobs.length) return
  const jobJson = readJobJson()
  const routes = new Map(jobJson.routes.map((route) => [storedRouteKey(route), route]))
  for (const job of jobs) {
    const route: StoredJobRoute = {
      cityId: job.cityId,
      pickup: job.pickup,
      destination: job.destination,
      pickupRoad: job.pickupRoad,
      destinationRoad: job.destinationRoad,
      routeCoordinates: job.routeCoordinates,
      ferryCrossings: job.ferryCrossings,
      pickupLabel: job.pickupLabel,
      destinationLabel: job.destinationLabel,
      distanceKm: job.distanceKm,
      durationMinutes: job.durationMinutes,
    }
    const key = storedRouteKey(route)
    if (routes.has(key)) continue
    routes.set(key, route)
  }
  try {
    localStorage.setItem(JOB_JSON_STORAGE_KEY, JSON.stringify({ version: 1, routes: [...routes.values()] } satisfies JobJson))
  } catch {
    // A full or unavailable browser store must not prevent an online offer.
  }
}
