import type { ServiceContract, ServiceType } from '../models/game'

export interface CityService {
  id: Exclude<ServiceType, 'taxi'>
  name: string
  shortName: string
  icon: string
  description: string
  cost: number
  requiredLevel: number
  demand: string
  accent: string
}

export const cityServices: CityService[] = [
  { id: 'bicycle', name: 'Bicycle Couriers', shortName: 'Courier', icon: '🚲', description: 'Documents and small parcels across busy districts.', cost: 3_500, requiredLevel: 1, demand: 'City centre · Commercial', accent: '#42dfb7' },
  { id: 'food', name: 'Food Delivery', shortName: 'Food', icon: '🥡', description: 'Fast, time-sensitive restaurant deliveries.', cost: 5_000, requiredLevel: 1, demand: 'City centre · Residential', accent: '#fb923c' },
  { id: 'parcel', name: 'Parcel Vans', shortName: 'Parcel', icon: '📦', description: 'Larger loads and efficient multi-stop routes.', cost: 9_500, requiredLevel: 2, demand: 'Residential · Commercial', accent: '#60a5fa' },
  { id: 'accessible', name: 'Accessible Transport', shortName: 'Access', icon: '♿', description: 'Specially equipped vehicles and trained drivers.', cost: 12_000, requiredLevel: 2, demand: 'Hospitals · Care centres', accent: '#a78bfa' },
  { id: 'rental', name: 'Car Rental', shortName: 'Rental', icon: '🔑', description: 'Earn while customers rent vehicles by the hour or day.', cost: 18_000, requiredLevel: 3, demand: 'Airports · Tourist areas', accent: '#facc15' },
  { id: 'shuttle', name: 'Airport Shuttles', shortName: 'Shuttle', icon: '🚌', description: 'Scheduled, high-capacity airport connections.', cost: 24_000, requiredLevel: 3, demand: 'Hotels · Airports', accent: '#22d3ee' },
  { id: 'travel', name: 'Travel Agency', shortName: 'Travel', icon: '✈️', description: 'Sell local packages and connected transport.', cost: 30_000, requiredLevel: 4, demand: 'Tourist areas · Hotels', accent: '#f472b6' },
]

export const contractOffers: ServiceContract[] = [
  { id: 'contract-restaurant', service: 'food', client: 'The Garden Table', title: 'Daily restaurant deliveries', weeklyIncome: 2_400, requiredVehicles: 2, status: 'available' },
  { id: 'contract-business', service: 'parcel', client: 'Northbank Offices', title: 'Business parcel rounds', weeklyIncome: 4_100, requiredVehicles: 2, status: 'available' },
  { id: 'contract-hotel', service: 'shuttle', client: 'Grand Central Hotel', title: 'Airport transfer service', weeklyIncome: 6_800, requiredVehicles: 2, status: 'available' },
  { id: 'contract-care', service: 'accessible', client: 'Riverside Care', title: 'Patient transport rota', weeklyIncome: 5_200, requiredVehicles: 2, status: 'available' },
]
