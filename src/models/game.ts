export type Coordinates = [longitude: number, latitude: number]
export type VehicleStatus = 'available' | 'on-job' | 'maintenance'
export type VehicleOwnership = 'owned' | 'financed' | 'leased'
export type ServiceTripKind = 'fuel' | 'home'
export type TaxiPowertrain = 'diesel' | 'hybrid' | 'electric'
export type ExteriorAccessory = 'panoramic-roof' | 'towbar' | 'roof-rack' | 'mud-flaps' | 'wind-deflectors'
export type DriverTrait = 'careful' | 'efficient' | 'charming' | 'night-owl' | 'local-expert' | 'unreliable'
export type VehicleUpgrade = 'eco-tires' | 'premium-seats' | 'range-pack' | 'meter-pro' | 'roof-sign' | 'parcel-shelving' | 'dash-camera'
export type RefuelStrategy = 'automatic' | 'fast' | 'economy' | 'overnight'
export type JobCategory = 'standard' | 'airport' | 'family' | 'executive' | 'accessible' | 'late-night' | 'long-distance' | 'courier' | 'pet-friendly'
export type GoalMetric = 'fares' | 'earnings' | 'safe-jobs' | 'postal-rounds' | 'airport-jobs' | 'rating'
export type TransactionCategory = 'fares' | 'tips' | 'postal' | 'rentals' | 'tours' | 'coach' | 'rail' | 'ferry' | 'airline' | 'contracts' | 'expansion' | 'goals' | 'vehicles' | 'maintenance' | 'energy' | 'upgrades' | 'payroll' | 'leases' | 'loans'
export type Specialization = 'mobility' | 'tourism' | 'logistics' | 'sustainability'

export interface City { id: string; name: string; countryCode: string; coordinates: Coordinates; mapZoom: number }
export interface Company { id: string; name: string; cash: number; reputation: number; level: number; homeCityId: string; foundedAt: string }
export interface PostalStop { id: string; label: string; coordinates: Coordinates }
export interface PostalRoute { stops: PostalStop[]; startedAt: string; arrivesAt: string; reward: number; plannedHours?: number }
export interface RentalJourney { waypoints: Coordinates[]; startedAt: string; arrivesAt: string; reward: number; distanceKm: number }
export interface Vehicle { id: string; name: string; type: 'taxi' | 'coach' | 'van' | 'post' | 'rental'; modelId?: string; serviceClass?: 'tour-bus' | 'intercity'; powertrain?: TaxiPowertrain; exteriorAccessories?: ExteriorAccessory[]; upgrades?: VehicleUpgrade[]; refuelStrategy?: RefuelStrategy; value: number; purchasePrice?: number; purchasedAt?: string; odometerKm?: number; lifetimeRevenue?: number; lifetimeExpenses?: number; batteryHealth?: number; lastServiceAtKm?: number; condition: number; fuel: number; capacity: number; topSpeedKmh?: number; status: VehicleStatus; cityId: string; position?: Coordinates; driverId?: string; ownership?: VehicleOwnership; leaseMonthlyCost?: number; leaseWeeklyCost?: number; serviceTrip?: { kind: ServiceTripKind; from: Coordinates; destination: Coordinates; label: string; startedAt: string; arrivesAt: string }; postalRoute?: PostalRoute; rentalJourney?: RentalJourney; scheduledJourney?: { kind: 'tour' | 'coach'; routeId: string; startedAt: string; arrivesAt: string; reward: number; distanceKm: number; destination: Coordinates } }
export interface Driver { id: string; name: string; rating: number; salary: number; status: 'available' | 'driving' | 'off-duty'; fatigue: number; home: Coordinates; shift: 'day' | 'night'; trait?: DriverTrait; missedShiftUntil?: string }
export interface Passenger { id: string; name: string; partySize: number }
export interface TaxiJob { id: string; cityId: string; pickup: Coordinates; destination: Coordinates; pickupLabel: string; destinationLabel: string; passengerIds: string[]; fare: number; distanceKm: number; durationMinutes: number; category?: JobCategory; requiredUpgrade?: VehicleUpgrade; status: 'offered' | 'accepted' | 'complete'; offeredAt?: string; assignedVehicleId?: string; acceptedAt?: string; pickupTimeMultiplier?: number; satisfaction?: number; customerRating?: number; tip?: number; reputationEarned?: number }
export interface Branch { id: string; cityId: string; name: string; openedAt: string; managerName?: string }
export interface TravelAgency { id: string; name: string; cityId: string; level: number }
export interface Tour { id: string; agencyId: string; name: string; stops: Coordinates[]; price: number; vehicleId?: string }
export interface CoachRoute { id: string; fromCityId: string; toCityId: string; name: string; ticketPrice: number; vehicleId?: string }
export type TransportMode = 'train' | 'ferry' | 'airliner'
export interface TransportAsset { id: string; mode: TransportMode; name: string; model: string; capacity: number; speedKmh: number; value: number; condition: number; status: 'available' | 'on-route'; cityId: string; lifetimeRevenue: number; journey?: { routeId: string; startedAt: string; arrivesAt: string; reward: number; distanceKm: number; destinationCityId: string } }
export interface TransportRoute { id: string; mode: TransportMode; fromCityId: string; toCityId: string; name: string; ticketPrice: number; assetId?: string }
export interface AutomationPolicy { enabled: boolean; minFare: number; maxPickupKm: number; autoServiceBelow: number }
export interface BusinessContract { id: string; name: string; description: string; category: JobCategory | 'postal' | 'tour'; target: number; progress: number; reward: number; expiresAt: string; accepted: boolean; completed: boolean }
export interface Loan { id: string; principal: number; balance: number; paymentAmount: number; nextPaymentAt: string }
export interface DynamicEvent { id: string; name: string; description: string; fareMultiplier: number; fuelMultiplier: number; expiresAt: string }
export interface CompanyGoal { id: string; cadence: 'daily' | 'weekly'; metric: GoalMetric; label: string; target: number; progress: number; cashReward: number; reputationReward: number; expiresAt: string; completed: boolean; claimed: boolean }
export interface DriverCandidate extends Driver { expiresAt: string }
export interface FinancialTransaction { id: string; occurredAt: string; category: TransactionCategory; description: string; amount: number; vehicleId?: string }
export interface GameSave { id: string; version: number; updatedAt: string; pausedAt: string | null; company: Company | null; startingCityId: string | null; activeCityId: string | null; branches: Branch[]; countryLicenses: string[]; vehicles: Vehicle[]; garageLevel: number; transportAssets: TransportAsset[]; transportRoutes: TransportRoute[]; drivers: Driver[]; driverCandidates: DriverCandidate[]; jobs: TaxiJob[]; agencies: TravelAgency[]; tours: Tour[]; coachRoutes: CoachRoute[]; contracts: BusinessContract[]; specialization: Specialization | null; specializationPoints: number; automation: AutomationPolicy; passengers: Passenger[]; goals: CompanyGoal[]; jobRequestHistory: string[]; loans: Loan[]; financialTransactions: FinancialTransaction[]; activeEvent: DynamicEvent | null; nextEventAt: string; nextOperatingPaymentAt: string }
