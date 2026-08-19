import type { Company, TaxiJob, Vehicle } from '../models/game'

export const JOB_REQUEST_INTERVAL_MS = 30_000
export const MAX_JOB_OFFERS = 6

const distanceSquared = (from: [number, number], to: [number, number]) => {
  const longitudeScale = Math.cos(((from[1] + to[1]) / 2) * Math.PI / 180)
  return ((from[0] - to[0]) * longitudeScale) ** 2 + (from[1] - to[1]) ** 2
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
  jobId: string
) {
  const job = jobs.find((candidate) => candidate.id === jobId && candidate.status === 'accepted')
  if (!job) return null

  return {
    company: { ...company, cash: company.cash + job.fare, reputation: company.reputation + 1 },
    jobs: jobs.map((candidate) => candidate.id === jobId ? { ...candidate, status: 'complete' as const } : candidate),
    vehicles: vehicles.map((candidate) =>
      candidate.id === job.assignedVehicleId || (!job.assignedVehicleId && candidate.status === 'on-job')
        ? { ...candidate, status: 'available' as const, position: job.destination }
        : candidate),
  }
}
