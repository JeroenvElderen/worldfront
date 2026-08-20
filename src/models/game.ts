export type Coordinates = [longitude: number, latitude: number]
export type VehicleStatus = 'available' | 'on-job' | 'maintenance'
export type VehicleOwnership = 'owned' | 'financed' | 'leased'
export type ServiceTripKind = 'fuel' | 'home'
export type TaxiPowertrain = 'diesel' | 'hybrid' | 'electric'
export type ExteriorAccessory = 'panoramic-roof' | 'towbar' | 'roof-rack' | 'mud-flaps' | 'wind-deflectors'

export interface City { id: string; name: string; countryCode: string; coordinates: Coordinates; mapZoom: number }
export interface Company { id: string; name: string; cash: number; reputation: number; level: number; homeCityId: string; foundedAt: string }
export interface PostalStop { id: string; label: string; coordinates: Coordinates }
export interface PostalRoute { stops: PostalStop[]; startedAt: string; arrivesAt: string; reward: number; plannedHours?: number }
export interface Vehicle { id: string; name: string; type: 'taxi' | 'coach' | 'van' | 'post'; modelId?: string; powertrain?: TaxiPowertrain; exteriorAccessories?: ExteriorAccessory[]; value: number; condition: number; fuel: number; capacity: number; topSpeedKmh?: number; status: VehicleStatus; cityId: string; position?: Coordinates; driverId?: string; ownership?: VehicleOwnership; leaseWeeklyCost?: number; serviceTrip?: { kind: ServiceTripKind; from: Coordinates; destination: Coordinates; label: string; startedAt: string; arrivesAt: string }; postalRoute?: PostalRoute }
export interface Driver { id: string; name: string; rating: number; salary: number; status: 'available' | 'driving' | 'off-duty'; fatigue: number; home: Coordinates; shift: 'day' | 'night' }
export interface Passenger { id: string; name: string; partySize: number }
export interface TaxiJob { id: string; cityId: string; pickup: Coordinates; destination: Coordinates; pickupLabel: string; destinationLabel: string; passengerIds: string[]; fare: number; distanceKm: number; durationMinutes: number; status: 'offered' | 'accepted' | 'complete'; offeredAt?: string; assignedVehicleId?: string; acceptedAt?: string }
export interface TravelAgency { id: string; name: string; cityId: string; level: number }
export interface Tour { id: string; agencyId: string; name: string; stops: Coordinates[]; price: number }
export interface Loan { id: string; principal: number; balance: number; paymentAmount: number; nextPaymentAt: string }
export interface DynamicEvent { id: string; name: string; description: string; fareMultiplier: number; fuelMultiplier: number; expiresAt: string }
export interface GameSave { id: string; version: number; updatedAt: string; company: Company | null; startingCityId: string | null; vehicles: Vehicle[]; drivers: Driver[]; jobs: TaxiJob[]; agencies: TravelAgency[]; tours: Tour[]; passengers: Passenger[]; jobRequestHistory: string[]; loans: Loan[]; activeEvent: DynamicEvent | null; nextEventAt: string; nextOperatingPaymentAt: string }
