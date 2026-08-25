import type { Coordinates, Driver, DynamicEvent, TaxiJob, Vehicle } from '../models/game'
import { distanceKmBetween } from './jobEngine'

export const LOW_ENERGY_THRESHOLD = 20
export const TIRED_DRIVER_THRESHOLD = 80
export const SERVICE_TRIP_DURATION_MS = 30_000
export const OVERNIGHT_STAY_COST = 120
const MAX_DRIVE_HOME_KM = 12

const eventTemplates = [
  { name: 'Stadium rush', description: 'A major match is driving up fares and traffic.', fareMultiplier: 1.35, fuelMultiplier: 1.2 },
  { name: 'Airport disruption', description: 'Cancelled flights have created a surge in taxi demand.', fareMultiplier: 1.5, fuelMultiplier: 1.1 },
  { name: 'City festival', description: 'Visitors are paying more, but crowded roads consume more energy.', fareMultiplier: 1.25, fuelMultiplier: 1.3 },
  { name: 'Quiet streets', description: 'Light traffic makes every journey more efficient.', fareMultiplier: 0.9, fuelMultiplier: 0.7 },
]

export const createDynamicEvent = (now = Date.now()): DynamicEvent => {
  const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)]
  return { id: crypto.randomUUID(), ...template, expiresAt: new Date(now + 5 * 60_000).toISOString() }
}

export const fuelStationForCity = (center: Coordinates): Coordinates => [center[0] + 0.012, center[1] - 0.006]

/** A stable nearby overnight stop when a fatigued driver is too far from home. */
export const overnightStopNear = ([longitude, latitude]: Coordinates, vehicleId: string): Coordinates => {
  const seed = [...vehicleId].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  const angle = (seed % 360) * Math.PI / 180
  const latitudeOffset = 1.5 / 110.574 * Math.sin(angle)
  const longitudeOffset = 1.5 / (111.32 * Math.max(.01, Math.cos(latitude * Math.PI / 180))) * Math.cos(angle)
  return [longitude + longitudeOffset, latitude + latitudeOffset]
}

export const energyUseForJob = (job: TaxiJob, vehicle: Vehicle, event: DynamicEvent | null, driver?: Driver) => {
  const pickupKm = vehicle.position ? distanceKmBetween(vehicle.position, job.pickup) : 0
  const basePer100Km = vehicle.powertrain === 'electric' ? 15 : vehicle.powertrain === 'hybrid' ? 8 : 11
  const traitMultiplier = driver?.trait === 'efficient' ? .82 : 1
  const upgradeMultiplier = (vehicle.upgrades ?? []).includes('eco-tires') ? .9 : 1
  const rangeMultiplier = (vehicle.upgrades ?? []).includes('range-pack') ? .85 : 1
  return Math.max(1, (pickupKm + job.distanceKm) * basePer100Km / 100 * (event?.fuelMultiplier ?? 1) * traitMultiplier * upgradeMultiplier * rangeMultiplier)
}

export const fatigueUseForJob = (job: TaxiJob) => Math.max(8, Math.round(job.durationMinutes / 3))

export const startRecoveryTrip = (vehicle: Vehicle, driver: Driver | undefined, cityCenter: Coordinates, now: number): Vehicle => {
  const needsEnergy = vehicle.fuel <= LOW_ENERGY_THRESHOLD
  const needsRest = (driver?.fatigue ?? 0) >= TIRED_DRIVER_THRESHOLD
  if (!needsEnergy && !needsRest) return { ...vehicle, status: 'available' }
  const from = vehicle.position ?? cityCenter
  const home = driver?.home ?? cityCenter
  const staysNearby = !needsEnergy && distanceKmBetween(from, home) > MAX_DRIVE_HOME_KM
  const kind = needsEnergy ? 'fuel' : staysNearby ? 'lodging' : 'home'
  const destination = needsEnergy ? fuelStationForCity(cityCenter) : staysNearby ? overnightStopNear(from, vehicle.id) : home
  const distanceKm = distanceKmBetween(from, destination)
  // Recovery markers move for a distance-aware amount of time instead of
  // disappearing at one coordinate and reappearing at their destination.
  const durationMs = Math.max(12_000, Math.min(60_000, distanceKm * 3_000))
  return {
    ...vehicle,
    status: 'maintenance',
    serviceTrip: {
      kind,
      from,
      destination,
      label: kind === 'fuel' ? (vehicle.powertrain === 'electric' ? 'Charging station' : 'Fuel station') : kind === 'lodging' ? 'Nearby hotel' : 'Driver home',
      startedAt: new Date(now).toISOString(),
      arrivesAt: new Date(now + durationMs).toISOString(),
    },
  }
}
