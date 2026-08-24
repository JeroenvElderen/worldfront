import type { Company, TaxiJob, Vehicle } from '../models/game'
import { taxiTripSpeedMultiplier } from '../data/taxis'
import { addReputation, levelForReputation } from './companyProgression'

export const MAX_JOB_OFFERS = 6
export const JOB_OFFER_DURATION_MS = 5 * 60_000
// Trips take 8% of their estimated real-world duration (a 12.5x game clock).
export const REAL_TIME_TRIP_SCALE = 0.06
export const SIMULATED_MINUTE_MS = 60_000 * REAL_TIME_TRIP_SCALE
// Give the driver a brief dispatch window before the taxi pulls away.
export const JOB_DISPATCH_DELAY_MS = 1_000

export const jobOfferExpiresAt = (job: TaxiJob) =>
  new Date(job.offeredAt ?? 0).getTime() + JOB_OFFER_DURATION_MS

/** Road-accessible stops returned by Directions; old saves fall back to the POI. */
export const jobPickup = (job: TaxiJob) => job.pickupRoad ?? job.pickup
export const jobDestination = (job: TaxiJob) => job.destinationRoad ?? job.destination

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

/** Stable journey timings keep a trip in the same place across map reloads. */
export function getJobJourney(job: TaxiJob, vehicle: Vehicle) {
  const acceptedAt = job.acceptedAt ? new Date(job.acceptedAt).getTime() : Date.now()
  const departsAt = acceptedAt + JOB_DISPATCH_DELAY_MS
  const start = vehicle.position ?? job.pickup
  const pickupDistanceKm = distanceKmBetween(start, jobPickup(job))
  // Use the job's average journey speed for the empty drive to the passenger too.
  const pickupMinutes = job.distanceKm > 0
    ? pickupDistanceKm * job.durationMinutes / job.distanceKm
    : 0
  const speedMultiplier = taxiTripSpeedMultiplier(vehicle.modelId)
  const pickupDurationMs = Math.max(1_000, pickupMinutes * SIMULATED_MINUTE_MS * (job.pickupTimeMultiplier ?? 1) / speedMultiplier)
  const passengerDurationMs = Math.max(3_000, job.durationMinutes * SIMULATED_MINUTE_MS / speedMultiplier)
  return {
    acceptedAt,
    departsAt,
    pickupAt: departsAt + pickupDurationMs,
    arrivesAt: departsAt + pickupDurationMs + passengerDurationMs,
  }
}

export function acceptJobState(
  jobs: TaxiJob[],
  vehicles: Vehicle[],
  jobId: string,
  eligibleVehicleIds?: Set<string>,
) {
  if (jobs.some((job) => job.id === jobId && job.status === 'accepted')) return null

  const job = jobs.find((candidate) => candidate.id === jobId && candidate.status === 'offered')
  const vehicle = (job && vehicles
    .filter((candidate) => candidate.type === 'taxi' && candidate.status === 'available' && candidate.position && (!eligibleVehicleIds || eligibleVehicleIds.has(candidate.id)))
    .sort((left, right) => distanceSquared(left.position!, jobPickup(job)) - distanceSquared(right.position!, jobPickup(job)))[0])
    ?? vehicles.find((candidate) => candidate.type === 'taxi' && candidate.status === 'available' && (!eligibleVehicleIds || eligibleVehicleIds.has(candidate.id)))
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

  const paidDistanceKm = distanceKmBetween(jobPickup(job), jobDestination(job))
  // The offered fare can include a live-event surge, so preserve it at settlement.
  const meteredFare = job.fare || taxiFareForDistance(paidDistanceKm)
  // Manual settlement has no calculated feedback, so award the one-star floor.
  const reputation = addReputation(company.reputation, 0.2)

  return {
    company: { ...company, cash: company.cash + meteredFare, reputation, level: levelForReputation(reputation) },
    jobs: jobs.map((candidate) => candidate.id === jobId ? { ...candidate, status: 'complete' as const } : candidate),
    vehicles: vehicles.map((candidate) =>
      candidate.id === job.assignedVehicleId || (!job.assignedVehicleId && candidate.status === 'on-job')
        ? { ...candidate, status: 'available' as const, position: jobDestination(job) }
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
