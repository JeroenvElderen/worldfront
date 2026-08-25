import type { Coordinates, TaxiJob } from '../models/game'

const JOB_JSON_STORAGE_KEY = 'travel-empire-job-json-v1'

export interface StoredJobRoute {
  cityId: string
  pickup: Coordinates
  destination: Coordinates
  pickupRoad?: Coordinates
  destinationRoad?: Coordinates
  routeCoordinates?: Coordinates[]
  pickupLabel: string
  destinationLabel: string
  distanceKm: number
  durationMinutes: number
}

interface JobJson { version: 1; routes: StoredJobRoute[] }

/** Pickup and destination together identify a route, regardless of letter casing. */
export const jobRouteSignature = (pickup: string, destination: string) =>
  `${pickup.trim().toLocaleLowerCase()}→${destination.trim().toLocaleLowerCase()}`

const emptyJobJson = (): JobJson => ({ version: 1, routes: [] })

export function readJobJson(): JobJson {
  if (typeof localStorage === 'undefined') return emptyJobJson()
  try {
    const parsed = JSON.parse(localStorage.getItem(JOB_JSON_STORAGE_KEY) ?? '') as Partial<JobJson>
    return parsed.version === 1 && Array.isArray(parsed.routes)
      ? { version: 1, routes: parsed.routes }
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
  const routes = new Map(jobJson.routes.map((route) => [jobRouteSignature(route.pickupLabel, route.destinationLabel), route]))
  for (const job of jobs) {
    const signature = jobRouteSignature(job.pickupLabel, job.destinationLabel)
    if (routes.has(signature)) continue
    routes.set(signature, {
      cityId: job.cityId,
      pickup: job.pickup,
      destination: job.destination,
      pickupRoad: job.pickupRoad,
      destinationRoad: job.destinationRoad,
      routeCoordinates: job.routeCoordinates,
      pickupLabel: job.pickupLabel,
      destinationLabel: job.destinationLabel,
      distanceKm: job.distanceKm,
      durationMinutes: job.durationMinutes,
    })
  }
  try {
    localStorage.setItem(JOB_JSON_STORAGE_KEY, JSON.stringify({ version: 1, routes: [...routes.values()] } satisfies JobJson))
  } catch {
    // A full or unavailable browser store must not prevent an online offer.
  }
}
