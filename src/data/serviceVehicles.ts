import type { ServiceType, Vehicle } from '../models/game'

export interface ServiceVehicleModel { id: string; service: Exclude<ServiceType, 'taxi'>; name: string; type: Vehicle['type']; price: number; capacity: number; topSpeedKmh: number; icon: string; description: string }

export const serviceVehicleModels: ServiceVehicleModel[] = [
  { id: 'cargo-ebike', service: 'bicycle', name: 'Urban Arrow Cargo E-bike', type: 'bicycle', price: 4_200, capacity: 1, topSpeedKmh: 25, icon: '🚲', description: 'Agile zero-emission city courier.' },
  { id: 'delivery-scooter', service: 'food', name: 'Silence S02 Delivery', type: 'scooter', price: 5_900, capacity: 1, topSpeedKmh: 80, icon: '🥡', description: 'Insulated electric food-delivery scooter.' },
  { id: 'parcel-van', service: 'parcel', name: 'Ford E-Transit Courier', type: 'van', price: 28_500, capacity: 2, topSpeedKmh: 145, icon: '📦', description: 'Compact electric van for parcel rounds.' },
  { id: 'accessible-van', service: 'accessible', name: 'Peugeot Boxer Access', type: 'van', price: 36_000, capacity: 6, topSpeedKmh: 150, icon: '♿', description: 'Wheelchair lift, restraints and step access.' },
  { id: 'rental-car', service: 'rental', name: 'Volkswagen ID.3 Rental', type: 'car', price: 31_500, capacity: 5, topSpeedKmh: 160, icon: '🔑', description: 'Reliable electric rental fleet car.' },
  { id: 'airport-shuttle', service: 'shuttle', name: 'Mercedes Sprinter Shuttle', type: 'coach', price: 52_000, capacity: 16, topSpeedKmh: 160, icon: '🚌', description: 'High-capacity airport and hotel shuttle.' },
  { id: 'tour-coach', service: 'travel', name: 'Volvo 9700 Tour Coach', type: 'coach', price: 98_000, capacity: 49, topSpeedKmh: 100, icon: '✈️', description: 'Comfortable coach for agency packages and tours.' },
]

export const getServiceVehicleModel = (id: string) => serviceVehicleModels.find((model) => model.id === id)
