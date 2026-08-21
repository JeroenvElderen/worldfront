import type { Coordinates, RentalJourney, Vehicle } from '../models/game'

export const RENTAL_MIN_MINUTES = 2
export const RENTAL_MAX_MINUTES = 6

const randomBetween = (minimum: number, maximum: number, random: () => number) =>
  minimum + random() * (maximum - minimum)

export function createRentalJourney(vehicle: Vehicle, branch: Coordinates, now = Date.now(), random = Math.random): RentalJourney {
  const durationMinutes = Math.round(randomBetween(RENTAL_MIN_MINUTES, RENTAL_MAX_MINUTES, random))
  const waypointCount = 3 + Math.floor(random() * 3)
  const waypoints: Coordinates[] = [branch]

  for (let index = 0; index < waypointCount; index += 1) {
    const angle = random() * Math.PI * 2
    const radius = randomBetween(0.015, 0.055, random)
    waypoints.push([
      branch[0] + Math.cos(angle) * radius,
      branch[1] + Math.sin(angle) * radius * 0.62,
    ])
  }
  waypoints.push(branch)

  const distanceKm = Math.round(durationMinutes * randomBetween(7, 11, random))
  const classMultiplier = Math.max(1, vehicle.value / 20_000)
  const reward = Math.round((durationMinutes * 48 + distanceKm * 1.15) * classMultiplier)

  return {
    waypoints,
    startedAt: new Date(now).toISOString(),
    arrivesAt: new Date(now + durationMinutes * 60_000).toISOString(),
    reward,
    distanceKm,
  }
}

export const rentalJourneyProgress = (journey: RentalJourney, now = Date.now()) =>
  Math.max(0, Math.min(1, (now - new Date(journey.startedAt).getTime()) /
    (new Date(journey.arrivesAt).getTime() - new Date(journey.startedAt).getTime())))
