import type { TaxiPowertrain } from '../models/game'

export interface TaxiModel {
  id: TaxiPowertrain
  name: string
  price: number
  capacity: number
  topSpeedKmh: number
  icon: string
  description: string
}

export const taxiModels: TaxiModel[] = [
  { id: 'diesel', name: 'City Diesel', price: 12_000, capacity: 4, topSpeedKmh: 155, icon: '🚕', description: 'Reliable and affordable' },
  { id: 'hybrid', name: 'Urban Hybrid', price: 18_500, capacity: 4, topSpeedKmh: 165, icon: '🌿', description: 'Efficient around town' },
  { id: 'electric', name: 'E-Taxi', price: 27_000, capacity: 5, topSpeedKmh: 180, icon: '⚡', description: 'Quiet, clean and quick' },
]

export const getTaxiModel = (id: TaxiPowertrain) => taxiModels.find((taxi) => taxi.id === id) ?? taxiModels[0]
