import type { Company, TaxiJob, Vehicle } from '../models/game'

export const JOB_REQUEST_INTERVAL_MS = 30_000
export const MAX_JOB_OFFERS = 6

export function acceptJobState(
  jobs: TaxiJob[],
  vehicles: Vehicle[],
  jobId: string
) {
  if (jobs.some((job) => job.id === jobId && job.status === 'accepted')) return null

  const vehicle = vehicles.find((candidate) => candidate.status === 'available')
  const job = jobs.find((candidate) => candidate.id === jobId && candidate.status === 'offered')
  if (!vehicle || !job) return null

  return {
    jobs: jobs.map((candidate) => candidate.id === jobId
      ? { ...candidate, status: 'accepted' as const, assignedVehicleId: vehicle.id }
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
