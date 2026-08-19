export type Coordinates = [longitude: number, latitude: number];
export type VehicleType = 'taxi' | 'premium' | 'minivan' | 'minibus' | 'coach';
export type VehicleStatus = 'available' | 'on_trip' | 'maintenance';
export interface Vehicle { id: string; name: string; type: VehicleType; purchasePrice: number; condition: number; fuel: number; capacity: number; status: VehicleStatus; currentLocation: Coordinates; earnings: number; totalDistance: number; fareMultiplier: number; }
export interface TaxiJob { id: string; passengerName: string; pickupLocation: string; destination: string; pickupCoordinates: Coordinates; destinationCoordinates: Coordinates; distance: number; estimatedDuration: number; fare: number; passengerCount: number; status: 'available' | 'active' | 'completed' | 'ignored'; }
export interface ActiveTrip { jobId: string; vehicleId: string; progress: number; route: Coordinates[]; startedAt: number; durationMs: number; }
export interface Company { name: string; cash: number; level: number; xp: number; reputation: number; totalTrips: number; totalRevenue: number; currentCityId: string; }
export interface City { id: string; name: string; country: string; coordinates: Coordinates; unlockPrice: number; unlocked: boolean; tourismDemand: number; }
export interface Driver { id: string; name: string; salary: number; rating: number; assignedVehicleId?: string; }
export interface Tourist { id: string; name: string; interests: string[]; budget: number; }
export interface Hotel { id: string; name: string; cityId: string; coordinates: Coordinates; nightlyRate: number; rating: number; }
export interface Attraction { id: string; name: string; cityId: string; coordinates: Coordinates; admissionPrice: number; }
export interface TravelPackage { id: string; name: string; cityIds: string[]; hotelIds: string[]; attractionIds: string[]; price: number; durationDays: number; }
export interface TourRoute { id: string; name: string; stops: Coordinates[]; distance: number; durationMinutes: number; }
export interface Airport { id: string; name: string; code: string; cityId: string; coordinates: Coordinates; }
export interface AgencyOffice { id: string; cityId: string; rent: number; level: number; }
export interface ProgressionFeature { level: number; name: string; }
