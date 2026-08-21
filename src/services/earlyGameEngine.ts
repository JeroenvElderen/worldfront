import type { CompanyGoal, Driver, DriverCandidate, DriverTrait, GoalMetric, JobCategory, TaxiJob, Vehicle, VehicleUpgrade } from '../models/game'
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
  'range-pack': { label: 'Range pack', description: 'Reduces displayed energy use by 15%.', price: 2_200 },
  'meter-pro': { label: 'Meter Pro', description: 'Adds 8% to taxi fares.', price: 1_800 },
  'roof-sign': { label: 'Smart roof sign', description: 'Improves job visibility.', price: 700 },
  'parcel-shelving': { label: 'Parcel shelving', description: 'Adds 15% to postal rewards.', price: 1_200 },
  'dash-camera': { label: 'Dash camera', description: 'Reduces wear from incidents.', price: 650 },
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
  { metric: 'earnings', label: (n) => `Earn €${n.toLocaleString()} from jobs`, daily: 500, weekly: 3_000 },
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

export const categoryDetails: Record<JobCategory, { label: string; icon: string; fare: number; requiredUpgrade?: VehicleUpgrade }> = {
  standard: { label: 'Standard', icon: '🚕', fare: 1 }, airport: { label: 'Airport', icon: '✈️', fare: 1.2 }, family: { label: 'Family', icon: '👨‍👩‍👧', fare: 1.1 }, executive: { label: 'Executive', icon: '💼', fare: 1.35, requiredUpgrade: 'premium-seats' }, accessible: { label: 'Accessible', icon: '♿', fare: 1.25 }, 'late-night': { label: 'Late night', icon: '🌙', fare: 1.2 }, 'long-distance': { label: 'Long distance', icon: '🛣️', fare: 1.15 }, courier: { label: 'Courier', icon: '📦', fare: 1.05 }, 'pet-friendly': { label: 'Pet friendly', icon: '🐾', fare: 1.1 },
}

export function categoryForRoute(pickup: string, destination: string, distanceKm: number, partySize: number): JobCategory {
  const labels = `${pickup} ${destination}`.toLowerCase()
  if (labels.includes('airport')) return 'airport'
  if (distanceKm >= 15) return 'long-distance'
  if (partySize >= 3) return 'family'
  const pool: JobCategory[] = ['standard', 'executive', 'accessible', 'late-night', 'courier', 'pet-friendly']
  return pool[Math.floor(Math.random() * pool.length)]
}

export function vehicleCanTakeJob(vehicle: Vehicle, job: TaxiJob, partySize: number) {
  if (vehicle.capacity < partySize) return false
  return !job.requiredUpgrade || (vehicle.upgrades ?? []).includes(job.requiredUpgrade)
}

export function calculateJobOutcome(job: TaxiJob, vehicle: Vehicle, driver?: Driver) {
  const journey = getJobJourney(job, vehicle)
  const pickupMinutes = Math.max(0, journey.pickupAt - journey.acceptedAt) / 60_000
  let satisfaction = 92 - pickupMinutes * 2 - (100 - vehicle.condition) * .22 - (driver?.fatigue ?? 0) * .12
  satisfaction += ((driver?.rating ?? 4.2) - 4) * 12
  if ((vehicle.upgrades ?? []).includes('premium-seats')) satisfaction += 7
  if (driver?.trait === 'charming') satisfaction += 6
  if (driver?.trait === 'night-owl' && driver.shift === 'night') satisfaction += 5
  satisfaction = Math.round(Math.max(35, Math.min(100, satisfaction)))
  const charmingMultiplier = driver?.trait === 'charming' ? 1.4 : 1
  const tip = satisfaction >= 70 ? Math.round(job.fare * ((satisfaction - 60) / 200) * charmingMultiplier * 100) / 100 : 0
  const customerRating = Math.max(1, Math.min(5, Math.ceil(satisfaction / 20)))
  const reputationEarned = customerRating * 0.2
  const baseWear = Math.max(.15, job.distanceKm * .035)
  const wear = baseWear * (driver?.trait === 'careful' ? .75 : 1) * ((vehicle.upgrades ?? []).includes('dash-camera') ? .9 : 1)
  return { satisfaction, customerRating, tip, reputationEarned, wear: Math.round(wear * 100) / 100 }
}

export function pickupSpeedMultiplier(driver?: Driver) {
  return driver?.trait === 'local-expert' ? .85 : driver?.trait === 'careful' ? 1.05 : 1
}

export function energyMultiplier(vehicle: Vehicle, driver?: Driver) {
  return (driver?.trait === 'efficient' ? .82 : 1) * ((vehicle.upgrades ?? []).includes('eco-tires') ? .9 : 1) * ((vehicle.upgrades ?? []).includes('range-pack') ? .85 : 1)
}

export const distanceToPickup = (job: TaxiJob, vehicle: Vehicle) => vehicle.position ? distanceKmBetween(vehicle.position, job.pickup) : Infinity
