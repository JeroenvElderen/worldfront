import type { TaxiPowertrain } from '../models/game'

export interface PostVehicleModel {
  id: string
  brand: string
  name: string
  price: number
  capacity: number
  topSpeedKmh: number
  powertrain: TaxiPowertrain
  description: string
}

export const postVehicleModels: PostVehicleModel[] = [
  { id: 'ford-transit-post', brand: 'Ford', name: 'Transit Courier', price: 22_000, capacity: 180, topSpeedKmh: 165, powertrain: 'diesel', description: 'Compact parcel van · automatic day routes' },
  { id: 'vw-id-buzz-post', brand: 'Volkswagen', name: 'ID. Buzz Cargo', price: 36_000, capacity: 260, topSpeedKmh: 145, powertrain: 'electric', description: 'Electric mail van · automatic day routes' },
]

export const getPostVehicleModel = (id: string) =>
  postVehicleModels.find((model) => model.id === id) ?? postVehicleModels[0]
