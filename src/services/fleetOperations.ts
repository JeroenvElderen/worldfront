import type { AutomationEmployee, AutomationRole, CleaningService, CustomerReview, Dispatcher, DispatcherStrategy, Driver, MaintenanceAlert, MaintenanceKind, Mechanic, Passenger, TaxiJob, TireType, Vehicle, WeatherKind } from '../models/game'

const staffNames = ['Morgan Reed', 'Priya Shah', 'Noah Bennett', 'Maya Laurent', 'Finn Walsh', 'Sofia Costa']

export const automationRoleDetails: Record<AutomationRole, { label: string; icon: string; description: string; salary: number; spendingLimit: number }> = {
  'operations-manager': { label: 'Operations manager', icon: '📡', description: 'Accepts suitable taxi work within your dispatch rules.', salary: 1_250, spendingLimit: 0 },
  'workshop-manager': { label: 'Workshop manager', icon: '🔧', description: 'Sends idle vehicles for condition repairs.', salary: 1_100, spendingLimit: 1_500 },
  'cleaning-supervisor': { label: 'Cleaning supervisor', icon: '✨', description: 'Cleans idle vehicles before presentation suffers.', salary: 720, spendingLimit: 300 },
  'tire-manager': { label: 'Tire manager', icon: '🛞', description: 'Replaces unsafe tires with suitable seasonal sets.', salary: 850, spendingLimit: 1_300 },
  'postal-supervisor': { label: 'Postal supervisor', icon: '📮', description: 'Starts rounds when staffed postal vans are ready.', salary: 900, spendingLimit: 0 },
  'rental-manager': { label: 'Rental manager', icon: '🔑', description: 'Rents out prepared self-drive cars automatically.', salary: 900, spendingLimit: 0 },
  'customer-service-manager': { label: 'Customer service manager', icon: '💬', description: 'Responds to unresolved customer reviews.', salary: 780, spendingLimit: 100 },
}

export function createAutomationEmployee(role: AutomationRole, cityId: string, count: number): AutomationEmployee {
  const details = automationRoleDetails[role]
  const skill = 48 + Math.floor(Math.random() * 30)
  return { id: crypto.randomUUID(), name: staffNames[(count + 1) % staffNames.length], role, cityId, salary: Math.round(details.salary * (1 + (skill - 50) / 250)), skill, reliability: 72 + Math.floor(Math.random() * 24), capacity: 4 + Math.floor(skill / 18), spendingLimit: details.spendingLimit, enabled: true, experience: 0, hiredAt: new Date().toISOString() }
}

export const tireDetails: Record<TireType, { label: string; cost: number; wear: number; wetGrip: number; snowGrip: number; energy: number }> = {
  economy: { label: 'Economy', cost: 420, wear: 1.2, wetGrip: .85, snowGrip: .65, energy: 1.04 },
  touring: { label: 'Touring', cost: 620, wear: 1, wetGrip: 1, snowGrip: .75, energy: 1 },
  'all-season': { label: 'All-season', cost: 760, wear: 1, wetGrip: 1.05, snowGrip: 1.1, energy: 1.02 },
  winter: { label: 'Winter', cost: 820, wear: 1.12, wetGrip: 1.05, snowGrip: 1.45, energy: 1.06 },
  eco: { label: 'Low rolling resistance', cost: 880, wear: .92, wetGrip: .92, snowGrip: .7, energy: .92 },
  'heavy-duty': { label: 'Heavy duty', cost: 1_050, wear: .72, wetGrip: 1, snowGrip: .9, energy: 1.05 },
  performance: { label: 'Performance', cost: 1_250, wear: 1.3, wetGrip: 1.25, snowGrip: .7, energy: 1.04 },
}

export const cleaningDetails: Record<CleaningService, { label: string; cost: number; restored: number; minutes: number }> = {
  quick: { label: 'Quick wash', cost: 35, restored: 20, minutes: 5 },
  standard: { label: 'Standard clean', cost: 80, restored: 45, minutes: 15 },
  interior: { label: 'Interior clean', cost: 125, restored: 65, minutes: 25 },
  detail: { label: 'Full detailing', cost: 260, restored: 100, minutes: 50 },
}

export function createStarterMechanic(cityId: string): Mechanic {
  return { id: crypto.randomUUID(), name: 'Morgan Reed', cityId, skill: 58, diagnostics: 55, speed: 55, salary: 720, specialization: 'general', experience: 0 }
}

export function createStarterDispatcher(cityId: string): Dispatcher {
  return { id: crypto.randomUUID(), name: 'Priya Shah', cityId, planning: 58, localKnowledge: 62, customerService: 57, capacity: 6, salary: 680, strategy: 'balanced', experience: 0 }
}

export function recruitMechanic(cityId: string, count: number): Mechanic {
  const specializations = ['general', 'electric', 'heavy', 'bodywork'] as const
  return { id: crypto.randomUUID(), name: staffNames[count % staffNames.length], cityId, skill: 45 + Math.floor(Math.random() * 31), diagnostics: 40 + Math.floor(Math.random() * 36), speed: 45 + Math.floor(Math.random() * 31), salary: 620 + Math.floor(Math.random() * 280), specialization: specializations[count % specializations.length], experience: 0 }
}

export function recruitDispatcher(cityId: string, count: number): Dispatcher {
  const strategies: DispatcherStrategy[] = ['nearest', 'profit', 'customer', 'balanced', 'territory', 'contracts']
  return { id: crypto.randomUUID(), name: staffNames[(count + 2) % staffNames.length], cityId, planning: 45 + Math.floor(Math.random() * 31), localKnowledge: 45 + Math.floor(Math.random() * 31), customerService: 45 + Math.floor(Math.random() * 31), capacity: 5 + Math.floor(count / 2), salary: 600 + Math.floor(Math.random() * 260), strategy: strategies[count % strategies.length], experience: 0 }
}

export function tireWearForDistance(vehicle: Vehicle, distanceKm: number, weather: WeatherKind) {
  const tire = tireDetails[vehicle.tireType ?? 'touring']
  const weight = vehicle.type === 'coach' || vehicle.type === 'post' ? 1.25 : 1
  const weatherWear = weather === 'heatwave' ? 1.25 : weather === 'snow' ? 1.1 : 1
  return distanceKm / 450 * tire.wear * weight * weatherWear
}

export function maintenanceAdvisories(vehicles: Vehicle[], existing: MaintenanceAlert[], now = Date.now()) {
  const activeKeys = new Set(existing.filter((alert) => !alert.dismissed).map((alert) => `${alert.vehicleId}:${alert.kind}`))
  const created: MaintenanceAlert[] = []
  const add = (vehicle: Vehicle, kind: MaintenanceAlert['kind'], severity: MaintenanceAlert['severity'], title: string, message: string) => {
    if (!activeKeys.has(`${vehicle.id}:${kind}`) && !vehicle.maintenanceJob) created.push({ id: crypto.randomUUID(), vehicleId: vehicle.id, kind, severity, title, message, createdAt: new Date(now).toISOString(), dismissed: false })
  }
  vehicles.forEach((vehicle) => {
    const tires = vehicle.tireCondition ?? 100
    const clean = vehicle.cleanliness ?? 100
    if (vehicle.condition <= 20) add(vehicle, 'repair', 'critical', `${vehicle.name} requires repairs`, `Condition is ${Math.round(vehicle.condition)}%. Send it to the workshop before another breakdown.`)
    else if (vehicle.condition <= 45) add(vehicle, 'inspection', 'due', `${vehicle.name} needs workshop attention`, `Condition has fallen to ${Math.round(vehicle.condition)}%. A mechanic should inspect it.`)
    if (tires <= 10) add(vehicle, 'tires', 'critical', `${vehicle.name} has unsafe tires`, `Tire condition is ${Math.round(tires)}%. The vehicle should not return to service.`)
    else if (tires <= 30) add(vehicle, 'tires', 'due', `${vehicle.name} needs new tires`, `Tire condition is ${Math.round(tires)}%, increasing energy use and incident risk.`)
    if (clean <= 25) add(vehicle, 'cleaning', clean <= 10 ? 'critical' : 'due', `${vehicle.name} needs cleaning`, `Cleanliness is ${Math.round(clean)}%. Ratings and premium-job eligibility are being affected.`)
  })
  return [...existing.filter((alert) => !alert.dismissed), ...created].slice(-30)
}

export function maintenanceQuote(vehicle: Vehicle, kind: MaintenanceKind, mechanic?: Mechanic) {
  const base = kind === 'inspection' ? 180 : kind === 'tires' ? tireDetails[vehicle.tireType ?? 'touring'].cost : kind === 'repair' ? 850 : 1_350
  const skillDiscount = mechanic ? Math.min(.18, mechanic.skill / 500) : 0
  const minutes = (kind === 'inspection' ? 25 : kind === 'tires' ? 45 : kind === 'repair' ? 100 : 150) * (mechanic ? 1.25 - mechanic.speed / 200 : 1.5)
  return { cost: Math.round(base * (1 - skillDiscount)), durationMs: Math.round(minutes * 60_000) }
}

export function createCustomerReview(job: TaxiJob, vehicle: Vehicle, driver: Driver | undefined, passenger: Passenger | undefined, rating: number, satisfaction: number, createdAt: string): CustomerReview {
  const positiveTags: string[] = []
  const negativeTags: string[] = []
  if ((vehicle.cleanliness ?? 100) >= 75) positiveTags.push('Clean vehicle')
  if ((vehicle.cleanliness ?? 100) < 45) negativeTags.push('Dirty interior')
  if ((vehicle.tireCondition ?? 100) < 30 || vehicle.condition < 45) negativeTags.push('Poor vehicle condition')
  if ((driver?.rating ?? 0) >= 4.6) positiveTags.push('Friendly driver')
  if ((driver?.fatigue ?? 0) > 70) negativeTags.push('Tired driver')
  if (satisfaction >= 85) positiveTags.push('On time')
  if (job.requiredUpgrade && (vehicle.upgrades ?? []).includes(job.requiredUpgrade)) positiveTags.push('Request fulfilled')
  const headline = rating >= 5 ? 'An excellent journey' : rating >= 4 ? 'A good trip overall' : rating >= 3 ? 'It was acceptable' : 'Service needs improvement'
  const comment = negativeTags.length ? `The trip was completed, but ${negativeTags.join(' and ').toLowerCase()} affected the experience.` : positiveTags.length ? `${positiveTags.join(' and ')} made this journey stand out.` : 'The journey was completed as expected.'
  return { id: crypto.randomUUID(), jobId: job.id, passengerId: passenger?.id, vehicleId: vehicle.id, driverId: driver?.id, cityId: job.cityId, createdAt, rating, headline, comment, positiveTags, negativeTags }
}
