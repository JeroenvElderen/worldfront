import type { TaxiPowertrain } from '../models/game'

export interface TaxiModel {
  id: string
  brand: string
  name: string
  price: number
  capacity: number
  topSpeedKmh: number
  logoUrl: string
  description: string
  powertrain: TaxiPowertrain
  marker: string
  color: string
}

export const taxiModels: TaxiModel[] = [
  { id: 'toyota-corolla', brand: 'Toyota', name: 'Corolla Touring Sports', price: 16_500, capacity: 4, topSpeedKmh: 180, logoUrl: 'https://cdn.simpleicons.org/toyota/eaf7f4', description: 'Practical hybrid estate', powertrain: 'hybrid', marker: 'T', color: '#ef4444' },
  { id: 'seat-leon', brand: 'SEAT', name: 'Leon Sportstourer', price: 18_000, capacity: 4, topSpeedKmh: 200, logoUrl: 'https://cdn.simpleicons.org/seat/eaf7f4', description: 'Affordable and roomy estate', powertrain: 'hybrid', marker: 'L', color: '#dc2626' },
  { id: 'skoda-superb', brand: 'Škoda', name: 'Superb', price: 19_500, capacity: 4, topSpeedKmh: 210, logoUrl: 'https://cdn.simpleicons.org/skoda/eaf7f4', description: 'Spacious diesel saloon', powertrain: 'diesel', marker: 'S', color: '#22c55e' },
  { id: 'toyota-camry', brand: 'Toyota', name: 'Camry', price: 24_500, capacity: 4, topSpeedKmh: 180, logoUrl: 'https://cdn.simpleicons.org/toyota/eaf7f4', description: 'Comfortable full-hybrid saloon', powertrain: 'hybrid', marker: 'C', color: '#f97316' },
  { id: 'cupra-tavascan', brand: 'CUPRA', name: 'Tavascan', price: 33_500, capacity: 4, topSpeedKmh: 180, logoUrl: 'https://cdn.simpleicons.org/cupra/eaf7f4', description: 'Sporty electric crossover', powertrain: 'electric', marker: 'C', color: '#b45309' },
  { id: 'mercedes-e-class', brand: 'Mercedes-Benz', name: 'E-Class', price: 38_500, capacity: 4, topSpeedKmh: 240, logoUrl: 'https://cdn.simpleicons.org/mercedes/eaf7f4', description: 'Premium executive taxi', powertrain: 'diesel', marker: 'E', color: '#94a3b8' },
  { id: 'volkswagen-id7', brand: 'Volkswagen', name: 'ID.7', price: 35_000, capacity: 4, topSpeedKmh: 180, logoUrl: 'https://cdn.simpleicons.org/volkswagen/eaf7f4', description: 'Long-range electric saloon', powertrain: 'electric', marker: 'V', color: '#38bdf8' },
  { id: 'audi-a6-avant', brand: 'Audi', name: 'A6 Avant', price: 42_000, capacity: 4, topSpeedKmh: 250, logoUrl: 'https://cdn.simpleicons.org/audi/eaf7f4', description: 'Executive estate with luggage room', powertrain: 'diesel', marker: 'A', color: '#64748b' },
  { id: 'bmw-i5', brand: 'BMW', name: 'i5', price: 48_000, capacity: 4, topSpeedKmh: 193, logoUrl: 'https://cdn.simpleicons.org/bmw/eaf7f4', description: 'Electric executive saloon', powertrain: 'electric', marker: 'B', color: '#2563eb' },
  { id: 'mercedes-v-class', brand: 'Mercedes-Benz', name: 'V-Class', price: 52_000, capacity: 7, topSpeedKmh: 190, logoUrl: 'https://cdn.simpleicons.org/mercedes/eaf7f4', description: 'Premium airport people carrier', powertrain: 'diesel', marker: 'M', color: '#475569' },
]

// Keep models from older saves identifiable without continuing to offer them in the dealership.
const legacyTaxiModels: TaxiModel[] = [
  { id: 'tesla-model-y', brand: 'Tesla', name: 'Model Y', price: 31_000, capacity: 4, topSpeedKmh: 217, logoUrl: 'https://cdn.simpleicons.org/tesla/eaf7f4', description: 'Roomy electric crossover', powertrain: 'electric', marker: 'Y', color: '#3b82f6' },
  { id: 'ford-tourneo', brand: 'Ford', name: 'Tourneo Custom', price: 34_000, capacity: 8, topSpeedKmh: 175, logoUrl: 'https://cdn.simpleicons.org/ford/eaf7f4', description: 'Airport-ready people carrier', powertrain: 'diesel', marker: 'F', color: '#2563eb' },
]

export const getTaxiModel = (id: string) => [...taxiModels, ...legacyTaxiModels].find((taxi) => taxi.id === id || taxi.powertrain === id) ?? taxiModels[0]
