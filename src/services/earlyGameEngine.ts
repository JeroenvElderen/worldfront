import type { CompanyGoal, Driver, DriverCandidate, DriverTrait, GoalMetric, TaxiJob, Vehicle, VehicleUpgrade } from '../models/game'
import { distanceKmBetween, getJobJourney } from './jobEngine'

export const driverTraitDetails: Record<DriverTrait, { label: string; description: string }> = {
  careful: { label: 'Careful', description: '25% less wear, but journeys take 5% longer.' },
  efficient: { label: 'Efficient', description: 'Uses 18% less fuel or electricity.' },
  charming: { label: 'Charming', description: 'Earns better tips and reputation.' },
  'night-owl': { label: 'Night owl', description: 'Higher satisfaction on night shift.' },
  'local-expert': { label: 'Local expert', description: 'Reaches local pickups 15% faster.' },
  unreliable: { label: 'Unreliable', description: 'Costs less, but may miss a shift.' },
}

export const upgradeDetails: Record<VehicleUpgrade, { label: string; description: string; price: number }> = {
  'eco-tires': { label: 'Eco tires', description: '10% less energy use.', price: 900 },
  'premium-seats': { label: 'Premium seats', description: 'Improves passenger satisfaction.', price: 1_400 },
  wifi: { label: 'Passenger Wi-Fi', description: 'Adds comfort and earns stronger business-passenger tips.', price: 950 },
  'air-conditioning': { label: 'Air conditioning', description: 'Keeps passengers comfortable and improves satisfaction.', price: 1_250 },
  'luggage-capacity': { label: 'Luggage capacity', description: 'Carries more bags and improves passenger comfort.', price: 1_100 },
  'wheelchair-access': { label: 'Wheelchair access', description: 'Provides inclusive access and improves passenger comfort.', price: 2_800 },
  'child-seats': { label: 'Child seats', description: 'Improves comfort and satisfaction for families.', price: 600 },
  'entertainment-system': { label: 'Entertainment system', description: 'Improves long-distance trips and tour revenue.', price: 1_600 },
  'security-partition': { label: 'Security partition', description: 'Improves safety for drivers and passengers.', price: 1_300 },
  'luxury-interior': { label: 'Luxury interior', description: 'Boosts passenger comfort, tips and tours.', price: 3_800 },
  'range-pack': { label: 'Range pack', description: 'Uses 15% less fuel or electricity.', price: 2_200 },
  'meter-pro': { label: 'Meter Pro', description: 'Adds 8% to taxi fares.', price: 1_800 },
  'roof-sign': { label: 'Smart roof sign', description: 'Keeps one extra passenger request visible while this taxi is available.', price: 700 },
  'parcel-shelving': { label: 'Parcel shelving', description: 'Adds 15% to postal rewards.', price: 1_200 },
  'dash-camera': { label: 'Dash camera', description: 'Reduces vehicle wear by 10%.', price: 650 },
}

/** Prevent upgrades from being sold to vehicle types that cannot benefit from them. */
export function upgradeAppliesToVehicle(upgrade: VehicleUpgrade, vehicle: Vehicle) {
  if (upgrade === 'meter-pro' || upgrade === 'roof-sign' || upgrade === 'wheelchair-access' || upgrade === 'child-seats' || upgrade === 'security-partition') return vehicle.type === 'taxi'
  if (['premium-seats', 'wifi', 'air-conditioning', 'luggage-capacity', 'entertainment-system', 'luxury-interior'].includes(upgrade)) return vehicle.type === 'taxi' || vehicle.type === 'coach' || vehicle.type === 'rental'
  if (upgrade === 'parcel-shelving') return vehicle.type === 'post'
  return true
}

const names = ['Jamie Byrne', 'Róisín Kelly', 'Dara Murphy', 'Sam O’Connor', 'Aisha Khan', 'Luca Rossi', 'Éabha Walsh', 'Theo Martin']
const traits = Object.keys(driverTraitDetails) as DriverTrait[]

export function createDriverCandidates(home: Driver['home'], now = Date.now()): DriverCandidate[] {
  return [...Array(4)].map((_, index) => {
    const trait = traits[(Math.floor(Math.random() * traits.length) + index) % traits.length]
    const rating = Math.round((4.1 + Math.random() * .8) * 10) / 10
    const salary = Math.round((560 + (rating - 4) * 180) * (trait === 'unreliable' ? .72 : 1))
    return { id: crypto.randomUUID(), name: names[(Math.floor(Math.random() * names.length) + index) % names.length], rating, salary, status: 'available', fatigue: 0, home, shift: trait === 'night-owl' ? 'night' : 'day', trait, expiresAt: new Date(now + 10 * 60_000).toISOString() }
  })
}

const goalTemplates: Array<{ metric: GoalMetric; label: (target: number) => string; daily: number; weekly: number }> = [
  { metric: 'fares', label: (n) => `Complete ${n} taxi fares`, daily: 3, weekly: 15 },
  { metric: 'earnings', label: (n) => `Earn ${n.toLocaleString()} from jobs`, daily: 500, weekly: 3_000 },
  { metric: 'safe-jobs', label: (n) => `Finish ${n} jobs above 20% energy`, daily: 2, weekly: 10 },
  { metric: 'postal-rounds', label: (n) => `Complete ${n} postal round${n === 1 ? '' : 's'}`, daily: 1, weekly: 4 },
  { metric: 'airport-jobs', label: (n) => `Serve ${n} airport customers`, daily: 2, weekly: 8 },
]

export function createGoals(now = Date.now()): CompanyGoal[] {
  const picked = [...goalTemplates].sort(() => Math.random() - .5).slice(0, 3)
  return [...picked.map((template) => ({ template, cadence: 'daily' as const })), { template: goalTemplates[Math.floor(Math.random() * goalTemplates.length)], cadence: 'weekly' as const }].map(({ template, cadence }) => {
    const target = template[cadence]
    return { id: crypto.randomUUID(), cadence, metric: template.metric, label: template.label(target), target, progress: 0, cashReward: cadence === 'daily' ? 650 : 3_500, reputationReward: cadence === 'daily' ? 0.5 : 1.3, expiresAt: new Date(now + (cadence === 'daily' ? 24 : 168) * 60 * 60_000).toISOString(), completed: false, claimed: false }
  })
}

export function updateGoals(goals: CompanyGoal[], metric: GoalMetric, amount: number) {
  return goals.map((goal) => goal.metric !== metric || goal.claimed ? goal : { ...goal, progress: Math.min(goal.target, goal.progress + amount), completed: goal.progress + amount >= goal.target })
}

export function vehicleCanTakeJob(vehicle: Vehicle, job: TaxiJob, partySize: number) {
  if (vehicle.capacity < partySize) return false
  return !job.requiredUpgrade || (vehicle.upgrades ?? []).includes(job.requiredUpgrade)
}

/** Every fitted taxi upgrade adds 8% to the fare quoted when that taxi is assigned. */
export function upgradeFareMultiplier(vehicle: Vehicle) {
  return 1 + (vehicle.upgrades?.length ?? 0) * .08
}

/** Staffed taxis keep two requests queued while available or completing a trip. */
export function jobOfferCapacity(vehicles: Vehicle[], drivers: Driver[]) {
  return vehicles.reduce((capacity, vehicle) => {
    const driver = drivers.find((candidate) => candidate.id === vehicle.driverId)
    const canQueueWork = vehicle.type === 'taxi' && vehicle.driverId && (
      (vehicle.status === 'available' && driver?.status === 'available') ||
      (vehicle.status === 'on-job' && driver?.status === 'driving')
    )
    if (!canQueueWork) return capacity
    return capacity + ((vehicle.upgrades ?? []).includes('roof-sign') ? 3 : 2)
  }, 0)
}

export function calculateJobOutcome(job: TaxiJob, vehicle: Vehicle, driver?: Driver) {
  const journey = getJobJourney(job, vehicle)
  const pickupMinutes = Math.max(0, journey.pickupAt - journey.acceptedAt) / 60_000
  let satisfaction = 92 - pickupMinutes * 2 - (100 - vehicle.condition) * .22 - (driver?.fatigue ?? 0) * .12
  satisfaction += ((driver?.rating ?? 4.2) - 4) * 12
  satisfaction += vehicleComfortScore(vehicle) * .22
  if (job.category === 'family' && (vehicle.upgrades ?? []).includes('child-seats')) satisfaction += 3
  if (job.category === 'long-distance' && (vehicle.upgrades ?? []).includes('entertainment-system')) satisfaction += 4
  if (driver?.trait === 'charming') satisfaction += 6
  if (driver?.trait === 'night-owl' && driver.shift === 'night') satisfaction += 5
  satisfaction = Math.round(Math.max(35, Math.min(100, satisfaction)))
  const charmingMultiplier = driver?.trait === 'charming' ? 1.4 : 1
  const premiumTipMultiplier = (vehicle.upgrades ?? []).includes('luxury-interior') ? 1.2 : (vehicle.upgrades ?? []).includes('wifi') && job.category === 'executive' ? 1.1 : 1
  const tip = satisfaction >= 70 ? Math.round(job.fare * ((satisfaction - 60) / 200) * charmingMultiplier * premiumTipMultiplier * 100) / 100 : 0
  const customerRating = Math.max(1, Math.min(5, Math.ceil(satisfaction / 20)))
  const reputationEarned = customerRating * 0.2
  const baseWear = Math.max(.15, job.distanceKm * .035)
  const wear = baseWear * (driver?.trait === 'careful' ? .75 : 1) * ((vehicle.upgrades ?? []).includes('dash-camera') ? .9 : 1)
  return { satisfaction, customerRating, tip, reputationEarned, wear: Math.round(wear * 100) / 100 }
}

const comfortValues: Partial<Record<VehicleUpgrade, number>> = {
  'premium-seats': 12, wifi: 7, 'air-conditioning': 10, 'luggage-capacity': 3,
  'wheelchair-access': 5, 'child-seats': 4, 'entertainment-system': 8,
  'security-partition': 3, 'luxury-interior': 18,
}

/** A visible 0–100 rating shared by passenger feedback and sightseeing tours. */
export function vehicleComfortScore(vehicle: Vehicle) {
  return Math.min(100, (vehicle.upgrades ?? []).reduce((score, upgrade) => score + (comfortValues[upgrade] ?? 0), 0))
}

export function pickupSpeedMultiplier(driver?: Driver) {
  return driver?.trait === 'local-expert' ? .85 : driver?.trait === 'careful' ? 1.05 : 1
}

export function energyMultiplier(vehicle: Vehicle, driver?: Driver) {
  return (driver?.trait === 'efficient' ? .82 : 1) * ((vehicle.upgrades ?? []).includes('eco-tires') ? .9 : 1) * ((vehicle.upgrades ?? []).includes('range-pack') ? .85 : 1)
}

export const distanceToPickup = (job: TaxiJob, vehicle: Vehicle) => vehicle.position ? distanceKmBetween(vehicle.position, job.pickup) : Infinity
