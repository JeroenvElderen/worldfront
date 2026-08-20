import type { Company, TaxiJob, Vehicle } from '../models/game'
import { levelForReputation } from './companyProgression'

export const MAX_JOB_OFFERS = 6
export const MAX_PICKUP_DISTANCE_KM = 5
// Trips take an eighth of their estimated real-world duration (an 8x game clock).
export const REAL_TIME_TRIP_SCALE = 0.125
export const SIMULATED_MINUTE_MS = 60_000 * REAL_TIME_TRIP_SCALE

const distanceSquared = (from: [number, number], to: [number, number]) => {
  const longitudeScale = Math.cos(((from[1] + to[1]) / 2) * Math.PI / 180)
  return ((from[0] - to[0]) * longitudeScale) ** 2 + (from[1] - to[1]) ** 2
}

export const distanceKmBetween = (from: [number, number], to: [number, number]) => {
  const latitudeKm = (to[1] - from[1]) * 111.32
  const longitudeKm = (to[0] - from[0]) * 111.32 * Math.cos(((from[1] + to[1]) / 2) * Math.PI / 180)
  return Math.hypot(latitudeKm, longitudeKm)
}

/** A simple metered tariff: flag fall plus a charge for every passenger kilometre. */
export const taxiFareForDistance = (distanceKm: number) =>
  Math.round((10 + Math.max(0, distanceKm) * 3.25) * 100) / 100

/** Drops open offers that none of the currently idle taxis can collect. */
export function removeUnreachableJobOffersState(jobs: TaxiJob[], vehicles: Vehicle[]) {
  const availablePositions = vehicles
    .filter((vehicle) => vehicle.status === 'available' && vehicle.position)
    .map((vehicle) => vehicle.position!)
  return jobs.filter((job) => job.status !== 'offered' || availablePositions.some(
    (position) => distanceKmBetween(position, job.pickup) <= MAX_PICKUP_DISTANCE_KM
  ))
}

/** Stable journey timings keep a trip in the same place across map reloads. */
export function getJobJourney(job: TaxiJob, vehicle: Vehicle) {
  const acceptedAt = job.acceptedAt ? new Date(job.acceptedAt).getTime() : Date.now()
  const start = vehicle.position ?? job.pickup
  const pickupDistanceKm = distanceKmBetween(start, job.pickup)
  // Use the job's average journey speed for the empty drive to the passenger too.
  const pickupMinutes = job.distanceKm > 0
    ? pickupDistanceKm * job.durationMinutes / job.distanceKm
    : 0
  const pickupDurationMs = Math.max(2_000, pickupMinutes * SIMULATED_MINUTE_MS)
  const passengerDurationMs = Math.max(5_000, job.durationMinutes * SIMULATED_MINUTE_MS)
  return {
    acceptedAt,
    pickupAt: acceptedAt + pickupDurationMs,
    arrivesAt: acceptedAt + pickupDurationMs + passengerDurationMs,
  }
}

export function acceptJobState(
  jobs: TaxiJob[],
  vehicles: Vehicle[],
  jobId: string
) {
  if (jobs.some((job) => job.id === jobId && job.status === 'accepted')) return null

  const job = jobs.find((candidate) => candidate.id === jobId && candidate.status === 'offered')
  const vehicle = (job && vehicles
    .filter((candidate) => candidate.status === 'available' && candidate.position)
    .sort((left, right) => distanceSquared(left.position!, job.pickup) - distanceSquared(right.position!, job.pickup))[0])
    ?? vehicles.find((candidate) => candidate.status === 'available')
  if (!vehicle || !job) return null

  return {
    jobs: jobs.map((candidate) => candidate.id === jobId
      ? { ...candidate, status: 'accepted' as const, assignedVehicleId: vehicle.id, acceptedAt: new Date().toISOString() }
      : candidate),
    vehicles: vehicles.map((candidate) => candidate.id === vehicle.id
      ? { ...candidate, status: 'on-job' as const }
      : candidate),
  }
}

export function completeJobState(
  company: Company,
  jobs: TaxiJob[],
  vehicles: Vehicle[],
  jobId: string,
  now = Date.now()
) {
  const job = jobs.find((candidate) => candidate.id === jobId && candidate.status === 'accepted')
  if (!job) return null
  const vehicle = vehicles.find((candidate) => candidate.id === job.assignedVehicleId)
    ?? vehicles.find((candidate) => candidate.status === 'on-job')
  if (!vehicle || now < getJobJourney(job, vehicle).arrivesAt) return null

  const paidDistanceKm = distanceKmBetween(job.pickup, job.destination)
  const meteredFare = taxiFareForDistance(paidDistanceKm)
  const reputation = company.reputation + 1

  return {
    company: { ...company, cash: company.cash + meteredFare, reputation, level: levelForReputation(reputation) },
    jobs: jobs.map((candidate) => candidate.id === jobId ? { ...candidate, status: 'complete' as const } : candidate),
    vehicles: vehicles.map((candidate) =>
      candidate.id === job.assignedVehicleId || (!job.assignedVehicleId && candidate.status === 'on-job')
        ? { ...candidate, status: 'available' as const, position: job.destination }
        : candidate),
  }
}

/** Completes every journey that has reached its destination at the supplied time. */
export function completeArrivedJobsState(
  company: Company,
  jobs: TaxiJob[],
  vehicles: Vehicle[],
  now = Date.now()
) {
  let nextCompany = company
  let nextJobs = jobs
  let nextVehicles = vehicles
  const completedJobIds: string[] = []

  for (const job of jobs) {
    const result = completeJobState(nextCompany, nextJobs, nextVehicles, job.id, now)
    if (!result) continue
    nextCompany = result.company
    nextJobs = result.jobs
    nextVehicles = result.vehicles
    completedJobIds.push(job.id)
  }

  return completedJobIds.length
    ? { company: nextCompany, jobs: nextJobs, vehicles: nextVehicles, completedJobIds }
    : null
}
