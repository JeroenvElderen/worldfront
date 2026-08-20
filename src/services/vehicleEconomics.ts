import type { Vehicle } from '../models/game'

export const SERVICE_INTERVAL_KM = 10_000
export const WARRANTY_KM = 100_000
export const WARRANTY_YEARS = 3

const yearsBetween = (from: string, to = Date.now()) =>
  Math.max(0, (to - new Date(from).getTime()) / (365.25 * 24 * 60 * 60 * 1_000))

export const vehicleAgeYears = (vehicle: Vehicle, now = Date.now()) =>
  yearsBetween(vehicle.purchasedAt ?? new Date(now).toISOString(), now)

export const vehicleMarketValue = (vehicle: Vehicle, now = Date.now()) => {
  if (vehicle.ownership === 'leased') return 0
  const ageMultiplier = Math.max(.28, .82 ** vehicleAgeYears(vehicle, now))
  const mileageMultiplier = Math.max(.55, 1 - (vehicle.odometerKm ?? 0) / 500_000)
  const conditionMultiplier = .55 + Math.max(0, vehicle.condition) / 100 * .45
  return Math.max(500, Math.round((vehicle.purchasePrice ?? vehicle.value) * ageMultiplier * mileageMultiplier * conditionMultiplier))
}

export const maintenanceCost = (vehicle: Vehicle, baseCost: number) => {
  const mileageMultiplier = 1 + Math.floor((vehicle.odometerKm ?? 0) / 50_000) * .15
  return Math.round(baseCost * mileageMultiplier)
}

export const nextServiceAtKm = (vehicle: Vehicle) =>
  (vehicle.lastServiceAtKm ?? 0) + SERVICE_INTERVAL_KM

export const warrantyActive = (vehicle: Vehicle, now = Date.now()) =>
  vehicleAgeYears(vehicle, now) < WARRANTY_YEARS && (vehicle.odometerKm ?? 0) < WARRANTY_KM

export const replacementRecommendation = (vehicle: Vehicle, now = Date.now()) => {
  const value = vehicleMarketValue(vehicle, now)
  const roi = (vehicle.lifetimeRevenue ?? 0) - (vehicle.lifetimeExpenses ?? 0) - (vehicle.purchasePrice ?? vehicle.value) + value
  if (vehicle.condition < 45 || (vehicle.batteryHealth ?? 100) < 70) return 'Replace soon'
  if ((vehicle.odometerKm ?? 0) >= nextServiceAtKm(vehicle)) return 'Major service due'
  if (roi < 0 && (vehicle.odometerKm ?? 0) > 50_000) return 'Review profitability'
  return 'Keep operating'
}
