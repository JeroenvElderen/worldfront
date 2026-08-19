import type { City, Coordinates, Passenger, TaxiJob } from '../models/game'

interface GeneratedJob {
  passengerName: string
  partySize: number
  pickupLabel: string
  pickup: Coordinates
  destinationLabel: string
  destination: Coordinates
}

const endpoint = (import.meta.env.VITE_AI_JOBS_ENDPOINT as string | undefined) || '/api/jobs'

const isCoordinates = (value: unknown): value is Coordinates =>
  Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === 'number' && Number.isFinite(part))

const routeSignature = (pickup: string, destination: string) =>
  `${pickup.trim().toLocaleLowerCase()}→${destination.trim().toLocaleLowerCase()}`

const distance = (a: Coordinates, b: Coordinates) => {
  const latitudeKm = (b[1] - a[1]) * 111
  const longitudeKm = (b[0] - a[0]) * 111 * Math.cos((a[1] * Math.PI) / 180)
  return Math.max(1, Math.round(Math.hypot(latitudeKm, longitudeKm) * 10) / 10)
}

function parseJob(value: unknown): GeneratedJob | null {
  if (!value || typeof value !== 'object') return null
  const job = value as Record<string, unknown>
  if (
    typeof job.passengerName !== 'string' || !job.passengerName.trim() ||
    typeof job.partySize !== 'number' || !Number.isInteger(job.partySize) || job.partySize < 1 || job.partySize > 4 ||
    typeof job.pickupLabel !== 'string' || !job.pickupLabel.trim() ||
    typeof job.destinationLabel !== 'string' || !job.destinationLabel.trim() ||
    !isCoordinates(job.pickup) || !isCoordinates(job.destination)
  ) return null
  return job as unknown as GeneratedJob
}

export async function generateJobOffers(
  city: City,
  count: number,
  excludedRoutes: string[],
  signal?: AbortSignal
): Promise<{ jobs: TaxiJob[]; passengers: Passenger[]; signatures: string[] }> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: { name: city.name, countryCode: city.countryCode, center: city.coordinates },
      count,
      excludeRoutes: excludedRoutes,
      instructions: 'Invent realistic, varied taxi requests in this city. Use real or plausible local place names and valid nearby longitude/latitude coordinates. Never repeat an excluded route.',
    }),
    signal,
  })
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(failure?.error ?? `AI job service returned ${response.status}.`)
  }

  const payload = await response.json() as { jobs?: unknown }
  if (!Array.isArray(payload.jobs)) throw new Error('AI job service returned an invalid response.')

  const excluded = new Set(excludedRoutes)
  const generated = payload.jobs.map(parseJob).filter((job): job is GeneratedJob => job !== null)
  const unique = generated.filter((job) => {
    if (distance(city.coordinates, job.pickup) > 80 || distance(city.coordinates, job.destination) > 80) return false
    const signature = routeSignature(job.pickupLabel, job.destinationLabel)
    if (excluded.has(signature)) return false
    excluded.add(signature)
    return true
  }).slice(0, count)
  if (!unique.length) throw new Error('The AI did not return any new valid requests. Please try again.')

  const passengers = unique.map((job) => ({ id: crypto.randomUUID(), name: job.passengerName.trim(), partySize: job.partySize }))
  const jobs = unique.map((job, index) => {
    const distanceKm = distance(job.pickup, job.destination)
    return {
      id: crypto.randomUUID(), cityId: city.id, pickup: job.pickup, destination: job.destination,
      pickupLabel: job.pickupLabel.trim(), destinationLabel: job.destinationLabel.trim(),
      passengerIds: [passengers[index].id], fare: Math.round(5 + distanceKm * 2.4 + job.partySize * 1.5),
      distanceKm, durationMinutes: Math.max(5, Math.round(distanceKm * 3.2)), status: 'offered' as const,
    }
  })
  return { jobs, passengers, signatures: unique.map((job) => routeSignature(job.pickupLabel, job.destinationLabel)) }
}
