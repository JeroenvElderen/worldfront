export type Coordinates = readonly [longitude: number, latitude: number]
export type VehicleStatus = 'available' | 'on-job' | 'maintenance'

export interface City { id: string; name: string; countryCode: string; coordinates: Coordinates; mapZoom: number }
export interface Company { id: string; name: string; cash: number; reputation: number; level: number; homeCityId: string; foundedAt: string }
export interface Vehicle { id: string; name: string; type: 'taxi' | 'coach' | 'van'; value: number; condition: number; fuel: number; capacity: number; status: VehicleStatus; cityId: string; driverId?: string }
export interface Driver { id: string; name: string; rating: number; salary: number; status: 'available' | 'driving' | 'off-duty' }
export interface Passenger { id: string; name: string; partySize: number }
export interface TaxiJob { id: string; cityId: string; pickup: Coordinates; destination: Coordinates; passengerIds: string[]; fare: number; status: 'offered' | 'accepted' | 'complete' }
export interface TravelAgency { id: string; name: string; cityId: string; level: number }
export interface Tour { id: string; agencyId: string; name: string; stops: Coordinates[]; price: number }
export interface GameSave { id: string; version: number; updatedAt: string; company: Company | null; startingCityId: string | null; vehicles: Vehicle[]; drivers: Driver[]; jobs: TaxiJob[]; agencies: TravelAgency[]; tours: Tour[]; passengers: Passenger[] }
