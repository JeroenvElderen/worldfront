import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { cities, countries, getCity } from '../data/cities'
import { transportModels } from '../data/transport'
import { getTaxiModel } from '../data/taxis'
import { getPostVehicleModel } from '../data/postVehicles'
import type { AutomationRole, BrandStrategy, City, CleaningService, Company, Coordinates, DepotFacility, Difficulty, DispatcherStrategy, Driver, DriverCertification, ExteriorAccessory, FerryRouteOption, FinancialTransaction, GameSave, IncidentResponse, MaintenanceKind, RefuelStrategy, ResearchId, Specialization, TaxiFerryCrossing, TaxiJob, TerritoryExpansion, TerritoryFeature, TireType, TransactionCategory, TransportMode, Vehicle, VehicleUpgrade } from '../models/game'
import { indexedDbStorage } from '../services/saveDatabase'
import { addReputation, DEPOT_FACILITY_MAX_LEVEL, depotFacilityLevel, depotFacilityUpgradeCost, fleetSlotCapacity, garageUpgradeCost, LEASING_UNLOCK_LEVEL, levelForReputation, maxJobDistanceForFleet } from '../services/companyProgression'
import {
  generateJobOffers,
  MAX_PICKUP_DISTANCE_KM,
} from '../services/jobOfferService'
import { acceptJobState, completeArrivedJobsState, completeJobState, distanceKmBetween, getJobJourney, jobDestination, jobOfferExpiresAt, jobPickup, MAX_JOB_OFFERS } from '../services/jobEngine'
import { createDynamicEvent, energyUseForJob, fatigueUseForJob, OVERNIGHT_STAY_COST, startRecoveryTrip } from '../services/operationsEngine'
import { nextMonthlyPaymentAt } from '../services/gameTime'
import { createPostalRoute } from '../services/postalEngine'
import { createRentalJourney } from '../services/rentalEngine'
import { maintenanceCost, vehicleMarketValue } from '../services/vehicleEconomics'
import { canResearch, hasResearch, researchNodes } from '../services/research'
import { calculateJobOutcome, createDriverCandidates, createGoals, energyMultiplier, jobOfferCapacity, pickupSpeedMultiplier, updateGoals, upgradeAppliesToVehicle, upgradeDetails, upgradeFareMultiplier, vehicleCanTakeJob, vehicleComfortScore } from '../services/earlyGameEngine'
import { cityDemandMultiplier, createCityEconomy, HOTEL_PURCHASE_COST, hotelUpgradeCost, pendingHotelRevenue } from '../services/hotelEconomy'
import { competitorGrowth, createCompetitors, createWorldCondition, defaultBrandStrategy, fareMultiplier, marketingDemandMultiplier } from '../services/worldSystems'
import { compactLegacyDiscoveries, extendExploredTerritory, isInsideVillageTerritories, type VillageTerritoryCenter } from '../services/territoryGeometry'
import { createTrafficIncident, trafficImpactForJob } from '../services/operationsIncidents'
import { cleaningDetails, createAutomationEmployee, createCustomerReview, createStarterDispatcher, createStarterMechanic, maintenanceAdvisories, maintenanceQuote, recruitDispatcher, recruitMechanic, tireDetails, tireWearForDistance } from '../services/fleetOperations'
import { ferryCrossingsHaveActiveService } from '../services/ferryService'
import { resolveLandsideFerryTerminals } from '../services/ferryTerminals'
import { harbourId } from '../services/maritimeRoutes'

export type Section = 'map' | 'jobs' | 'ferries' | 'operations' | 'fleet' | 'hotels' | 'finance' | 'travel' | 'company'
interface GameActions { initializeCompany: (city: City) => void; buildStation: (coordinates: Coordinates) => void; expandTerritory: (coordinates: Coordinates) => void; buyHotel: (coordinates: Coordinates) => void; upgradeHotel: (hotelId: string) => void; collectHotelRevenue: (hotelId: string) => void; switchStation: (cityId: string) => void; unlockResearch: (researchId: ResearchId) => void; upgradeDepotFacility: (cityId: string, facility: DepotFacility) => void; pauseGame: () => void; resumeGame: () => void; setSection: (section: Section) => void; openJob: (jobId: string) => void; showJobOnMap: (jobId: string) => void; refreshJobs: () => Promise<void>; addRandomJob: () => Promise<void>; acceptJob: (jobId: string, navigateToMap?: boolean) => void; saveJobPickupRoute: (jobId: string, coordinates: Coordinates[], ferryCrossings: TaxiFerryCrossing[], durationMinutes: number) => void; saveJobRoute: (jobId: string, coordinates: Coordinates[], ferryCrossings: TaxiFerryCrossing[]) => void; markJobFerryCrossingComplete:(jobId: string, leg: 'pickup' | 'passenger', crossingIndex: number, delayMs: number,) => void; declineJob: (jobId: string) => void; completeJob: (jobId: string) => void; tickJobs: () => void; cleanTaxi: (vehicleId: string) => void; buyTaxi: (modelId: string) => void; leaseTaxi: (modelId: string) => void; financeTaxi: (modelId: string) => void; upgradeGarage: () => void; buyPostVehicle: (modelId: string) => void; startPostalRoute: (vehicleId: string) => void; buyRentalCar: (modelId: string) => void; startRental: (vehicleId: string) => void; buyCountryLicense: (countryCode: string) => void; openAgency: () => void; createTour: () => void; dispatchTour: (tourId: string, vehicleId: string) => void; buyTourBus: () => void; buyCoach: () => void; createCoachRoute: (toCityId: string) => void; dispatchCoach: (routeId: string, vehicleId: string) => void; buyTransportAsset: (mode: TransportMode) => void; createTransportRoute: (mode: TransportMode, toCityId: string) => void; placeHarbour: (coordinates: Coordinates, routes: FerryRouteOption[]) => void; createFerryRoute: (route: FerryRouteOption) => void; dispatchTransport: (routeId: string, assetId: string) => void; setAutomation: (patch: Partial<GameSave['automation']>) => void; runAutomation: () => void; acceptContract: (contractId: string) => void; chooseSpecialization: (specialization: Specialization) => void; takeLoan: (amount: number) => void; sellVehicle: (vehicleId: string) => void; setDriverShift: (driverId: string, shift: Driver['shift']) => void; hireDriver: (candidateId: string, vehicleId: string) => void; refreshDriverCandidates: () => void; serviceVehicle: (vehicleId: string, service: 'quick' | 'full' | 'preventative') => void; installUpgrade: (vehicleId: string, upgrade: VehicleUpgrade) => void; setRefuelStrategy: (vehicleId: string, strategy: RefuelStrategy) => void; refuelVehicle: (vehicleId: string) => void; claimGoal: (goalId: string) => void; toggleExteriorAccessory: (vehicleId: string, accessory: ExteriorAccessory) => void; setDifficulty: (difficulty: Difficulty) => void; setBrandStrategy: (patch: Partial<BrandStrategy>) => void; launchMarketing: (campaign: BrandStrategy['marketingCampaign']) => void; partnerCompetitor: (competitorId: string) => void; acquireCompetitor: (competitorId: string) => void; trainDriver: (driverId: string, certification: DriverCertification) => void; resolveIncident: (incidentId: string) => void; setRouteTimetable: (kind: 'coach' | 'transport', routeId: string, departureHour: number, frequencyHours: number) => void; resetGame: () => void }
interface GameActions {
  hireAutomationEmployee: (role: AutomationRole) => void
  fireAutomationEmployee: (employeeId: string) => void
  updateAutomationEmployee: (employeeId: string, patch: { enabled?: boolean; spendingLimit?: number }) => void
  cleanVehicle: (vehicleId: string, service: CleaningService) => void
  fitTires: (vehicleId: string, tireType: TireType) => void
  startMaintenance: (vehicleId: string, kind: MaintenanceKind) => void
  dismissMaintenanceAlert: (alertId: string) => void
  recruitMechanic: () => void
  recruitDispatcher: () => void
  setDispatcherStrategy: (dispatcherId: string, strategy: DispatcherStrategy) => void
  respondToReview: (reviewId: string, response: 'thanks' | 'apology' | 'voucher' | 'dispute') => void
}
interface GameState extends GameSave { activeSection: Section; focusedJobId: string | null; hasHydrated: boolean; jobsLoading: boolean; jobsError: string | null; setHasHydrated: (value: boolean) => void }

const initialContracts = () => [
  { id: crypto.randomUUID(), name: 'Airport partner', description: 'Complete 5 airport transfers', category: 'airport' as const, target: 5, progress: 0, reward: 4_500, expiresAt: new Date(Date.now() + 7 * 60_000).toISOString(), accepted: false, completed: false },
  { id: crypto.randomUUID(), name: 'City post tender', description: 'Complete 3 postal rounds', category: 'postal' as const, target: 3, progress: 0, reward: 6_000, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), accepted: false, completed: false },
  { id: crypto.randomUUID(), name: 'Visitor experience', description: 'Complete 2 guided tours', category: 'tour' as const, target: 2, progress: 0, reward: 5_000, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), accepted: false, completed: false },
]
const blankSave: GameSave = { id: 'autosave', version: 25, updatedAt: new Date(0).toISOString(), pausedAt: null, company: null, startingCityId: null, activeCityId: null, branches: [], territoryExpansions: [], exploredTerritory: null, customCities: [], territoryLicenses: [], countryLicenses: [], hotels: [], cityEconomies: [], vehicles: [], garageLevel: 0, transportAssets: [], transportRoutes: [], discoveredFerryRoutes: [], purchasedHarbours: [], drivers: [], driverCandidates: [], mechanics: [], dispatchers: [], automationEmployees: [], maintenanceAlerts: [], customerReviews: [], jobs: [], agencies: [], tours: [], coachRoutes: [], contracts: [], specialization: null, specializationPoints: 1, completedResearch: [], automation: { enabled: false, minFare: 20, maxPickupKm: 10, minFuel: 20, minCondition: 30, autoServiceBelow: 30, cashReserve: 5_000, activity: [] }, passengers: [], goals: [], jobRequestHistory: [], loans: [], financialTransactions: [], activeEvent: null, nextEventAt: new Date(0).toISOString(), nextOperatingPaymentAt: new Date(0).toISOString(), competitors: [], difficulty: 'standard', worldCondition: createWorldCondition(0), incidents: [], trafficIncidents: [], nextTrafficIncidentAt: new Date(0).toISOString(), brandStrategy: defaultBrandStrategy }


const transaction = (category: TransactionCategory, description: string, amount: number, vehicleId?: string, occurredAt = new Date().toISOString()): FinancialTransaction => ({
  id: crypto.randomUUID(), occurredAt, category, description, amount, vehicleId,
})
const addTransactions = (existing: FinancialTransaction[] | undefined, ...entries: FinancialTransaction[]) =>
  [...(existing ?? []), ...entries].slice(-500)
const availableJobOfferCapacity = (state: Pick<GameState, 'vehicles' | 'drivers'>) => jobOfferCapacity(state.vehicles, state.drivers)
const taxiJobGenerationPosition = (vehicle: Vehicle, fallback: Coordinates) => vehicle.position ?? fallback
const jobGeneratingTaxis = (state: Pick<GameState, 'vehicles' | 'drivers'>) => state.vehicles.filter((vehicle) => {
  if (vehicle.type !== 'taxi' || !vehicle.driverId) return false
  const driver = state.drivers.find((candidate) => candidate.id === vehicle.driverId)
  return vehicle.status === 'available' && driver?.status === 'available'
})

const selectJobGenerationTaxi = (
  state: Pick<
    GameState,
    'vehicles' | 'drivers' | 'jobs' | 'customCities'
  >,
) => {
  const taxis = jobGeneratingTaxis(state)

  if (!taxis.length) return undefined

  const scoredTaxis = taxis.map((vehicle) => {
    const city = getCity(vehicle.cityId, state.customCities)

    const fallback =
      vehicle.position ??
      city?.coordinates

    if (!fallback) {
      return {
        vehicle,
        nearbyJobs: Number.POSITIVE_INFINITY,
      }
    }

    const position = taxiJobGenerationPosition(
      vehicle,
      fallback,
    )

    const nearbyJobs = state.jobs.filter(
      (job) =>
        job.status === 'offered' &&
        distanceKmBetween(
          position,
          jobPickup(job),
        ) <= MAX_PICKUP_DISTANCE_KM * 1.5,
    ).length

    return {
      vehicle,
      nearbyJobs,
    }
  })

  const fewestJobs = Math.min(
    ...scoredTaxis.map((item) => item.nearbyJobs),
  )

  const candidates = scoredTaxis.filter(
    (item) => item.nearbyJobs === fewestJobs,
  )

  return candidates[
    Math.floor(Math.random() * candidates.length)
  ]?.vehicle
}

const fitOffersToAvailableTaxis = (jobs: GameSave['jobs'], taxiCount: number) => {
  let offersKept = 0
  return jobs.filter((job) => job.status !== 'offered' || offersKept++ < taxiCount)
}
const newVehicleLifecycle = (price: number, purchasedAt = new Date().toISOString()) => ({
  purchasePrice: price, purchasedAt, odometerKm: 0, lifetimeRevenue: 0, lifetimeExpenses: 0, batteryHealth: 100, lastServiceAtKm: 0,
})
const researchFleetSlots = (state: Pick<GameState, 'completedResearch' | 'branches'>) =>
  (hasResearch(state.completedResearch ?? [], 'autonomous-operations') ? 4 : 0) +
  (hasResearch(state.completedResearch ?? [], 'global-network') ? 4 : 0) +
  (hasResearch(state.completedResearch ?? [], 'regional-hubs') ? state.branches.length : 0)
const hasFleetSlot = (state: Pick<GameState, 'company' | 'garageLevel' | 'vehicles' | 'branches' | 'completedResearch'>) =>
  Boolean(state.company && state.vehicles.length < fleetSlotCapacity(state.company.level, state.garageLevel ?? 0, state.branches) + researchFleetSlots(state))
const unlockedTerritoryCenters = (state: Pick<GameState, 'branches' | 'territoryExpansions'>): VillageTerritoryCenter[] => [
  ...state.branches.flatMap((branch) => branch.coordinates ? [{ id: branch.id, coordinates: branch.coordinates }] : []),
  ...(state.territoryExpansions ?? []).filter((area) => area.source !== 'taxi-discovery').map(({ id, coordinates, routeCoordinates, radiusKm, source }) => ({
    id,
    coordinates,
    routeCoordinates,
    radiusKm,
    source: source === 'ferry-discovery' ? 'ferry-discovery' as const : 'village' as const,
  })),
]
const completedJobRoute = (job: TaxiJob, start?: Coordinates) => {
  const pickupRoute = job.pickupRouteCoordinates ?? [start, jobPickup(job)]
  return [...pickupRoute, ...(job.routeCoordinates ?? [jobPickup(job), jobDestination(job)]).slice(1)]
    .filter((point): point is Coordinates => Boolean(point))
}
const addTaxiDiscovery = (existing: TerritoryFeature | null, job: TaxiJob, start: Coordinates | undefined) => {
  const routeCoordinates = completedJobRoute(job, start)
  return extendExploredTerritory(existing, routeCoordinates)
}
const advanceContracts = (contracts: GameSave['contracts'], category: GameSave['contracts'][number]['category']) => contracts.map((contract) => {
  if (!contract.accepted || contract.completed || contract.category !== category) return contract
  const progress = Math.min(contract.target, contract.progress + 1)
  return { ...contract, progress, completed: progress >= contract.target }
})
export const useGameStore = create<GameState & GameActions>()(persist((set, get) => ({
  ...blankSave, activeSection: 'map', focusedJobId: null, hasHydrated: false, jobsLoading: false, jobsError: null,
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
  setSection: (activeSection) => set({ activeSection }),
  openJob: (focusedJobId) => set({ focusedJobId, activeSection: 'jobs' }),
  showJobOnMap: (focusedJobId) => set({ focusedJobId, activeSection: 'map' }),
  initializeCompany: (city) => {
    const cityId = city.id
    const now = new Date().toISOString()
    const company: Company = { id: crypto.randomUUID(), name: 'Travel Empire', cash: 25_000, reputation: 0, level: 1, homeCityId: cityId, foundedAt: now }
    const starter = getTaxiModel('toyota-corolla')
    const home = city.coordinates
    const driver: Driver = { id: crypto.randomUUID(), name: 'Alex Morgan', rating: 4.7, salary: 650, status: 'available', fatigue: 0, home, shift: 'day', trait: 'careful', experience: 0, morale: 85, certifications: [], completedTrips: 0, careerEarnings: 0 }
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${starter.brand} ${starter.name} 1`, type: 'taxi', modelId: starter.id, powertrain: starter.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: starter.price, ...newVehicleLifecycle(starter.price, now), condition: 100, cleanliness: 100, tireCondition: 100, tireType: 'touring', tireInstalledAtKm: 0, fuel: 100, capacity: starter.capacity, topSpeedKmh: starter.topSpeedKmh, status: 'available', cityId, position: home, driverId: driver.id, ownership: 'owned' }
    const initialMarkets = [city, ...cities.filter((candidate) => candidate.countryCode === city.countryCode && candidate.id !== city.id)].map(createCityEconomy)
    set({ ...blankSave, company, startingCityId: cityId, activeCityId: cityId, customCities: [city], territoryLicenses: [`${city.countryCode}:${city.regionCode ?? city.regionName ?? city.name}`], countryLicenses: [city.countryCode], cityEconomies: initialMarkets, branches: [{ id: crypto.randomUUID(), cityId, name: 'Station 1', openedAt: now, managerName: 'Alex Morgan', coordinates: city.coordinates, depot: { parking: 0, workshop: 0, energy: 0, lounge: 0 } }], contracts: initialContracts(), competitors: createCompetitors(cityId), worldCondition: createWorldCondition(), brandStrategy: defaultBrandStrategy, vehicles: [vehicle], drivers: [driver], driverCandidates: createDriverCandidates(home), mechanics: [createStarterMechanic(cityId)], dispatchers: [createStarterDispatcher(cityId)], goals: createGoals(), financialTransactions: [transaction('loans', 'Founder capital', 25_000, undefined, now)], activeEvent: createDynamicEvent(), nextEventAt: new Date(Date.now() + 8 * 60_000).toISOString(), nextOperatingPaymentAt: nextMonthlyPaymentAt(now), updatedAt: now, activeSection: 'map', hasHydrated: true, jobsLoading: false, jobsError: null })
  },
  buildStation: (coordinates) => set((state) => {
    const referenceCity = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    const starter = getTaxiModel('toyota-corolla')
    const constructionCost = Math.round(15_000 * (state.specialization === 'mobility' ? .9 : 1) * (hasResearch(state.completedResearch ?? [], 'prefab-depots') ? .8 : 1))
    const packageCost = constructionCost + starter.price
    if (!state.company || !referenceCity || state.company.level < 2 || state.company.cash < packageCost || !hasFleetSlot(state)) return state
    const sequence = state.branches.length + 1
    const cityId = `station-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const city: City = { id: cityId, name: `Station ${sequence}`, countryCode: referenceCity.countryCode, countryName: referenceCity.countryName, coordinates, mapZoom: 13 }
    const station = { id: crypto.randomUUID(), cityId, name: `Station ${sequence}`, coordinates, openedAt: now, depot: { parking: 0, workshop: 0, energy: 0, lounge: 0 } }
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${starter.brand} ${starter.name} ${state.vehicles.filter((item) => item.modelId === starter.id).length + 1}`, type: 'taxi', modelId: starter.id, powertrain: starter.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: starter.price, ...newVehicleLifecycle(starter.price, now), condition: 100, fuel: 100, capacity: starter.capacity, topSpeedKmh: starter.topSpeedKmh, status: 'available', cityId, position: coordinates, ownership: 'owned' }
    return {
      company: { ...state.company, cash: state.company.cash - packageCost }, customCities: [...state.customCities, city], cityEconomies: [...state.cityEconomies, createCityEconomy(city)], branches: [...state.branches, station], vehicles: [...state.vehicles, vehicle], activeCityId: cityId,
      financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `Built ${station.name}`, -constructionCost, undefined, now), transaction('vehicles', `Station vehicle: ${vehicle.name}`, -starter.price, vehicle.id, now)),
      updatedAt: now, activeSection: 'map',
    }
  }),
  expandTerritory: (coordinates) => set((state) => {
    const sequence = (state.territoryExpansions ?? []).filter((area) => area.source !== 'taxi-discovery' && area.source !== 'ferry-discovery').length + 1
    const cost = 5_000 * (sequence - 1)
    if (!state.company || state.company.cash < cost) return state
    const now = new Date().toISOString()
    const expansion: TerritoryExpansion = { id: crypto.randomUUID(), coordinates, purchasedAt: now, source: 'purchase' }
    return { territoryExpansions: [...(state.territoryExpansions ?? []), expansion], company: { ...state.company, cash: state.company.cash - cost }, financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `Village territory ${sequence}`, -cost, undefined, now)), updatedAt: now }
  }),
  buyHotel: (coordinates) => set((state) => {
    const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    if (!state.company || !city || state.company.level < 2 || state.company.cash < HOTEL_PURCHASE_COST) return state
    const now = new Date().toISOString()
    const sequence = state.hotels.filter((hotel) => hotel.cityId === city.id).length + 1
    const hotel = { id: crypto.randomUUID(), cityId: city.id, name: `${city.name} Hotel ${sequence}`, coordinates, level: 1, rooms: 30, purchasedAt: now, lastCollectedAt: now, lifetimeRevenue: 0 }
    return { company: { ...state.company, cash: state.company.cash - HOTEL_PURCHASE_COST }, hotels: [...state.hotels, hotel], cityEconomies: state.cityEconomies.map((economy) => economy.cityId === city.id ? { ...economy, tourism: Math.min(100, economy.tourism + 2), prosperity: Math.min(100, economy.prosperity + 1) } : economy), financialTransactions: addTransactions(state.financialTransactions, transaction('hotels', `Purchased ${hotel.name}`, -HOTEL_PURCHASE_COST)), updatedAt: now }
  }),
  upgradeHotel: (hotelId) => set((state) => {
    const hotel = state.hotels.find((candidate) => candidate.id === hotelId)
    if (!state.company || !hotel || hotel.level >= 5) return state
    const cost = hotelUpgradeCost(hotel)
    if (state.company.cash < cost) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, hotels: state.hotels.map((candidate) => candidate.id === hotelId ? { ...candidate, level: candidate.level + 1, rooms: candidate.rooms + 20 + candidate.level * 10 } : candidate), cityEconomies: state.cityEconomies.map((economy) => economy.cityId === hotel.cityId ? { ...economy, tourism: Math.min(100, economy.tourism + 3), business: Math.min(100, economy.business + 1), prosperity: Math.min(100, economy.prosperity + 2), trend: Math.min(8, economy.trend + 1) } : economy), financialTransactions: addTransactions(state.financialTransactions, transaction('hotels', `Expanded ${hotel.name}`, -cost)), updatedAt: new Date().toISOString() }
  }),
  collectHotelRevenue: (hotelId) => set((state) => {
    const hotel = state.hotels.find((candidate) => candidate.id === hotelId)
    const economy = state.cityEconomies.find((candidate) => candidate.cityId === hotel?.cityId)
    if (!state.company || !hotel || !economy) return state
    const revenue = pendingHotelRevenue(hotel, economy)
    if (revenue < 1) return state
    const now = new Date().toISOString()
    return { company: { ...state.company, cash: state.company.cash + revenue }, hotels: state.hotels.map((candidate) => candidate.id === hotelId ? { ...candidate, lastCollectedAt: now, lifetimeRevenue: candidate.lifetimeRevenue + revenue } : candidate), financialTransactions: addTransactions(state.financialTransactions, transaction('hotels', `${hotel.name} room revenue`, revenue)), updatedAt: now }
  }),
  switchStation: (cityId) => set((state) => state.branches.some((station) => station.cityId === cityId) ? { activeCityId: cityId, activeSection: 'map' } : state),
  unlockResearch: (researchId) => set((state) => {
    const node = researchNodes.find((candidate) => candidate.id === researchId)
    if (!node || !state.company || !canResearch(node, state.completedResearch ?? [], state.company.level)) return state
    return { completedResearch: [...(state.completedResearch ?? []), researchId], updatedAt: new Date().toISOString() }
  }),
  upgradeDepotFacility: (cityId, facility) => set((state) => {
    const branch = state.branches.find((candidate) => candidate.cityId === cityId)
    const currentLevel = depotFacilityLevel(branch, facility)
    const cost = depotFacilityUpgradeCost(facility, currentLevel)
    if (!state.company || !branch || currentLevel >= DEPOT_FACILITY_MAX_LEVEL || state.company.cash < cost) return state
    return {
      company: { ...state.company, cash: state.company.cash - cost },
      branches: state.branches.map((candidate) => candidate.id === branch.id ? {
        ...candidate,
        depot: { parking: 0, workshop: 0, energy: 0, lounge: 0, ...candidate.depot, [facility]: currentLevel + 1 },
      } : candidate),
      financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `${branch.name}: ${facility} level ${currentLevel + 1}`, -cost)),
      updatedAt: new Date().toISOString(),
    }
  }),
  pauseGame: () => set((state) => state.company && !state.pausedAt
    ? { pausedAt: new Date().toISOString() }
    : state),
  resumeGame: () => set((state) => {
    if (!state.pausedAt) return state
    // Keep absolute deadlines unchanged. tickJobs runs immediately after this
    // action and deterministically catches up everything that finished while
    // the WebView was suspended or force-closed.
    return { pausedAt: null, updatedAt: new Date().toISOString() }
  }),
  refreshJobs: async () => {
    const state = useGameStore.getState()
const generationTaxi = selectJobGenerationTaxi(state)
    if (!(state.activeCityId ?? state.startingCityId) || state.jobsLoading || !generationTaxi) return
    const city = getCity(generationTaxi.cityId, state.customCities)
    if (!city) return
    set({ jobsLoading: true, jobsError: null })
    try {
      const level = levelForReputation(state.company?.reputation ?? 0)
      // Search from the taxi so newly explored coverage can produce work even
      // after the vehicle has travelled beyond its original station's area.
      const searchArea = { ...city, coordinates: taxiJobGenerationPosition(generationTaxi, city.coordinates) }
      const taxis = state.vehicles.filter((vehicle) => vehicle.type === 'taxi')
      const maxDistanceKm = maxJobDistanceForFleet(level, taxis.length) * (hasResearch(state.completedResearch ?? [], 'predictive-demand') ? 1.25 : 1)
      const generated = await generateJobOffers(searchArea, 1, state.jobRequestHistory ?? [], maxDistanceKm, undefined, (state.activeEvent?.fareMultiplier ?? 1) * cityDemandMultiplier(state.cityEconomies.find((economy) => economy.cityId === city.id)) * (state.worldCondition?.demandMultiplier ?? 1) * marketingDemandMultiplier(state.brandStrategy ?? defaultBrandStrategy) * fareMultiplier(state.brandStrategy?.fareStrategy ?? 'standard') * Math.max(.55, 1 - (state.competitors ?? []).filter((competitor) => competitor.relationship === 'rival').reduce((sum, competitor) => sum + competitor.marketShare, 0) / 200), unlockedTerritoryCenters(state), state.exploredTerritory, state.transportRoutes ?? [], state.transportAssets ?? [])
      set((latest) => {
        const openSlots = Math.max(0, availableJobOfferCapacity(latest) - latest.jobs.filter((job) => job.status === 'offered').length)
        const acceptedJobs = generated.jobs.slice(0, openSlots)
        const acceptedPassengerIds = new Set(acceptedJobs.flatMap((job) => job.passengerIds))
        return { jobs: [...latest.jobs.filter((job) => job.status !== 'complete'), ...acceptedJobs], passengers: [...latest.passengers, ...generated.passengers.filter((passenger) => acceptedPassengerIds.has(passenger.id))], jobRequestHistory: [...(latest.jobRequestHistory ?? []), ...generated.signatures.slice(0, openSlots)].slice(-100), updatedAt: new Date().toISOString(), jobsLoading: false }
      })
    } catch (error) {
      set({ jobsLoading: false, jobsError: error instanceof Error ? error.message : 'Could not generate requests.' })
    }
  },
  addRandomJob: async () => {
  const state = useGameStore.getState()

  const offeredCount = state.jobs.filter(
    (job) => job.status === 'offered',
  ).length

  const targetOfferCount = Math.min(
    MAX_JOB_OFFERS,
    availableJobOfferCapacity(state),
  )

  const slotsRemaining = targetOfferCount - offeredCount

  const generationTaxis = jobGeneratingTaxis(state)

  if (
    !(state.activeCityId ?? state.startingCityId) ||
    state.jobsLoading ||
    !generationTaxis.length ||
    slotsRemaining <= 0
  ) {
    return
  }

  set({
    jobsLoading: true,
    jobsError: null,
  })

  try {
    const level = levelForReputation(
      state.company?.reputation ?? 0,
    )

    const taxis = state.vehicles.filter(
      (vehicle) => vehicle.type === 'taxi',
    )

    const maxDistanceKm =
      maxJobDistanceForFleet(level, taxis.length) *
      (
        hasResearch(
          state.completedResearch ?? [],
          'predictive-demand',
        )
          ? 1.25
          : 1
      )

    const territoryCenters = unlockedTerritoryCenters(state)

    /*
     * Give priority to taxis that currently have the fewest
     * offered jobs near them.
     */
    const orderedTaxis = [...generationTaxis].sort(
      (left, right) => {
        const countNearbyJobs = (vehicle: Vehicle) => {
          const city = getCity(
            vehicle.cityId,
            state.customCities,
          )

          const fallback =
            vehicle.position ??
            city?.coordinates

          if (!fallback) {
            return Number.POSITIVE_INFINITY
          }

          const position = taxiJobGenerationPosition(
            vehicle,
            fallback,
          )

          return state.jobs.filter(
            (job) =>
              job.status === 'offered' &&
              distanceKmBetween(
                position,
                jobPickup(job),
              ) <= MAX_PICKUP_DISTANCE_KM * 1.5,
          ).length
        }

        return (
          countNearbyJobs(left) -
          countNearbyJobs(right)
        )
      },
    )

    const generatedBatches: Awaited<
      ReturnType<typeof generateJobOffers>
    >[] = []

    const generatedSignatures: string[] = []

    const generatedPerCity = new Map<string, number>()

    let lastGenerationError: unknown = null

    /*
     * Generate at most ONE job around each taxi.
     *
     * Taxi A -> one pickup near Taxi A
     * Taxi B -> one pickup near Taxi B
     * Taxi C -> one pickup near Taxi C
     */
    for (const generationTaxi of orderedTaxis) {
      if (generatedBatches.length >= slotsRemaining) {
        break
      }

      const city = getCity(
        generationTaxi.cityId,
        state.customCities,
      )

      if (!city) continue

      const cityCapacity = availableJobOfferCapacity({
        vehicles: state.vehicles.filter(
          (vehicle) => vehicle.cityId === city.id,
        ),
        drivers: state.drivers,
      })

      const existingCityOffers = state.jobs.filter(
        (job) =>
          job.status === 'offered' &&
          job.cityId === city.id,
      ).length

      const alreadyGenerated =
        generatedPerCity.get(city.id) ?? 0

      if (
        existingCityOffers + alreadyGenerated >=
        cityCapacity
      ) {
        continue
      }

      const searchArea = {
        ...city,

        // This is the important part:
        // generate this job around THIS taxi.
        coordinates: taxiJobGenerationPosition(
          generationTaxi,
          city.coordinates,
        ),
      }

      const demandMultiplier =
        (state.activeEvent?.fareMultiplier ?? 1) *

        cityDemandMultiplier(
          state.cityEconomies.find(
            (economy) => economy.cityId === city.id,
          ),
        ) *

        (state.worldCondition?.demandMultiplier ?? 1) *

        marketingDemandMultiplier(
          state.brandStrategy ?? defaultBrandStrategy,
        ) *

        fareMultiplier(
          state.brandStrategy?.fareStrategy ??
            'standard',
        ) *

        Math.max(
          .55,
          1 -
            (state.competitors ?? [])
              .filter(
                (competitor) =>
                  competitor.relationship === 'rival',
              )
              .reduce(
                (sum, competitor) =>
                  sum + competitor.marketShare,
                0,
              ) /
              200,
        )

      try {
        const generated = await generateJobOffers(
          searchArea,

          // Exactly one job for this taxi.
          1,

          [
            ...(state.jobRequestHistory ?? []),
            ...generatedSignatures,
          ],

          maxDistanceKm,
          undefined,
          demandMultiplier,
          territoryCenters,
          state.exploredTerritory,
          state.transportRoutes ?? [],
          state.transportAssets ?? [],
        )

        if (!generated.jobs.length) continue

        generatedBatches.push(generated)

        generatedSignatures.push(
          ...generated.signatures,
        )

        generatedPerCity.set(
          city.id,
          alreadyGenerated + generated.jobs.length,
        )
      } catch (error) {
        /*
         * Failure around one taxi should not prevent another
         * taxi from receiving a nearby job.
         */
        lastGenerationError = error
      }
    }

    const generatedJobs = generatedBatches.flatMap(
      (batch) => batch.jobs,
    )

    const generatedPassengers =
      generatedBatches.flatMap(
        (batch) => batch.passengers,
      )

    if (!generatedJobs.length) {
      throw (
        lastGenerationError ??
        new Error(
          'Could not generate a job near any taxi.',
        )
      )
    }

    set((latest) => {
      const openSlots = Math.max(
        0,
        availableJobOfferCapacity(latest) -
          latest.jobs.filter(
            (job) => job.status === 'offered',
          ).length,
      )

      const acceptedJobs =
        generatedJobs.slice(0, openSlots)

      const acceptedPassengerIds = new Set(
        acceptedJobs.flatMap(
          (job) => job.passengerIds,
        ),
      )

      return {
        jobs: [
          ...latest.jobs.filter(
            (job) => job.status !== 'complete',
          ),
          ...acceptedJobs,
        ],

        passengers: [
          ...latest.passengers,
          ...generatedPassengers.filter(
            (passenger) =>
              acceptedPassengerIds.has(passenger.id),
          ),
        ],

        jobRequestHistory: [
          ...(latest.jobRequestHistory ?? []),
          ...generatedSignatures.slice(
            0,
            acceptedJobs.length,
          ),
        ].slice(-100),

        updatedAt: new Date().toISOString(),
        jobsLoading: false,
      }
    })
  } catch (error) {
    set({
      jobsLoading: false,
      jobsError:
        error instanceof Error
          ? error.message
          : 'Could not generate a request.',
    })
  }
},
  acceptJob: (jobId, navigateToMap = true) => set((state) => {
    const offeredJob = state.jobs.find((job) => job.id === jobId)
    if (offeredJob?.ferryCrossings?.length && !ferryCrossingsHaveActiveService(offeredJob.ferryCrossings, state.transportRoutes ?? [], state.transportAssets ?? [])) return state
    const passenger = state.passengers.find((item) => offeredJob?.passengerIds.includes(item.id))
    const suitableVehicles = state.vehicles.filter((vehicle) => {
      const driver = state.drivers.find((candidate) => candidate.id === vehicle.driverId)
      return vehicle.type === 'taxi' && vehicle.cityId === offeredJob?.cityId && vehicle.status === 'available' && vehicle.driverId && driver?.status === 'available' && offeredJob && vehicleCanTakeJob(vehicle, offeredJob, passenger?.partySize ?? 1) && (offeredJob.category !== 'accessible' || (driver?.certifications ?? []).includes('accessible')) && (offeredJob.category !== 'executive' || (driver?.certifications ?? []).includes('executive'))
    })
    if (!offeredJob || !suitableVehicles.length) return state
    const result = acceptJobState(state.jobs, state.vehicles, jobId, new Set(suitableVehicles.map((vehicle) => vehicle.id)))
    if (!result) return state
    const assignedVehicleId = result.jobs.find((job) => job.id === jobId)?.assignedVehicleId
    const driverId = result.vehicles.find((vehicle) => vehicle.id === assignedVehicleId)?.driverId
    const driver = state.drivers.find((candidate) => candidate.id === driverId)
    const dispatcher = (state.dispatchers ?? []).filter((candidate) => candidate.cityId === offeredJob.cityId).sort((left, right) => right.planning - left.planning)[0]
    const cityFleetSize = state.vehicles.filter((vehicle) => vehicle.cityId === offeredJob.cityId).length
    const dispatcherMultiplier = dispatcher && cityFleetSize <= dispatcher.capacity ? Math.max(.78, 1 - (dispatcher.localKnowledge + dispatcher.planning) / 1_000) : dispatcher ? 1.08 : 1.15
    if (driver?.trait === 'unreliable' && Math.random() < .12) return { drivers: state.drivers.map((candidate) => candidate.id === driverId ? { ...candidate, status: 'off-duty' as const, missedShiftUntil: new Date(Date.now() + 60_000).toISOString() } : candidate), updatedAt: new Date().toISOString() }
    const drivers = state.drivers.map((candidate) => candidate.id === driverId ? { ...candidate, status: 'driving' as const } : candidate)
    const assignedVehicle = result.vehicles.find((vehicle) => vehicle.id === assignedVehicleId)
    const trafficIncident = trafficImpactForJob(offeredJob, state.trafficIncidents ?? [])
    const jobs = result.jobs.map((job) => job.id === jobId ? { ...job, pickupTimeMultiplier: pickupSpeedMultiplier(driver) * dispatcherMultiplier, trafficDelay: trafficIncident?.title, durationMinutes: (driver?.trait === 'careful' ? job.durationMinutes * 1.05 : job.durationMinutes) * (trafficIncident?.delayMultiplier ?? 1) / (state.worldCondition?.speedMultiplier ?? 1), fare: Math.round(job.fare * (assignedVehicle ? upgradeFareMultiplier(assignedVehicle) : 1) * (hasResearch(state.completedResearch ?? [], 'smart-dispatch') ? 1.08 : 1) * 100) / 100, estimatedFare: Math.round(job.fare * (assignedVehicle ? upgradeFareMultiplier(assignedVehicle) : 1) * (hasResearch(state.completedResearch ?? [], 'smart-dispatch') ? 1.08 : 1) * 100) / 100 } : job)
    // Viewing an offer draws a temporary preview line. Clear that focus when
    // dispatching so the preview disappears at the decision point; the live
    // accepted-job route remains responsible for journey progress.
    return { ...result, jobs: fitOffersToAvailableTaxis(jobs, availableJobOfferCapacity({ vehicles: result.vehicles, drivers })), drivers, focusedJobId: null, updatedAt: new Date().toISOString(), activeSection: navigateToMap ? 'map' : state.activeSection }
  }),
  saveJobPickupRoute: (
  jobId,
  coordinates,
  ferryCrossings,
  durationMinutes,
) => set((state) => {
  const job = state.jobs.find((candidate) => candidate.id === jobId)
  if (job?.status === 'accepted' && ferryCrossings.length && !ferryCrossingsHaveActiveService(ferryCrossings, state.transportRoutes ?? [], state.transportAssets ?? [])) {
    const vehicle = state.vehicles.find((candidate) => candidate.id === job.assignedVehicleId)
    return {
      jobs: state.jobs.map((candidate) => candidate.id === jobId ? {
        ...candidate,
        status: 'offered' as const,
        assignedVehicleId: undefined,
        acceptedAt: undefined,
        dispatchOrigin: undefined,
        pickupRouteCoordinates: undefined,
        pickupFerryCrossings: undefined,
      } : candidate),
      vehicles: state.vehicles.map((candidate) => candidate.id === job.assignedVehicleId ? { ...candidate, status: 'available' as const } : candidate),
      drivers: state.drivers.map((candidate) => candidate.id === vehicle?.driverId ? { ...candidate, status: 'available' as const } : candidate),
      jobsError: 'That taxi cannot reach this pickup with your currently operating ferry routes.',
      updatedAt: new Date().toISOString(),
    }
  }
  return {
  jobs: state.jobs.map((candidate) =>
    candidate.id === jobId && candidate.status === 'accepted'
      ? {
          ...candidate,
          pickupRouteCoordinates: coordinates,
          pickupFerryCrossings: ferryCrossings,
          completedPickupFerryCrossings: [],
          pickupFerryDelayMs: 0,
          pickupDurationMinutes: durationMinutes,
          acceptedAt: new Date().toISOString(),
        }
      : candidate
  ),
  updatedAt: new Date().toISOString(),
  }
}),
  saveJobRoute: (
  jobId,
  coordinates,
  ferryCrossings,
) => set((state) => ({
  jobs: state.jobs.map((job) =>
    job.id === jobId
      ? {
          ...job,
          routeCoordinates: coordinates,
          ferryCrossings,
          completedFerryCrossings: [],
          passengerFerryDelayMs: 0,
          routeResolved: true,
        }
      : job
  ),
  updatedAt: new Date().toISOString(),
})),
  markJobFerryCrossingComplete: (
  jobId,
  leg,
  crossingIndex,
  delayMs,
) => set((state) => ({
  jobs: state.jobs.map((job) => {
    if (
      job.id !== jobId ||
      job.status !== 'accepted'
    ) {
      return job
    }

    const completedField =
      leg === 'pickup'
        ? 'completedPickupFerryCrossings'
        : 'completedFerryCrossings'

    const delayField =
      leg === 'pickup'
        ? 'pickupFerryDelayMs'
        : 'passengerFerryDelayMs'

    const completed =
      job[completedField] ?? []

    // Never add the timing adjustment twice.
    if (completed.includes(crossingIndex)) {
      return job
    }

    return {
      ...job,

      [completedField]: [
        ...completed,
        crossingIndex,
      ],

      [delayField]:
        (job[delayField] ?? 0) +
        delayMs,
    }
  }),

  updatedAt: new Date().toISOString(),
})),
  declineJob: (jobId) => set((state) => ({ jobs: state.jobs.filter((job) => job.id !== jobId), focusedJobId: state.focusedJobId === jobId ? null : state.focusedJobId, updatedAt: new Date().toISOString() })),
  completeJob: (jobId) => set((state) => {
    if (!state.company) return state
    const job = state.jobs.find((candidate) => candidate.id === jobId)
    const vehicle = state.vehicles.find((candidate) => candidate.id === job?.assignedVehicleId)
    const result = completeJobState(state.company, state.jobs, state.vehicles, jobId)
    if (!result || !job) return state
    const updatedAt = new Date().toISOString()
    return { ...result, exploredTerritory: addTaxiDiscovery(state.exploredTerritory, job, vehicle?.position), updatedAt }
  }),
  tickJobs: () => set((state) => {
    if (!state.company) return state
    const now = Date.now()
    const activeVehicleIds = new Set(state.jobs.filter((job) => job.status === 'accepted' && job.assignedVehicleId).map((job) => job.assignedVehicleId!))
    const knownVehicleIds = new Set(state.vehicles.map((vehicle) => vehicle.id))
    // Repair interrupted/corrupt lifecycle transitions before settling time.
    // An orphaned job is offered again; a vehicle with active work is always
    // restored to the matching moving status.
    const jobs = state.jobs
      .map((job) => job.status === 'accepted' && (!job.assignedVehicleId || !knownVehicleIds.has(job.assignedVehicleId))
        ? { ...job, status: 'offered' as const, assignedVehicleId: undefined, acceptedAt: undefined, offeredAt: new Date(now).toISOString() }
        : job)
      .filter((job) => job.status !== 'offered' || jobOfferExpiresAt(job) > now)
    const reconciledVehicles = state.vehicles.map((vehicle) => {
      if (vehicle.serviceTrip) return { ...vehicle, status: 'maintenance' as const }
      if (vehicle.postalRoute || vehicle.rentalJourney || vehicle.scheduledJourney || activeVehicleIds.has(vehicle.id)) return { ...vehicle, status: 'on-job' as const }
      return vehicle.status === 'on-job' ? { ...vehicle, status: 'available' as const } : vehicle
    })
    const result = completeArrivedJobsState(state.company, jobs, reconciledVehicles, now)
    let company = result?.company ?? state.company
    let vehicles = result?.vehicles ?? reconciledVehicles
    let drivers = state.drivers
    let financialTransactions = state.financialTransactions ?? []
    let exploredTerritory = state.exploredTerritory
    let territoryExpansions = state.territoryExpansions ?? []
    let customerReviews = state.customerReviews ?? []
    vehicles = vehicles.map((vehicle) => {
      if (!vehicle.maintenanceJob || new Date(vehicle.maintenanceJob.completesAt).getTime() > now) return vehicle
      const kind = vehicle.maintenanceJob.kind
      return { ...vehicle, status: 'available' as const, maintenanceJob: undefined, condition: kind === 'inspection' ? Math.max(vehicle.condition, 70) : kind === 'repair' ? Math.max(vehicle.condition, 90) : kind === 'full-service' ? 100 : vehicle.condition, tireCondition: kind === 'tires' ? 100 : vehicle.tireCondition, tireInstalledAtKm: kind === 'tires' ? vehicle.odometerKm ?? 0 : vehicle.tireInstalledAtKm, lastServiceAtKm: kind === 'full-service' ? vehicle.odometerKm ?? 0 : vehicle.lastServiceAtKm }
    })
    if (result) {
      for (const jobId of result.completedJobIds) {
        const originalJob = state.jobs.find((candidate) => candidate.id === jobId)!
        const job = result.jobs.find((candidate) => candidate.id === jobId) ?? originalJob
        const previousVehicle = vehicles.find((candidate) => candidate.id === job.assignedVehicleId)!
        const driver = drivers.find((candidate) => candidate.id === previousVehicle.driverId)
        // Base recovery on the actual arrival time. If the app was closed long
        // enough for both journeys to finish, the service trip can settle in
        // this same tick instead of leaving the taxi unavailable after launch.
        const completedAt = getJobJourney(job, previousVehicle).arrivesAt
        exploredTerritory = addTaxiDiscovery(exploredTerritory, job, previousVehicle.position)
        const outcome = calculateJobOutcome(job, previousVehicle, driver)
        const emptyDistanceKm = previousVehicle.position ? distanceKmBetween(previousVehicle.position, jobPickup(job)) : 0
        const journeyDistanceKm = emptyDistanceKm + job.distanceKm
        // completeArrivedJobsState already applied the one-star (0.2) floor.
        const reputation = addReputation(company.reputation, outcome.reputationEarned - 0.2 + (job.story?.reputationBonus ?? 0))
        company = { ...company, cash: company.cash + outcome.tip, reputation, level: levelForReputation(reputation) }
        financialTransactions = addTransactions(
          financialTransactions,
          transaction('fares', `${previousVehicle.name} fare`, job.fare, previousVehicle.id, new Date(completedAt).toISOString()),
          ...(outcome.tip > 0 ? [transaction('tips', `${previousVehicle.name} tip`, outcome.tip, previousVehicle.id, new Date(completedAt).toISOString())] : []),
        )
        result.jobs = result.jobs.map((candidate) => candidate.id === jobId ? { ...candidate, satisfaction: outcome.satisfaction, customerRating: outcome.customerRating, tip: outcome.tip, reputationEarned: outcome.reputationEarned } : candidate)
        const batteryWear = previousVehicle.powertrain === 'electric' ? journeyDistanceKm / 30_000 : 0
        const energyUsed = energyUseForJob(job, previousVehicle, state.activeEvent, driver)
        const performance = previousVehicle.taxiPerformance ?? { trips: 0, emptyKm: 0, occupiedKm: 0, serviceMinutes: 0, ratingTotal: 0, tips: 0, energyCost: 0, cancellations: 0 }
        const cleaningWear = 2 + (state.worldCondition.weather === 'rain' || state.worldCondition.weather === 'snow' ? 4 : 0) + (job.category === 'pet-friendly' ? 6 : 0) + (job.category === 'family' ? 2 : 0)
        const tireWear = tireWearForDistance(previousVehicle, journeyDistanceKm, state.worldCondition.weather)
        const hasQueuedJob = result.jobs.some((candidate) => candidate.status === 'accepted' && candidate.assignedVehicleId === previousVehicle.id)
        const depleted = { ...previousVehicle, position: jobDestination(job), status: hasQueuedJob ? 'on-job' as const : 'available' as const, odometerKm: (previousVehicle.odometerKm ?? 0) + journeyDistanceKm, lifetimeRevenue: (previousVehicle.lifetimeRevenue ?? 0) + job.fare + outcome.tip, batteryHealth: Math.max(60, (previousVehicle.batteryHealth ?? 100) - batteryWear), condition: Math.max(0, previousVehicle.condition - outcome.wear), cleanliness: Math.max(0, (previousVehicle.cleanliness ?? 100) - cleaningWear), tireCondition: Math.max(0, (previousVehicle.tireCondition ?? 100) - tireWear), fuel: Math.max(0, previousVehicle.fuel - energyUsed), taxiPerformance: { trips: performance.trips + 1, emptyKm: performance.emptyKm + emptyDistanceKm, occupiedKm: performance.occupiedKm + job.distanceKm, serviceMinutes: performance.serviceMinutes + job.durationMinutes, ratingTotal: performance.ratingTotal + outcome.customerRating, tips: performance.tips + outcome.tip, energyCost: performance.energyCost + energyUsed * 1.5, cancellations: performance.cancellations } }
        customerReviews = [...customerReviews, createCustomerReview(job, previousVehicle, driver, state.passengers.find((passenger) => job.passengerIds.includes(passenger.id)), outcome.customerRating, outcome.satisfaction, new Date(completedAt).toISOString())].slice(-100)
        const tiredDriver = driver && { ...driver, fatigue: Math.min(100, driver.fatigue + fatigueUseForJob(job)) }
        const needsAutomaticRecovery = !previousVehicle.queuedService && !hasQueuedJob && (previousVehicle.refuelStrategy === 'automatic' || (tiredDriver?.fatigue ?? 0) >= 80)
        vehicles = vehicles.map((vehicle) => vehicle.id !== previousVehicle.id ? vehicle : needsAutomaticRecovery ? startRecoveryTrip(depleted, tiredDriver, getCity(vehicle.cityId, state.customCities)?.coordinates ?? job.destination, completedAt) : depleted)
        drivers = drivers.map((candidate) => candidate.id !== driver?.id ? candidate : { ...candidate, fatigue: Math.min(100, candidate.fatigue + fatigueUseForJob(job)), status: vehicles.find((vehicle) => vehicle.driverId === candidate.id)?.status === 'maintenance' ? 'driving' : 'available' })
        let goals = updateGoals(state.goals ?? [], 'fares', 1)
        goals = updateGoals(goals, 'earnings', job.fare + outcome.tip)
        if (depleted.fuel > 20) goals = updateGoals(goals, 'safe-jobs', 1)
        if (job.category === 'airport') goals = updateGoals(goals, 'airport-jobs', 1)
        if (job.category) state = { ...state, contracts: advanceContracts(state.contracts ?? [], job.category) }
        state = { ...state, goals }
      }
    }
    const completedLodgingTrips = vehicles.filter((vehicle) => vehicle.serviceTrip?.kind === 'lodging' && new Date(vehicle.serviceTrip.arrivesAt).getTime() <= now)
    if (completedLodgingTrips.length) {
      const lodgingCost = completedLodgingTrips.length * OVERNIGHT_STAY_COST
      company = { ...company, cash: company.cash - lodgingCost }
      financialTransactions = addTransactions(financialTransactions, ...completedLodgingTrips.map((vehicle) => transaction('hotels', `${vehicle.name}: driver overnight stay`, -OVERNIGHT_STAY_COST, vehicle.id, vehicle.serviceTrip!.arrivesAt)))
    }
    vehicles = vehicles.map((vehicle) => {
      if (vehicle.scheduledJourney && new Date(vehicle.scheduledJourney.arrivesAt).getTime() <= now) {
        const journey = vehicle.scheduledJourney
        const bonus = state.specialization === 'tourism' && journey.kind === 'tour' ? Math.round(journey.reward * .2) : 0
        const reputation = addReputation(company.reputation, 1)
        company = { ...company, cash: company.cash + journey.reward + bonus, reputation, level: levelForReputation(reputation) }
        financialTransactions = addTransactions(financialTransactions, transaction(journey.kind === 'tour' ? 'tours' : 'coach', `${vehicle.name} ${journey.kind} service`, journey.reward + bonus, vehicle.id, journey.arrivesAt))
        if (journey.kind === 'tour') state = { ...state, contracts: advanceContracts(state.contracts ?? [], 'tour') }
        const upgradeEfficiency = energyMultiplier(vehicle)
        const wearMultiplier = (vehicle.upgrades ?? []).includes('dash-camera') ? .9 : 1
        return { ...vehicle, position: journey.destination, status: 'available' as const, scheduledJourney: undefined, odometerKm: (vehicle.odometerKm ?? 0) + journey.distanceKm, lifetimeRevenue: (vehicle.lifetimeRevenue ?? 0) + journey.reward + bonus, fuel: Math.max(0, vehicle.fuel - journey.distanceKm / 8 * upgradeEfficiency), condition: Math.max(0, vehicle.condition - journey.distanceKm / 350 * wearMultiplier) }
      }
      if (vehicle.rentalJourney && new Date(vehicle.rentalJourney.arrivesAt).getTime() <= now) {
        const { reward, distanceKm, arrivesAt, waypoints } = vehicle.rentalJourney
        company = { ...company, cash: company.cash + reward }
        financialTransactions = addTransactions(financialTransactions, transaction('rentals', `${vehicle.name} rental`, reward, vehicle.id, arrivesAt))
        const upgradeEfficiency = energyMultiplier(vehicle)
        const wearMultiplier = (vehicle.upgrades ?? []).includes('dash-camera') ? .9 : 1
        return { ...vehicle, position: waypoints.at(-1) ?? vehicle.position, status: 'available' as const, rentalJourney: undefined, odometerKm: (vehicle.odometerKm ?? 0) + distanceKm, lifetimeRevenue: (vehicle.lifetimeRevenue ?? 0) + reward, batteryHealth: vehicle.powertrain === 'electric' ? Math.max(60, (vehicle.batteryHealth ?? 100) - distanceKm / 30_000) : vehicle.batteryHealth, fuel: Math.max(0, vehicle.fuel - distanceKm / 5 * upgradeEfficiency), condition: Math.max(0, vehicle.condition - distanceKm / 250 * wearMultiplier) }
      }
      if (vehicle.postalRoute && new Date(vehicle.postalRoute.arrivesAt).getTime() <= now) {
        const reputation = addReputation(company.reputation, 0.5)
        company = { ...company, cash: company.cash + vehicle.postalRoute.reward, reputation, level: levelForReputation(reputation) }
        const plannedHours = vehicle.postalRoute.plannedHours ?? 1
        state = { ...state, goals: updateGoals(state.goals ?? [], 'postal-rounds', 1) }
        state = { ...state, contracts: advanceContracts(state.contracts ?? [], 'postal') }
        const postalBonus = ((vehicle.upgrades ?? []).includes('parcel-shelving') ? vehicle.postalRoute.reward * .15 : 0) + (state.specialization === 'logistics' ? vehicle.postalRoute.reward * .2 : 0)
        company = { ...company, cash: company.cash + postalBonus }
        const revenue = vehicle.postalRoute.reward + postalBonus
        const routeDistanceKm = plannedHours * 35
        financialTransactions = addTransactions(financialTransactions, transaction('postal', `${vehicle.name} postal round`, revenue, vehicle.id, vehicle.postalRoute.arrivesAt))
        const upgradeEfficiency = energyMultiplier(vehicle)
        const wearMultiplier = (vehicle.upgrades ?? []).includes('dash-camera') ? .9 : 1
        return { ...vehicle, position: vehicle.postalRoute.stops.at(-1)?.coordinates ?? vehicle.position, status: 'available' as const, postalRoute: undefined, odometerKm: (vehicle.odometerKm ?? 0) + routeDistanceKm, lifetimeRevenue: (vehicle.lifetimeRevenue ?? 0) + revenue, batteryHealth: vehicle.powertrain === 'electric' ? Math.max(60, (vehicle.batteryHealth ?? 100) - routeDistanceKm / 30_000) : vehicle.batteryHealth, fuel: Math.max(0, vehicle.fuel - plannedHours * 4 * upgradeEfficiency), condition: Math.max(0, vehicle.condition - plannedHours * .2 * wearMultiplier) }
      }
      if (!vehicle.serviceTrip || new Date(vehicle.serviceTrip.arrivesAt).getTime() > now) return vehicle
      const fuel = vehicle.serviceTrip.kind === 'fuel' ? 100 : vehicle.fuel
      const arrived = { ...vehicle, fuel, position: vehicle.serviceTrip.destination, status: 'available' as const, serviceTrip: undefined }
      const driver = drivers.find((candidate) => candidate.id === vehicle.driverId)
      return vehicle.serviceTrip.kind === 'fuel' && (driver?.fatigue ?? 0) >= 80
        ? startRecoveryTrip(arrived, driver, getCity(vehicle.cityId, state.customCities)?.coordinates ?? arrived.position, now)
        : arrived
    })
    let transportAssets = state.transportAssets ?? []
    transportAssets = transportAssets.map((asset) => {
      if (!asset.journey || new Date(asset.journey.arrivesAt).getTime() > now) return asset
      const journey = asset.journey
      const route = (state.transportRoutes ?? []).find((candidate) => candidate.id === journey.routeId)
      if (asset.mode === 'ferry' && route) {
        const scheduledStart = new Date(journey.startedAt).getTime()
        const scheduledEnd = new Date(journey.arrivesAt).getTime()
        const legDurationMs = Math.max(1_000, journey.legDurationMs ?? scheduledEnd - scheduledStart)
        const completedLegs = Math.max(1, Math.floor((now - scheduledEnd) / legDurationMs) + 1)
        const totalReward = journey.reward * completedLegs
        const totalDistanceKm = journey.distanceKm * completedLegs
        const reputation = addReputation(company.reputation, 1.3 * completedLegs)
        const direction = completedLegs % 2 === 0
          ? (journey.direction ?? 'outbound')
          : (journey.direction ?? 'outbound') === 'outbound' ? 'returning' : 'outbound'
        const origin = getCity(route.fromCityId, state.customCities)
        const destination = getCity(route.toCityId ?? null, state.customCities)
        const nextDestinationCityId = direction === 'outbound' ? destination?.id : origin?.id
        const nextDestinationName = direction === 'outbound'
          ? route.destinationName ?? destination?.name
          : route.originName ?? origin?.name
        const nextDestinationCoordinates = direction === 'outbound'
          ? route.destinationCoordinates ?? destination?.coordinates
          : route.originCoordinates ?? origin?.coordinates
        const nextStartedAt = scheduledEnd + (completedLegs - 1) * legDurationMs
        const reachedRouteDestination = journey.direction === 'outbound' || completedLegs >= 2
        const ferryDiscoveryId = `ferry-discovery:${route.id}`
        if (
          reachedRouteDestination &&
          route.destinationCoordinates &&
          !territoryExpansions.some((expansion) => expansion.id === ferryDiscoveryId)
        ) {
          const firstDestinationArrival = journey.direction === 'outbound'
            ? scheduledEnd
            : scheduledEnd + legDurationMs
          territoryExpansions = [...territoryExpansions, {
            id: ferryDiscoveryId,
            coordinates: route.destinationCoordinates,
            routeCoordinates: route.routeCoordinates,
            purchasedAt: new Date(firstDestinationArrival).toISOString(),
            source: 'ferry-discovery' as const,
          }]
        }
        company = { ...company, cash: company.cash + totalReward, reputation, level: levelForReputation(reputation) }
        financialTransactions = addTransactions(financialTransactions, transaction('ferry', `${asset.name} continuous shuttle · ${completedLegs} ${completedLegs === 1 ? 'crossing' : 'crossings'}`, totalReward, undefined, new Date(nextStartedAt).toISOString()))
        return {
          ...asset,
          status: 'on-route' as const,
          lifetimeRevenue: asset.lifetimeRevenue + totalReward,
          condition: Math.max(0, asset.condition - totalDistanceKm / 2_500),
          journey: {
            ...journey,
            startedAt: new Date(nextStartedAt).toISOString(),
            arrivesAt: new Date(nextStartedAt + legDurationMs).toISOString(),
            destinationCityId: nextDestinationCityId,
            destinationName: nextDestinationName,
            destinationCoordinates: nextDestinationCoordinates,
            direction,
            repeats: true,
            legDurationMs,
          },
        }
      }
      const reputation = addReputation(company.reputation, 1.3)
      company = { ...company, cash: company.cash + journey.reward, reputation, level: levelForReputation(reputation) }
      financialTransactions = addTransactions(financialTransactions, transaction(asset.mode === 'airliner' ? 'airline' : asset.mode === 'train' ? 'rail' : 'ferry', `${asset.name} scheduled service`, journey.reward, undefined, journey.arrivesAt))
      return { ...asset, cityId: journey.destinationCityId ?? asset.cityId, status: 'available' as const, lifetimeRevenue: asset.lifetimeRevenue + journey.reward, condition: Math.max(0, asset.condition - journey.distanceKm / 2_500), journey: undefined }
    })
    drivers = drivers.map((driver) => {
      if (driver.missedShiftUntil && new Date(driver.missedShiftUntil).getTime() <= now) return { ...driver, missedShiftUntil: undefined, status: 'available' as const }
      const vehicle = vehicles.find((candidate) => candidate.driverId === driver.id)
      if (vehicle?.serviceTrip) return driver
      const completedRestTrip = state.vehicles.find((candidate) => candidate.driverId === driver.id)?.serviceTrip
      const rested = completedRestTrip?.kind === 'home' || completedRestTrip?.kind === 'lodging'
      return { ...driver, fatigue: rested ? 0 : driver.fatigue, status: 'available' as const }
    })
    let loans = state.loans ?? []
    for (const loan of loans.filter((item) => new Date(item.nextPaymentAt).getTime() <= now)) {
      const payment = Math.min(loan.paymentAmount, loan.balance)
      company = { ...company, cash: company.cash - payment }
      financialTransactions = addTransactions(financialTransactions, transaction('loans', 'Loan repayment', -payment))
    }
    loans = loans.map((loan) => new Date(loan.nextPaymentAt).getTime() > now ? loan : { ...loan, balance: Math.max(0, loan.balance - loan.paymentAmount), nextPaymentAt: nextMonthlyPaymentAt(company.foundedAt, now) }).filter((loan) => loan.balance > 0)
    const operatingPaymentDue = new Date(state.nextOperatingPaymentAt ?? 0).getTime() <= now
    if (operatingPaymentDue) {
      const leaseCost = vehicles.reduce((sum, vehicle) => sum + ((vehicle.leasePaymentsRemaining ?? 36) > 0 ? (vehicle.leaseMonthlyCost ?? vehicle.leaseWeeklyCost ?? 0) : 0), 0)
      const financeCost = vehicles.reduce((sum, vehicle) => sum + Math.min(vehicle.financeMonthlyCost ?? 0, vehicle.financeBalance ?? 0), 0)
      const payrollCost = drivers.reduce((sum, driver) => {
        const vehicle = vehicles.find((candidate) => candidate.driverId === driver.id)
        const branch = state.branches.find((candidate) => candidate.cityId === vehicle?.cityId)
        return sum + Math.round(driver.salary * (1 - depotFacilityLevel(branch, 'lounge') * .05))
      }, 0)
      const operationsPayroll = [...(state.mechanics ?? []), ...(state.dispatchers ?? []), ...(state.automationEmployees ?? [])].reduce((sum, employee) => sum + employee.salary, 0)
      company = { ...company, cash: company.cash - leaseCost - financeCost - payrollCost - operationsPayroll }
      if (leaseCost) financialTransactions = addTransactions(financialTransactions, transaction('leases', 'Fleet lease payments', -leaseCost))
      if (financeCost) financialTransactions = addTransactions(financialTransactions, transaction('vehicles', 'Hire purchase payments', -financeCost))
      if (payrollCost) financialTransactions = addTransactions(financialTransactions, transaction('payroll', 'Driver payroll', -payrollCost))
      if (operationsPayroll) financialTransactions = addTransactions(financialTransactions, transaction('payroll', 'Mechanic and dispatcher payroll', -operationsPayroll))
      const expiredLeaseDriverIds = new Set(vehicles.filter((vehicle) => vehicle.ownership === 'leased' && (vehicle.leasePaymentsRemaining ?? 36) <= 1 && vehicle.status === 'available').map((vehicle) => vehicle.driverId).filter(Boolean))
      drivers = drivers.filter((driver) => !expiredLeaseDriverIds.has(driver.id))
      vehicles = vehicles
        .map((vehicle) => {
          if (vehicle.ownership === 'leased') {
            const hasPayment = (vehicle.leasePaymentsRemaining ?? 36) > 0
            return { ...vehicle, leasePaymentsRemaining: Math.max(0, (vehicle.leasePaymentsRemaining ?? 36) - 1), lifetimeExpenses: (vehicle.lifetimeExpenses ?? 0) + (hasPayment ? (vehicle.leaseMonthlyCost ?? vehicle.leaseWeeklyCost ?? 0) : 0) }
          }
          if (vehicle.ownership !== 'financed') return vehicle
          const payment = Math.min(vehicle.financeMonthlyCost ?? 0, vehicle.financeBalance ?? 0)
          const financeBalance = Math.max(0, (vehicle.financeBalance ?? 0) - payment)
          return financeBalance === 0
            ? { ...vehicle, ownership: 'owned' as const, financeBalance: undefined, financeMonthlyCost: undefined, financePaymentsRemaining: undefined, lifetimeExpenses: (vehicle.lifetimeExpenses ?? 0) + payment }
            : { ...vehicle, financeBalance, financePaymentsRemaining: Math.max(0, (vehicle.financePaymentsRemaining ?? 1) - 1), lifetimeExpenses: (vehicle.lifetimeExpenses ?? 0) + payment }
        })
        .filter((vehicle) => !(vehicle.ownership === 'leased' && vehicle.leasePaymentsRemaining === 0 && vehicle.status === 'available'))
    }
    const nextOperatingPaymentAt = operatingPaymentDue ? nextMonthlyPaymentAt(company.foundedAt, now) : state.nextOperatingPaymentAt
    const activeEvent = state.activeEvent && new Date(state.activeEvent.expiresAt).getTime() > now ? state.activeEvent : (new Date(state.nextEventAt ?? 0).getTime() <= now ? createDynamicEvent(now) : null)
    const nextEventAt = activeEvent && activeEvent.id !== state.activeEvent?.id ? new Date(now + 13 * 60_000).toISOString() : state.nextEventAt
    const goals = (state.goals?.length && state.goals.some((goal) => new Date(goal.expiresAt).getTime() > now)) ? state.goals : createGoals(now)
    const driverCandidates = (state.driverCandidates?.length && state.driverCandidates.some((candidate) => new Date(candidate.expiresAt).getTime() > now)) ? state.driverCandidates : createDriverCandidates(getCity(state.activeCityId ?? state.startingCityId, state.customCities)?.coordinates ?? [0, 0], now)
    const contractRewards = (state.contracts ?? []).filter((contract) => contract.completed && contract.reward > 0)
    const contractReward = contractRewards.reduce((sum, contract) => sum + contract.reward, 0)
    if (contractReward) {
      const reputation = addReputation(company.reputation, contractRewards.length * 1.3)
      company = { ...company, cash: company.cash + contractReward, reputation, level: levelForReputation(reputation) }
      financialTransactions = addTransactions(financialTransactions, ...contractRewards.map((contract) => transaction('contracts', `Contract: ${contract.name}`, contract.reward)))
    }
    const contracts = (state.contracts ?? []).map((contract) => contract.completed ? { ...contract, reward: 0 } : contract)
    const worldExpired = new Date(state.worldCondition?.expiresAt ?? 0).getTime() <= now
    const worldCondition = worldExpired ? createWorldCondition(now) : state.worldCondition
    const growth = worldExpired ? competitorGrowth(state.difficulty ?? 'standard') : 0
    const competitors = (state.competitors ?? []).map((competitor) => competitor.relationship === 'partner' ? competitor : { ...competitor, fleetSize: competitor.fleetSize + growth, stationCount: competitor.stationCount + (growth > 2 && competitor.fleetSize % 3 === 0 ? 1 : 0), cash: competitor.cash + growth * 1_500, marketShare: Math.min(45, competitor.marketShare + growth * .2) })
    let trafficIncidents = (state.trafficIncidents ?? []).map((incident) => new Date(incident.expiresAt).getTime() <= now ? { ...incident, resolved: true } : incident).slice(-30)
    let nextTrafficIncidentAt = state.nextTrafficIncidentAt ?? new Date(0).toISOString()
    if (new Date(nextTrafficIncidentAt).getTime() <= now) {
      const incidentCity = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
      if (incidentCity) trafficIncidents = [...trafficIncidents, createTrafficIncident(incidentCity, now)]
      nextTrafficIncidentAt = new Date(now + (3 + Math.random() * 4) * 60_000).toISOString()
    }
    let incidents = state.incidents ?? []
    if (worldExpired) {
      const atRisk = vehicles.find((vehicle) => vehicle.status === 'available' && vehicle.condition < 70 && !incidents.some((incident) => !incident.resolved && incident.vehicleId === vehicle.id))
      const risk = atRisk ? (70 - atRisk.condition) / 80 * (worldCondition.weather === 'snow' || worldCondition.weather === 'storm' ? 1.8 : 1) : 0
      if (atRisk && Math.random() < risk) {
        const collision = Math.random() < .25
        incidents = [...incidents, { id: crypto.randomUUID(), vehicleId: atRisk.id, kind: collision ? 'collision' as const : 'breakdown' as const, severity: collision ? 12 : 6, description: `${atRisk.name} ${collision ? 'was involved in a minor collision' : 'broke down during operations'}`, repairCost: Math.round((collision ? 2200 : 900) * (1 + (100 - atRisk.condition) / 100)), occurredAt: new Date(now).toISOString(), resolved: false }]
        vehicles = vehicles.map((vehicle) => vehicle.id === atRisk.id ? { ...vehicle, status: 'maintenance' as const } : vehicle)
      }
    }
    let passengers = state.passengers
    if (result?.completedJobIds.length) {
      const completedJobs = state.jobs.filter((job) => result.completedJobIds.includes(job.id))
      passengers = passengers.map((passenger) => {
        const job = completedJobs.find((candidate) => candidate.passengerIds.includes(passenger.id))
        if (!job) return passenger
        const vehicle = state.vehicles.find((candidate) => candidate.id === job.assignedVehicleId)
        const loyaltyGain = 8 + (vehicle ? Math.floor(vehicleComfortScore(vehicle) / 20) : 0)
        return { ...passenger, trips: (passenger.trips ?? 0) + 1, loyalty: Math.min(100, (passenger.loyalty ?? 0) + loyaltyGain), segment: passenger.segment ?? (passenger.partySize > 2 ? 'family' as const : Math.random() < .34 ? 'commuter' as const : Math.random() < .5 ? 'business' as const : 'tourist' as const) }
      })
    }
    if (result?.completedJobIds.length) drivers = drivers.map((driver) => {
      const completed = result.completedJobIds.filter((jobId) => state.vehicles.find((vehicle) => vehicle.driverId === driver.id)?.id === state.jobs.find((job) => job.id === jobId)?.assignedVehicleId).length
      return completed ? { ...driver, experience: (driver.experience ?? 0) + completed * 10, completedTrips: (driver.completedTrips ?? 0) + completed, careerEarnings: (driver.careerEarnings ?? 0) + completed * 25, morale: Math.min(100, (driver.morale ?? 80) + 1) } : driver
    })
    // A workshop choice made while a vehicle was busy takes priority as soon as
    // its current work ends. Charging is deferred until then so a queued choice
    // cannot strand the company if its balance changes in the meantime.
    vehicles = vehicles.map((vehicle) => {
      if (vehicle.status !== 'available' || !vehicle.queuedService) return vehicle
      const queued = vehicle.queuedService
      if (queued.kind === 'cleaning') {
        const plan = cleaningDetails[queued.service]
        if (company.cash < plan.cost) return vehicle
        company = { ...company, cash: company.cash - plan.cost }
        financialTransactions = addTransactions(financialTransactions, transaction('maintenance', `${vehicle.name}: ${plan.label}`, -plan.cost, vehicle.id))
        return { ...vehicle, queuedService: undefined, cleanliness: Math.min(100, (vehicle.cleanliness ?? 100) + plan.restored), recentlyDetailedUntil: queued.service === 'detail' ? new Date(now + 24 * 60 * 60_000).toISOString() : vehicle.recentlyDetailedUntil, lifetimeExpenses: (vehicle.lifetimeExpenses ?? 0) + plan.cost }
      }
      const mechanic = (state.mechanics ?? []).filter((candidate) => candidate.cityId === vehicle.cityId).sort((left, right) => right.skill - left.skill)[0]
      const quote = maintenanceQuote(vehicle, queued.kind, mechanic)
      if (company.cash < quote.cost) return vehicle
      const startedAt = new Date(now).toISOString()
      company = { ...company, cash: company.cash - quote.cost }
      financialTransactions = addTransactions(financialTransactions, transaction('maintenance', `${vehicle.name}: ${queued.kind}`, -quote.cost, vehicle.id, startedAt))
      return { ...vehicle, queuedService: undefined, status: 'maintenance' as const, maintenanceJob: { kind: queued.kind, mechanicId: mechanic?.id, startedAt, completesAt: new Date(now + quote.durationMs).toISOString(), cost: quote.cost }, lifetimeExpenses: (vehicle.lifetimeExpenses ?? 0) + quote.cost }
    })
    const maintenanceAlerts = maintenanceAdvisories(vehicles, state.maintenanceAlerts ?? [], now)
    return { company, jobs: result?.jobs ?? jobs, vehicles, transportAssets, territoryExpansions, drivers, goals, contracts, driverCandidates, loans, financialTransactions, exploredTerritory, activeEvent, nextEventAt, nextOperatingPaymentAt, worldCondition, competitors, incidents, trafficIncidents, nextTrafficIncidentAt, passengers, customerReviews, maintenanceAlerts, focusedJobId: result ? null : (jobs.some((job) => job.id === state.focusedJobId) ? state.focusedJobId : null), updatedAt: new Date().toISOString() }
  }),
  cleanTaxi: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId && candidate.type === 'taxi')
    const cost = 75
    if (!state.company || !vehicle || vehicle.status !== 'available' || (vehicle.cleanliness ?? 100) >= 100 || state.company.cash < cost) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, vehicles: state.vehicles.map((candidate) => candidate.id === vehicleId ? { ...candidate, cleanliness: 100, lifetimeExpenses: (candidate.lifetimeExpenses ?? 0) + cost } : candidate), financialTransactions: addTransactions(state.financialTransactions, transaction('maintenance', `${vehicle.name} interior clean`, -cost, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  buyTaxi: (modelId) => set((state) => {
    const model = getTaxiModel(modelId)
    if (!state.company || !state.startingCityId || state.company.cash < model.price || !hasFleetSlot(state)) return state
    const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    if (!city) return state
    const modelNumber = state.vehicles.filter((vehicle) => vehicle.modelId === model.id).length + 1
    const taxi: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} ${modelNumber}`, type: 'taxi', modelId: model.id, powertrain: model.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: model.price, ...newVehicleLifecycle(model.price), condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'owned' }
    return { company: { ...state.company, cash: state.company.cash - taxi.value }, vehicles: [...state.vehicles, taxi], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Purchased ${taxi.name}`, -taxi.value, taxi.id)), updatedAt: new Date().toISOString() }
  }),
  leaseTaxi: (modelId) => set((state) => {
    const model = getTaxiModel(modelId); const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    if (!state.company || !city || state.company.level < LEASING_UNLOCK_LEVEL || state.company.cash < Math.round(model.price * 0.1) || !hasFleetSlot(state)) return state
    const taxi: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} Lease`, type: 'taxi', modelId, powertrain: model.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: model.price, ...newVehicleLifecycle(model.price), condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'leased', leaseMonthlyCost: Math.round(model.price * 0.025), leasePaymentsRemaining: 36 }
    const deposit = Math.round(model.price * 0.1)
    return { company: { ...state.company, cash: state.company.cash - deposit }, vehicles: [...state.vehicles, taxi], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Lease deposit: ${taxi.name}`, -deposit, taxi.id)), updatedAt: new Date().toISOString() }
  }),
  financeTaxi: (modelId) => set((state) => {
    const model = getTaxiModel(modelId); const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    const deposit = Math.round(model.price * 0.1)
    if (!state.company || !city || state.company.level < LEASING_UNLOCK_LEVEL || state.company.cash < deposit || !hasFleetSlot(state)) return state
    const financeBalance = Math.round(model.price * 0.9 * 1.08)
    const taxi: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} HP`, type: 'taxi', modelId, powertrain: model.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: model.price, ...newVehicleLifecycle(model.price), condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'financed', financeBalance, financeMonthlyCost: Math.ceil(financeBalance / 48), financePaymentsRemaining: 48 }
    return { company: { ...state.company, cash: state.company.cash - deposit }, vehicles: [...state.vehicles, taxi], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Hire purchase deposit: ${taxi.name}`, -deposit, taxi.id)), updatedAt: new Date().toISOString() }
  }),
  upgradeGarage: () => set((state) => {
    if (!state.company) return state
    const cost = garageUpgradeCost(state.garageLevel ?? 0)
    if (state.company.cash < cost) return state
    const garageLevel = (state.garageLevel ?? 0) + 1
    return { company: { ...state.company, cash: state.company.cash - cost }, garageLevel, financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `Depot garage level ${garageLevel}`, -cost)), updatedAt: new Date().toISOString() }
  }),
  buyPostVehicle: (modelId) => set((state) => {
    const model = getPostVehicleModel(modelId); const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    if (!state.company || !city || state.company.cash < model.price || !hasFleetSlot(state)) return state
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name}`, type: 'post', modelId: model.id, powertrain: model.powertrain, upgrades: [], refuelStrategy: 'automatic', value: model.price, ...newVehicleLifecycle(model.price), condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'owned' }
    return { company: { ...state.company, cash: state.company.cash - model.price }, vehicles: [...state.vehicles, vehicle], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Purchased ${vehicle.name}`, -model.price, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  startPostalRoute: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId && candidate.type === 'post' && candidate.status === 'available' && candidate.driverId)
    const city = getCity(vehicle?.cityId ?? null, state.customCities)
    if (!vehicle || !city) return state
    const postalRoute = createPostalRoute(vehicle, city.coordinates)
    return { vehicles: state.vehicles.map((candidate) => candidate.id === vehicleId ? { ...candidate, status: 'on-job' as const, postalRoute } : candidate), drivers: state.drivers.map((driver) => driver.id === vehicle.driverId ? { ...driver, status: 'driving' as const } : driver), updatedAt: new Date().toISOString(), activeSection: 'map' }
  }),
  buyRentalCar: (modelId) => set((state) => {
    const model = getTaxiModel(modelId); const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    if (!state.company || !city || state.company.cash < model.price || !hasFleetSlot(state)) return state
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} Rental`, type: 'rental', modelId: model.id, powertrain: model.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: model.price, ...newVehicleLifecycle(model.price), condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'owned' }
    return { company: { ...state.company, cash: state.company.cash - model.price }, vehicles: [...state.vehicles, vehicle], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Purchased rental car: ${vehicle.name}`, -model.price, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  startRental: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId && candidate.type === 'rental' && candidate.status === 'available' && candidate.fuel >= 20 && candidate.condition >= 30)
    const city = getCity(vehicle?.cityId ?? null, state.customCities)
    if (!vehicle || !city) return state
    const rentalJourney = createRentalJourney(vehicle, city.coordinates)
    return { vehicles: state.vehicles.map((candidate) => candidate.id === vehicleId ? { ...candidate, status: 'on-job' as const, rentalJourney } : candidate), updatedAt: new Date().toISOString(), activeSection: 'map' }
  }),
  buyCountryLicense: (countryCode) => set((state) => {
    const country = countries.find((item) => item.code === countryCode)
    if (!country || !state.company || state.company.level < 3 || state.company.cash < country.licenseCost || (state.countryLicenses ?? []).includes(countryCode)) return state
    const newMarkets = cities.filter((city) => city.countryCode === countryCode && !state.cityEconomies.some((economy) => economy.cityId === city.id)).map(createCityEconomy)
    return { company: { ...state.company, cash: state.company.cash - country.licenseCost }, countryLicenses: [...(state.countryLicenses ?? []), countryCode], cityEconomies: [...state.cityEconomies, ...newMarkets], financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `${country.name} operating license`, -country.licenseCost)), updatedAt: new Date().toISOString() }
  }),
  openAgency: () => set((state) => {
    const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities); const cost = 5_000
    if (!city || !state.company || state.company.level < 3 || state.company.cash < cost || state.agencies.some((agency) => agency.cityId === city.id)) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, agencies: [...state.agencies, { id: crypto.randomUUID(), name: `${city.name} Experiences`, cityId: city.id, level: 1 }], financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `Opened ${city.name} travel agency`, -cost)), updatedAt: new Date().toISOString() }
  }),
  createTour: () => set((state) => {
    const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities); const agency = state.agencies.find((item) => item.cityId === city?.id)
    if (!city || !agency) return state
    const [lng, lat] = city.coordinates
    return { tours: [...state.tours, { id: crypto.randomUUID(), agencyId: agency.id, name: `${city.name} Highlights`, stops: [[lng + .025, lat + .015], [lng - .018, lat + .022], city.coordinates], price: 49 }], updatedAt: new Date().toISOString() }
  }),
  dispatchTour: (tourId, vehicleId) => set((state) => {
    const tour = state.tours.find((item) => item.id === tourId); const agency = state.agencies.find((item) => item.id === tour?.agencyId); const vehicle = state.vehicles.find((item) => item.id === vehicleId && item.cityId === agency?.cityId && item.status === 'available' && item.driverId && (item.type === 'taxi' || item.type === 'coach'))
    if (!tour || !vehicle) return state
    const startedAt = new Date(); const guestCount = vehicle.serviceClass === 'tour-bus' ? Math.round(vehicle.capacity * .75) : Math.min(vehicle.capacity, 12); const reward = Math.round(tour.price * guestCount * .72 * (1 + vehicleComfortScore(vehicle) / 250))
    return { tours: state.tours.map((item) => item.id === tourId ? { ...item, vehicleId } : item), vehicles: state.vehicles.map((item) => item.id === vehicleId ? { ...item, status: 'on-job' as const, scheduledJourney: { kind: 'tour' as const, routeId: tourId, startedAt: startedAt.toISOString(), arrivesAt: new Date(startedAt.getTime() + 90_000).toISOString(), reward, distanceKm: 28, destination: tour.stops.at(-1)! } } : item), updatedAt: startedAt.toISOString(), activeSection: 'map' }
  }),
  buyTourBus: () => set((state) => {
    const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities); const price = 32_000
    if (!city || !state.company || state.company.cash < price || !hasFleetSlot(state)) return state
    const number = state.vehicles.filter((item) => item.serviceClass === 'tour-bus').length + 1
    const bus: Vehicle = { id: crypto.randomUUID(), name: `City Sightseer ${number}`, type: 'coach', serviceClass: 'tour-bus', modelId: 'city-sightseer', powertrain: 'hybrid', upgrades: [], refuelStrategy: 'automatic', value: price, ...newVehicleLifecycle(price), condition: 100, fuel: 100, capacity: 32, topSpeedKmh: 80, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'owned' }
    return { company: { ...state.company, cash: state.company.cash - price }, vehicles: [...state.vehicles, bus], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Purchased tour bus: ${bus.name}`, -price, bus.id)), updatedAt: new Date().toISOString() }
  }),
  buyCoach: () => set((state) => {
    const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities); const price = 45_000
    if (!city || !state.company || state.company.cash < price || !hasFleetSlot(state)) return state
    const coach: Vehicle = { id: crypto.randomUUID(), name: `Empire Intercity ${state.vehicles.filter((item) => item.serviceClass === 'intercity').length + 1}`, type: 'coach', serviceClass: 'intercity', powertrain: 'diesel', upgrades: [], refuelStrategy: 'automatic', value: price, ...newVehicleLifecycle(price), condition: 100, fuel: 100, capacity: 48, topSpeedKmh: 100, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'owned' }
    return { company: { ...state.company, cash: state.company.cash - price }, vehicles: [...state.vehicles, coach], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Purchased ${coach.name}`, -price, coach.id)), updatedAt: new Date().toISOString() }
  }),
  createCoachRoute: (toCityId) => set((state) => {
    const from = getCity(state.activeCityId ?? state.startingCityId, state.customCities); const to = getCity(toCityId, state.customCities)
    if (!from || !to || from.id === to.id || state.coachRoutes.some((route) => route.fromCityId === from.id && route.toCityId === to.id)) return state
    return { coachRoutes: [...state.coachRoutes, { id: crypto.randomUUID(), fromCityId: from.id, toCityId: to.id, name: `${from.name} → ${to.name}`, ticketPrice: 24 }], updatedAt: new Date().toISOString() }
  }),
  dispatchCoach: (routeId, vehicleId) => set((state) => {
    const route = state.coachRoutes.find((item) => item.id === routeId); const vehicle = state.vehicles.find((item) => item.id === vehicleId && item.type === 'coach' && item.serviceClass !== 'tour-bus' && item.status === 'available' && item.driverId); const destination = getCity(route?.toCityId ?? null, state.customCities)
    if (!route || !vehicle || !destination) return state
    const startedAt = new Date(); const reward = Math.round(route.ticketPrice * vehicle.capacity * .68)
    return { coachRoutes: state.coachRoutes.map((item) => item.id === routeId ? { ...item, vehicleId } : item), vehicles: state.vehicles.map((item) => item.id === vehicleId ? { ...item, status: 'on-job' as const, scheduledJourney: { kind: 'coach' as const, routeId, startedAt: startedAt.toISOString(), arrivesAt: new Date(startedAt.getTime() + 120_000).toISOString(), reward, distanceKm: 160, destination: destination.coordinates } } : item), updatedAt: startedAt.toISOString(), activeSection: 'map' }
  }),
  buyTransportAsset: (mode) => set((state) => {
    const model = transportModels[mode]
    const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    if (!model || !city || !state.company || (mode !== 'ferry' && state.company.level < model.unlockLevel) || state.company.cash < model.price) return state
    const count = (state.transportAssets ?? []).filter((asset) => asset.mode === mode).length + 1
    const asset = { id: crypto.randomUUID(), mode, name: `${model.model} ${count}`, model: model.model, capacity: model.capacity, speedKmh: model.speedKmh, value: model.price, condition: 100, status: 'available' as const, cityId: city.id, lifetimeRevenue: 0 }
    return { company: { ...state.company, cash: state.company.cash - model.price }, transportAssets: [...(state.transportAssets ?? []), asset], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Purchased ${model.label}: ${asset.name}`, -model.price)), updatedAt: new Date().toISOString() }
  }),
  createTransportRoute: (mode, toCityId) => set((state) => {
    const from = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    const to = getCity(toCityId, state.customCities)
    const licensed = state.countryLicenses ?? []
    if (!from || !to || from.id === to.id || !licensed.includes(to.countryCode) || (state.transportRoutes ?? []).some((route) => route.mode === mode && route.fromCityId === from.id && route.toCityId === to.id)) return state
    const distanceKm = distanceKmBetween(from.coordinates, to.coordinates)
    const baseFare = mode === 'train' ? 0.13 : mode === 'ferry' ? 0.1 : 0.2
    return { transportRoutes: [...(state.transportRoutes ?? []), { id: crypto.randomUUID(), mode, fromCityId: from.id, toCityId: to.id, name: `${from.name} → ${to.name}`, ticketPrice: Math.max(18, Math.round(distanceKm * baseFare)) }], updatedAt: new Date().toISOString() }
  }),
  placeHarbour: (coordinates, routes) => set((state) => {
    const cost = 5_000
    const id = harbourId(coordinates)
    if (!state.company || state.company.cash < cost || (state.purchasedHarbours ?? []).some((harbour) => harbour.id === id)) return state
    const territoryCenters = unlockedTerritoryCenters(state)
    const insideUnlockedTerritory = isInsideVillageTerritories(coordinates, territoryCenters)
    if (!insideUnlockedTerritory) return state
    const purchasedAt = new Date().toISOString()
    const name = routes[0]?.originName ?? `Harbour ${(state.purchasedHarbours ?? []).length + 1}`
    return {
      company: { ...state.company, cash: state.company.cash - cost },
      purchasedHarbours: [...(state.purchasedHarbours ?? []), { id, name, coordinates, purchasedAt }],
      discoveredFerryRoutes: [...(state.discoveredFerryRoutes ?? []), ...routes.map((route) => ({ ...route, id: `${id}:${route.id}`, harbourId: id, cityId: id, discoveredAt: purchasedAt }))],
      financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `Built ${name}`, -cost, undefined, purchasedAt)),
      updatedAt: purchasedAt,
    }
  }),
  createFerryRoute: (ferryRoute) => set((state) => {
    const from = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    if (!from || !(state.purchasedHarbours ?? []).some((harbour) => harbour.id === ferryRoute.harbourId || harbour.id === harbourId(ferryRoute.originCoordinates)) || (state.transportRoutes ?? []).some((route) => route.mode === 'ferry' && route.sourceRouteId === ferryRoute.id)) return state
    return {
      transportRoutes: [...(state.transportRoutes ?? []), {
        id: crypto.randomUUID(),
        mode: 'ferry' as const,
        fromCityId: from.id,
        name: `${ferryRoute.originName} → ${ferryRoute.destinationName}`,
        ticketPrice: Math.max(8, Math.round(ferryRoute.distanceKm * .1)),
        sourceRouteId: ferryRoute.id,
        originName: ferryRoute.originName,
        destinationName: ferryRoute.destinationName,
        originCoordinates: ferryRoute.originCoordinates,
        destinationCoordinates: ferryRoute.destinationCoordinates,
        routeCoordinates: ferryRoute.routeCoordinates,
        distanceKm: ferryRoute.distanceKm,
      }],
      updatedAt: new Date().toISOString(),
    }
  }),
  dispatchTransport: (routeId, assetId) => set((state) => {
    const route = (state.transportRoutes ?? []).find((item) => item.id === routeId)
    const routeAlreadyOperating = route?.mode === 'ferry' && (state.transportAssets ?? []).some((candidate) =>
      candidate.mode === 'ferry' && candidate.status === 'on-route' && candidate.journey?.routeId === route.id)
    const asset = (state.transportAssets ?? []).find((item) => item.id === assetId && item.mode === route?.mode && item.status === 'available' && item.cityId === route?.fromCityId)
    const from = getCity(route?.fromCityId ?? null, state.customCities)
    const destination = getCity(route?.toCityId ?? null, state.customCities)
    const destinationCoordinates = route?.destinationCoordinates ?? destination?.coordinates
    const destinationName = route?.destinationName ?? destination?.name
    if (!route || routeAlreadyOperating || !asset || !from || !destinationCoordinates || !destinationName) return state
    if ((route.mode === 'ferry' && state.worldCondition?.disruption === 'ferry-cancelled') || (route.mode === 'airliner' && state.worldCondition?.disruption === 'airport-delay') || (route.mode === 'train' && state.worldCondition?.disruption === 'rail-strike')) return state
    const distanceKm = route.distanceKm ?? distanceKmBetween(route.originCoordinates ?? from.coordinates, destinationCoordinates)
    const occupancy = route.mode === 'airliner' ? .72 : route.mode === 'ferry' ? .58 : .66
    const reward = Math.round(route.ticketPrice * asset.capacity * occupancy)
    const durationMs = Math.max(45_000, Math.min(240_000, distanceKm / (asset.speedKmh * (state.worldCondition?.speedMultiplier ?? 1)) * 35_000))
    const startedAt = new Date()
    return { transportRoutes: (state.transportRoutes ?? []).map((item) => item.id === routeId ? { ...item, assetId } : item), transportAssets: (state.transportAssets ?? []).map((item) => item.id === assetId ? { ...item, status: 'on-route' as const, journey: { routeId, startedAt: startedAt.toISOString(), arrivesAt: new Date(startedAt.getTime() + durationMs).toISOString(), reward, distanceKm, destinationCityId: destination?.id, destinationName, destinationCoordinates, direction: 'outbound' as const, repeats: route.mode === 'ferry', legDurationMs: durationMs } } : item), updatedAt: startedAt.toISOString(), activeSection: 'map' }
  }),
  setAutomation: (patch) => set((state) => ({ automation: { ...state.automation, ...patch }, updatedAt: new Date().toISOString() })),
  hireAutomationEmployee: (role) => set((state) => {
    const cityId = state.activeCityId ?? state.startingCityId
    if (!state.company || !cityId || (state.automationEmployees ?? []).some((employee) => employee.role === role && employee.cityId === cityId)) return state
    const employee = createAutomationEmployee(role, cityId, state.automationEmployees?.length ?? 0)
    return { automationEmployees: [...(state.automationEmployees ?? []), employee], automation: { ...state.automation, enabled: true }, updatedAt: new Date().toISOString() }
  }),
  fireAutomationEmployee: (employeeId) => set((state) => ({ automationEmployees: (state.automationEmployees ?? []).filter((employee) => employee.id !== employeeId), updatedAt: new Date().toISOString() })),
  updateAutomationEmployee: (employeeId, patch) => set((state) => ({ automationEmployees: (state.automationEmployees ?? []).map((employee) => employee.id === employeeId ? { ...employee, ...patch } : employee), updatedAt: new Date().toISOString() })),
  runAutomation: () => {
    const state = get()
    if (!state.automation.enabled || !state.company) return
    const policy = state.automation
    const employeeFor = (role: AutomationRole) => (get().automationEmployees ?? []).find((employee) => employee.role === role && employee.enabled)
    const record = (employeeId: string, action: GameSave['automation']['activity'][number]['action'], message: string) => set((latest) => ({ automation: { ...latest.automation, activity: [{ id: crypto.randomUUID(), employeeId, occurredAt: new Date().toISOString(), action, message }, ...(latest.automation.activity ?? [])].slice(0, 30) }, automationEmployees: latest.automationEmployees.map((employee) => employee.id === employeeId ? { ...employee, experience: employee.experience + 5 } : employee) }))

    const operationsManager = employeeFor('operations-manager')
    if (operationsManager) {
      const current = get()
      const eligibleTaxis = current.vehicles.filter((vehicle) => vehicle.type === 'taxi' && vehicle.cityId === operationsManager.cityId && vehicle.status === 'available' && vehicle.driverId && vehicle.position && vehicle.fuel >= policy.minFuel && vehicle.condition >= policy.minCondition)
      const offer = current.jobs.filter((job) => job.status === 'offered' && job.fare >= policy.minFare && eligibleTaxis.some((vehicle) => vehicleCanTakeJob(vehicle, job, current.passengers.find((passenger) => job.passengerIds.includes(passenger.id))?.partySize ?? 1) && distanceKmBetween(vehicle.position!, jobPickup(job)) <= policy.maxPickupKm)).sort((left, right) => right.fare - left.fare)[0]
      // Background dispatch must not interrupt the screen the player is using.
      if (offer) { get().acceptJob(offer.id, false); if (get().jobs.find((job) => job.id === offer.id)?.status === 'accepted') record(operationsManager.id, 'dispatch', `${operationsManager.name} accepted ${offer.pickupLabel} → ${offer.destinationLabel}`) }
    }

    const workshopManager = employeeFor('workshop-manager')
    if (workshopManager) {
      const current = get(); const vehicle = current.vehicles.find((item) => item.cityId === workshopManager.cityId && item.status === 'available' && item.condition < policy.autoServiceBelow)
      if (vehicle && current.company && current.company.cash - policy.cashReserve >= 850 && workshopManager.spendingLimit >= 850) { get().startMaintenance(vehicle.id, 'repair'); if (get().vehicles.find((item) => item.id === vehicle.id)?.maintenanceJob) record(workshopManager.id, 'service', `${workshopManager.name} sent ${vehicle.name} to the workshop`) }
    }

    const cleaningSupervisor = employeeFor('cleaning-supervisor')
    if (cleaningSupervisor) {
      const current = get(); const vehicle = current.vehicles.find((item) => item.cityId === cleaningSupervisor.cityId && item.status === 'available' && (item.cleanliness ?? 100) < 55)
      if (vehicle && current.company && current.company.cash - policy.cashReserve >= 80 && cleaningSupervisor.spendingLimit >= 80) { const before = vehicle.cleanliness; get().cleanVehicle(vehicle.id, 'standard'); if (get().vehicles.find((item) => item.id === vehicle.id)?.cleanliness !== before) record(cleaningSupervisor.id, 'clean', `${cleaningSupervisor.name} cleaned ${vehicle.name}`) }
    }

    const tireManager = employeeFor('tire-manager')
    if (tireManager) {
      const current = get(); const vehicle = current.vehicles.find((item) => item.cityId === tireManager.cityId && item.status === 'available' && (item.tireCondition ?? 100) < 28); const tireType: TireType = current.worldCondition.weather === 'snow' ? 'winter' : 'touring'; const cost = tireDetails[tireType].cost
      if (vehicle && current.company && current.company.cash - policy.cashReserve >= cost && tireManager.spendingLimit >= cost) { get().fitTires(vehicle.id, tireType); record(tireManager.id, 'tires', `${tireManager.name} fitted ${tireType} tires to ${vehicle.name}`) }
    }

    const postalSupervisor = employeeFor('postal-supervisor')
    if (postalSupervisor) { const vehicle = get().vehicles.find((item) => item.cityId === postalSupervisor.cityId && item.type === 'post' && item.status === 'available' && item.driverId && item.fuel >= policy.minFuel && item.condition >= policy.minCondition); if (vehicle) { get().startPostalRoute(vehicle.id); if (get().vehicles.find((item) => item.id === vehicle.id)?.postalRoute) record(postalSupervisor.id, 'postal', `${postalSupervisor.name} started a round for ${vehicle.name}`) } }

    const rentalManager = employeeFor('rental-manager')
    if (rentalManager) { const vehicle = get().vehicles.find((item) => item.cityId === rentalManager.cityId && item.type === 'rental' && item.status === 'available' && item.fuel >= policy.minFuel && item.condition >= policy.minCondition && (item.cleanliness ?? 100) >= 55); if (vehicle) { get().startRental(vehicle.id); if (get().vehicles.find((item) => item.id === vehicle.id)?.rentalJourney) record(rentalManager.id, 'rental', `${rentalManager.name} rented out ${vehicle.name}`) } }

    const customerManager = employeeFor('customer-service-manager')
    if (customerManager) { const review = [...get().customerReviews].reverse().find((item) => !item.companyResponse); if (review) { const response = review.rating <= 2 && get().company!.cash - policy.cashReserve >= 100 && customerManager.spendingLimit >= 100 ? 'voucher' : review.rating <= 3 ? 'apology' : 'thanks'; get().respondToReview(review.id, response); record(customerManager.id, 'review', `${customerManager.name} responded to a ${review.rating}-star review`) } }
  },
  acceptContract: (contractId) => set((state) => ({ contracts: state.contracts.map((contract) => contract.id === contractId ? { ...contract, accepted: true } : contract), updatedAt: new Date().toISOString() })),
  chooseSpecialization: (specialization) => set((state) => state.specializationPoints < 1 || state.specialization ? state : ({ specialization, specializationPoints: state.specializationPoints - 1, updatedAt: new Date().toISOString() })),
  takeLoan: (amount) => set((state) => !state.company || amount <= 0 ? state : ({ company: { ...state.company, cash: state.company.cash + amount }, loans: [...(state.loans ?? []), { id: crypto.randomUUID(), principal: amount, balance: Math.round(amount * 1.12), paymentAmount: Math.round(amount * 0.112), nextPaymentAt: nextMonthlyPaymentAt(state.company.foundedAt) }], financialTransactions: addTransactions(state.financialTransactions, transaction('loans', 'Business loan received', amount)), updatedAt: new Date().toISOString() })),
  sellVehicle: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId)
    if (!state.company || !vehicle || vehicle.status !== 'available' || state.vehicles.length <= 1) return state
    const resaleBonus = (hasResearch(state.completedResearch ?? [], 'fleet-telemetry') ? .1 : 0) + (hasResearch(state.completedResearch ?? [], 'circular-fleet') ? .1 : 0)
    const proceeds = vehicle.ownership === 'leased' ? 0 : Math.round(vehicleMarketValue(vehicle) * (1 + resaleBonus) - (vehicle.financeBalance ?? 0))
    return { company: { ...state.company, cash: state.company.cash + proceeds }, vehicles: state.vehicles.filter((candidate) => candidate.id !== vehicleId), drivers: state.drivers.filter((driver) => driver.id !== vehicle.driverId), financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', vehicle.ownership === 'leased' ? `Returned ${vehicle.name}` : `Sold ${vehicle.name}`, proceeds, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  setDriverShift: (driverId, shift) => set((state) => ({ drivers: state.drivers.map((driver) => driver.id === driverId ? { ...driver, shift } : driver), updatedAt: new Date().toISOString() })),
  hireDriver: (candidateId, vehicleId) => set((state) => {
    const candidate = state.driverCandidates.find((driver) => driver.id === candidateId)
    const vehicle = state.vehicles.find((item) => item.id === vehicleId && !item.driverId)
    if (!candidate || !vehicle) return state
    const { expiresAt: _expiresAt, ...driver } = candidate
    void _expiresAt
    return { drivers: [...state.drivers, driver], driverCandidates: state.driverCandidates.filter((item) => item.id !== candidateId), vehicles: state.vehicles.map((item) => item.id === vehicleId ? { ...item, driverId: driver.id } : item), updatedAt: new Date().toISOString() }
  }),
  refreshDriverCandidates: () => set((state) => ({ driverCandidates: createDriverCandidates(getCity(state.activeCityId ?? state.startingCityId, state.customCities)?.coordinates ?? [0, 0]), updatedAt: new Date().toISOString() })),
  serviceVehicle: (vehicleId, service) => set((state) => {
    const vehicle = state.vehicles.find((item) => item.id === vehicleId && item.status === 'available')
    const plans = { quick: { cost: 350, condition: 15 }, full: { cost: 1_200, condition: 45 }, preventative: { cost: 2_400, condition: 100 } }
    const plan = plans[service]
    const workshopLevel = depotFacilityLevel(state.branches.find((branch) => branch.cityId === vehicle?.cityId), 'workshop')
    const researchSaving = (hasResearch(state.completedResearch ?? [], 'preventive-diagnostics') ? .15 : 0) + (hasResearch(state.completedResearch ?? [], 'modular-workshops') ? .15 : 0)
    const cost = vehicle ? Math.round(maintenanceCost(vehicle, plan.cost) * (1 - workshopLevel * .1) * (1 - researchSaving)) : plan.cost
    if (!state.company || !vehicle || state.company.cash < cost || (vehicle.condition >= 100 && (vehicle.odometerKm ?? 0) < (vehicle.lastServiceAtKm ?? 0) + 10_000)) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, vehicles: state.vehicles.map((item) => item.id === vehicleId ? { ...item, condition: Math.min(100, item.condition + plan.condition), lifetimeExpenses: (item.lifetimeExpenses ?? 0) + cost, lastServiceAtKm: service === 'preventative' ? item.odometerKm ?? 0 : item.lastServiceAtKm } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('maintenance', `${vehicle.name} ${service} service`, -cost, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  installUpgrade: (vehicleId, upgrade) => set((state) => {
    const vehicle = state.vehicles.find((item) => item.id === vehicleId)
    const price = upgradeDetails[upgrade].price
    if (!state.company || !vehicle || !upgradeAppliesToVehicle(upgrade, vehicle) || (vehicle.upgrades ?? []).includes(upgrade) || state.company.cash < price) return state
    return { company: { ...state.company, cash: state.company.cash - price }, vehicles: state.vehicles.map((item) => item.id === vehicleId ? { ...item, upgrades: [...(item.upgrades ?? []), upgrade], lifetimeExpenses: (item.lifetimeExpenses ?? 0) + price } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('upgrades', `${vehicle.name}: ${upgradeDetails[upgrade].label}`, -price, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  setRefuelStrategy: (vehicleId, refuelStrategy) => set((state) => ({ vehicles: state.vehicles.map((vehicle) => vehicle.id === vehicleId ? { ...vehicle, refuelStrategy } : vehicle), updatedAt: new Date().toISOString() })),
  refuelVehicle: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((item) => item.id === vehicleId && item.status === 'available')
    const strategy = vehicle?.refuelStrategy ?? 'fast'
    const rate = strategy === 'economy' ? .8 : strategy === 'overnight' ? .55 : 1.2
    const energyLevel = depotFacilityLevel(state.branches.find((branch) => branch.cityId === vehicle?.cityId), 'energy')
    const researchSaving = (hasResearch(state.completedResearch ?? [], 'eco-routing') ? .12 : 0) + (vehicle?.powertrain === 'electric' && hasResearch(state.completedResearch ?? [], 'rapid-charging') ? .12 : 0)
    const cost = vehicle ? Math.round((100 - vehicle.fuel) * rate * (1 - energyLevel * .1) * (1 - researchSaving)) : 0
    if (!state.company || !vehicle || state.company.cash < cost || vehicle.fuel >= 100) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, vehicles: state.vehicles.map((item) => item.id === vehicleId ? { ...item, fuel: 100, lifetimeExpenses: (item.lifetimeExpenses ?? 0) + cost } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('energy', `${vehicle.name} refuel / charge`, -cost, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  claimGoal: (goalId) => set((state) => {
    const goal = state.goals.find((item) => item.id === goalId && item.completed && !item.claimed)
    if (!state.company || !goal) return state
    const reputation = addReputation(state.company.reputation, goal.reputationReward)
    return { company: { ...state.company, cash: state.company.cash + goal.cashReward, reputation, level: levelForReputation(reputation) }, goals: state.goals.map((item) => item.id === goalId ? { ...item, claimed: true } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('goals', `Goal reward: ${goal.label}`, goal.cashReward)), updatedAt: new Date().toISOString() }
  }),
  setDifficulty: (difficulty) => set({ difficulty, updatedAt: new Date().toISOString() }),
  setBrandStrategy: (patch) => set((state) => ({ brandStrategy: { ...(state.brandStrategy ?? defaultBrandStrategy), ...patch }, updatedAt: new Date().toISOString() })),
  launchMarketing: (marketingCampaign) => set((state) => {
    const costs = { none: 0, local: 1_000, digital: 2_500, event: 5_000 }
    const cost = costs[marketingCampaign]
    if (!state.company || state.company.cash < cost) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, brandStrategy: { ...(state.brandStrategy ?? defaultBrandStrategy), marketingCampaign, marketingExpiresAt: marketingCampaign === 'none' ? undefined : new Date(Date.now() + 10 * 60_000).toISOString() }, financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `${marketingCampaign} marketing campaign`, -cost)), updatedAt: new Date().toISOString() }
  }),
  partnerCompetitor: (competitorId) => set((state) => ({ competitors: (state.competitors ?? []).map((competitor) => competitor.id === competitorId ? { ...competitor, relationship: competitor.relationship === 'partner' ? 'rival' : 'partner' } : competitor), updatedAt: new Date().toISOString() })),
  acquireCompetitor: (competitorId) => set((state) => {
    const competitor = (state.competitors ?? []).find((item) => item.id === competitorId)
    const price = competitor ? Math.round(competitor.cash * .7 + competitor.fleetSize * 6_000) : 0
    if (!state.company || !competitor || state.company.cash < price) return state
    return { company: { ...state.company, cash: state.company.cash - price, reputation: addReputation(state.company.reputation, 5) }, competitors: state.competitors.filter((item) => item.id !== competitorId), garageLevel: (state.garageLevel ?? 0) + 1, financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `Acquired ${competitor.name}`, -price)), updatedAt: new Date().toISOString() }
  }),
  trainDriver: (driverId, certification) => set((state) => {
    const driver = state.drivers.find((item) => item.id === driverId)
    const cost = 1_500
    if (!state.company || !driver || state.company.cash < cost || (driver.certifications ?? []).includes(certification)) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, drivers: state.drivers.map((item) => item.id === driverId ? { ...item, certifications: [...(item.certifications ?? []), certification], experience: (item.experience ?? 0) + 25, morale: Math.min(100, (item.morale ?? 80) + 5) } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('payroll', `${driver.name}: ${certification} certification`, -cost)), updatedAt: new Date().toISOString() }
  }),
  resolveIncident: (incidentId, response: IncidentResponse = 'roadside-repair') => set((state) => {
    const incident = (state.incidents ?? []).find((item) => item.id === incidentId && !item.resolved)
    if (!state.company || !incident) return state
    const responseCost = response === 'tow' ? Math.round(incident.repairCost * .7) : response === 'replacement' ? 450 : response === 'refund' ? 250 : incident.repairCost
    if (state.company.cash < responseCost) return state
    const condition = response === 'roadside-repair' ? Math.max(65, state.vehicles.find((vehicle) => vehicle.id === incident.vehicleId)?.condition ?? 65) : response === 'tow' ? Math.max(80, state.vehicles.find((vehicle) => vehicle.id === incident.vehicleId)?.condition ?? 80) : undefined
    return { company: { ...state.company, cash: state.company.cash - responseCost }, incidents: state.incidents.map((item) => item.id === incidentId ? { ...item, resolved: true, response } : item), vehicles: state.vehicles.map((vehicle) => vehicle.id === incident.vehicleId ? { ...vehicle, status: response === 'replacement' || response === 'refund' ? 'maintenance' as const : 'available' as const, ...(condition === undefined ? {} : { condition }) } : vehicle), brandStrategy: { ...(state.brandStrategy ?? defaultBrandStrategy), safetyRating: Math.max(0, (state.brandStrategy?.safetyRating ?? 100) - (response === 'replacement' ? Math.max(1, incident.severity - 3) : incident.severity)) }, financialTransactions: addTransactions(state.financialTransactions, transaction(response === 'refund' ? 'fares' : 'maintenance', `${response.replace('-', ' ')}: ${incident.description}`, -responseCost, incident.vehicleId)), updatedAt: new Date().toISOString() }
  }),
  cleanVehicle: (vehicleId, service) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId)
    const plan = cleaningDetails[service]
    if (!state.company || !vehicle || state.company.cash < plan.cost || (vehicle.cleanliness ?? 100) >= 100) return state
    if (vehicle.status !== 'available') return { vehicles: state.vehicles.map((candidate) => candidate.id === vehicleId ? { ...candidate, queuedService: { kind: 'cleaning' as const, service } } : candidate), maintenanceAlerts: (state.maintenanceAlerts ?? []).filter((alert) => alert.vehicleId !== vehicleId || alert.kind !== 'cleaning'), updatedAt: new Date().toISOString() }
    return { company: { ...state.company, cash: state.company.cash - plan.cost }, vehicles: state.vehicles.map((candidate) => candidate.id !== vehicleId ? candidate : { ...candidate, cleanliness: Math.min(100, (candidate.cleanliness ?? 100) + plan.restored), recentlyDetailedUntil: service === 'detail' ? new Date(Date.now() + 24 * 60 * 60_000).toISOString() : candidate.recentlyDetailedUntil, lifetimeExpenses: (candidate.lifetimeExpenses ?? 0) + plan.cost }), maintenanceAlerts: (state.maintenanceAlerts ?? []).filter((alert) => alert.vehicleId !== vehicleId || alert.kind !== 'cleaning'), financialTransactions: addTransactions(state.financialTransactions, transaction('maintenance', `${vehicle.name}: ${plan.label}`, -plan.cost, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  fitTires: (vehicleId, tireType) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId && candidate.status === 'available')
    const cost = tireDetails[tireType].cost
    if (!state.company || !vehicle || state.company.cash < cost) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, vehicles: state.vehicles.map((candidate) => candidate.id !== vehicleId ? candidate : { ...candidate, tireType, tireCondition: 100, tireInstalledAtKm: candidate.odometerKm ?? 0, lifetimeExpenses: (candidate.lifetimeExpenses ?? 0) + cost }), maintenanceAlerts: (state.maintenanceAlerts ?? []).filter((alert) => alert.vehicleId !== vehicleId || alert.kind !== 'tires'), financialTransactions: addTransactions(state.financialTransactions, transaction('maintenance', `${vehicle.name}: ${tireDetails[tireType].label} tires`, -cost, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  startMaintenance: (vehicleId, kind) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId && !candidate.maintenanceJob)
    const mechanic = (state.mechanics ?? []).filter((candidate) => candidate.cityId === vehicle?.cityId).sort((left, right) => right.skill - left.skill)[0]
    if (!state.company || !vehicle) return state
    const quote = maintenanceQuote(vehicle, kind, mechanic)
    if (state.company.cash < quote.cost) return state
    if (vehicle.status !== 'available') return { vehicles: state.vehicles.map((candidate) => candidate.id === vehicleId ? { ...candidate, queuedService: { kind } } : candidate), maintenanceAlerts: (state.maintenanceAlerts ?? []).filter((alert) => alert.vehicleId !== vehicleId), updatedAt: new Date().toISOString() }
    const startedAt = new Date().toISOString()
    return { company: { ...state.company, cash: state.company.cash - quote.cost }, vehicles: state.vehicles.map((candidate) => candidate.id !== vehicleId ? candidate : { ...candidate, status: 'maintenance' as const, maintenanceJob: { kind, mechanicId: mechanic?.id, startedAt, completesAt: new Date(Date.now() + quote.durationMs).toISOString(), cost: quote.cost }, lifetimeExpenses: (candidate.lifetimeExpenses ?? 0) + quote.cost }), maintenanceAlerts: (state.maintenanceAlerts ?? []).filter((alert) => alert.vehicleId !== vehicleId), financialTransactions: addTransactions(state.financialTransactions, transaction('maintenance', `${vehicle.name}: ${kind}`, -quote.cost, vehicle.id)), updatedAt: startedAt }
  }),
  dismissMaintenanceAlert: (alertId) => set((state) => ({ maintenanceAlerts: (state.maintenanceAlerts ?? []).map((alert) => alert.id === alertId ? { ...alert, dismissed: true } : alert), updatedAt: new Date().toISOString() })),
  recruitMechanic: () => set((state) => ({ mechanics: [...(state.mechanics ?? []), recruitMechanic(state.activeCityId ?? state.startingCityId ?? '', state.mechanics?.length ?? 0)], updatedAt: new Date().toISOString() })),
  recruitDispatcher: () => set((state) => ({ dispatchers: [...(state.dispatchers ?? []), recruitDispatcher(state.activeCityId ?? state.startingCityId ?? '', state.dispatchers?.length ?? 0)], updatedAt: new Date().toISOString() })),
  setDispatcherStrategy: (dispatcherId, strategy) => set((state) => ({ dispatchers: (state.dispatchers ?? []).map((dispatcher) => dispatcher.id === dispatcherId ? { ...dispatcher, strategy } : dispatcher), updatedAt: new Date().toISOString() })),
  respondToReview: (reviewId, response) => set((state) => {
    const cost = response === 'voucher' ? 100 : 0
    if (!state.company || state.company.cash < cost) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, customerReviews: (state.customerReviews ?? []).map((review) => review.id === reviewId ? { ...review, companyResponse: response } : review), financialTransactions: cost ? addTransactions(state.financialTransactions, transaction('expansion', 'Customer recovery voucher', -cost)) : state.financialTransactions, updatedAt: new Date().toISOString() }
  }),
  setRouteTimetable: (kind, routeId, departureHour, frequencyHours) => set((state) => kind === 'coach' ? ({ coachRoutes: state.coachRoutes.map((route) => route.id === routeId ? { ...route, departureHour, frequencyHours } : route), updatedAt: new Date().toISOString() }) : ({ transportRoutes: state.transportRoutes.map((route) => route.id === routeId ? { ...route, departureHour, frequencyHours } : route), updatedAt: new Date().toISOString() })),
  toggleExteriorAccessory: (vehicleId, accessory) => set((state) => ({
    vehicles: state.vehicles.map((vehicle) => vehicle.id !== vehicleId ? vehicle : { ...vehicle, exteriorAccessories: (vehicle.exteriorAccessories ?? []).includes(accessory) ? (vehicle.exteriorAccessories ?? []).filter((item) => item !== accessory) : [...(vehicle.exteriorAccessories ?? []), accessory] }),
    updatedAt: new Date().toISOString(),
  })),
  resetGame: () => set({ ...blankSave, activeSection: 'map', hasHydrated: true }),
}), {
  name: 'save:autosave', storage: createJSONStorage(() => indexedDbStorage),
  version: 26,
  // Structural migration is performed in merge below because it needs Turf
  // helpers. Supplying migrate preserves version-16 saves instead of letting
  // Zustand reject them before merge receives the persisted state.
  migrate: (persisted) => persisted as GameState,
  merge: (persisted, current) => {
    const saved = persisted as Partial<GameState>
    const customCities = saved.customCities ?? []
    const savedVersion = saved.version ?? 0
    const savedExpansions = saved.territoryExpansions ?? []
    const legacyDiscoveries = savedExpansions.filter((area) => area.source === 'taxi-discovery')
    let territoryExpansions = savedExpansions.filter((area) => area.source !== 'taxi-discovery').map((area) => {
      if (area.source !== 'ferry-discovery' || area.routeCoordinates?.length) return area
      const routeId = area.id.startsWith('ferry-discovery:') ? area.id.slice('ferry-discovery:'.length) : null
      const route = routeId ? (saved.transportRoutes ?? []).find((candidate) => candidate.id === routeId) : undefined
      return route?.routeCoordinates?.length ? { ...area, routeCoordinates: route.routeCoordinates } : area
    })
    const exploredTerritory = compactLegacyDiscoveries(saved.exploredTerritory, legacyDiscoveries)
    const licensedCities = [...customCities, ...cities.filter((city) => (saved.countryLicenses ?? []).includes(city.countryCode))]
    const cityEconomies = [...(saved.cityEconomies ?? [])]
    licensedCities.forEach((city) => { if (!cityEconomies.some((economy) => economy.cityId === city.id)) cityEconomies.push(createCityEconomy(city)) })
    const purchasedHarbours = saved.purchasedHarbours ?? [...new Map((saved.transportRoutes ?? []).flatMap((route) =>
      route.mode === 'ferry' && route.originCoordinates
        ? [[`harbour:${route.originCoordinates.map((part) => part.toFixed(4)).join(',')}`, { id: `harbour:${route.originCoordinates.map((part) => part.toFixed(4)).join(',')}`, name: route.originName ?? 'Harbour', coordinates: route.originCoordinates, purchasedAt: saved.updatedAt ?? new Date().toISOString() }] as const]
        : [])).values()]
    const discoveredFerryRoutes = saved.discoveredFerryRoutes ?? (saved.transportRoutes ?? []).flatMap((route) =>
      route.mode === 'ferry' && route.originCoordinates && route.destinationCoordinates && route.routeCoordinates?.length
        ? [{
            id: route.sourceRouteId ?? route.id,
            name: route.name,
            originName: route.originName ?? 'Harbour',
            destinationName: route.destinationName ?? 'Ferry destination',
            originCoordinates: route.originCoordinates,
            destinationCoordinates: route.destinationCoordinates,
            routeCoordinates: route.routeCoordinates,
            distanceKm: route.distanceKm ?? distanceKmBetween(route.originCoordinates, route.destinationCoordinates),
            source: route.sourceRouteId?.startsWith('osm-') ? 'openstreetmap' as const : 'curated' as const,
            cityId: route.fromCityId,
            discoveredAt: saved.updatedAt ?? new Date().toISOString(),
          }]
        : [])
    // Existing continuous shuttles may already have completed their first
    // outbound crossing before ferry discovery became persisted. Revenue proves
    // at least one leg settled, so restore the destination territory once.
    if (savedVersion < 23) {
      for (const asset of (saved.transportAssets ?? []).filter((candidate) => candidate.mode === 'ferry' && candidate.lifetimeRevenue > 0)) {
        const route = (saved.transportRoutes ?? []).find((candidate) => candidate.id === asset.journey?.routeId)
        if (!route?.destinationCoordinates) continue
        const id = `ferry-discovery:${route.id}`
        if (territoryExpansions.some((expansion) => expansion.id === id)) continue
        territoryExpansions = [...territoryExpansions, {
          id,
          coordinates: route.destinationCoordinates,
          routeCoordinates: route.routeCoordinates,
          purchasedAt: asset.journey?.startedAt ?? saved.updatedAt ?? new Date().toISOString(),
          source: 'ferry-discovery' as const,
        }]
      }
    }
    // Version 22 could persist island offers that were routed over an unowned
    // ferry edge. Drop only unaccepted offers once so the new board is rebuilt
    // from currently operating player-owned ferry services.
    let jobs = savedVersion < 23
      ? (saved.jobs ?? []).filter((job) => job.status !== 'offered')
      : saved.jobs ?? []
    jobs = jobs.map((job) => {
      const pickupFerryCrossings = job.pickupRouteCoordinates && job.pickupFerryCrossings?.length
        ? resolveLandsideFerryTerminals(job.pickupRouteCoordinates, job.pickupFerryCrossings)
        : job.pickupFerryCrossings
      const ferryCrossings = job.routeCoordinates && job.ferryCrossings?.length
        ? resolveLandsideFerryTerminals(job.routeCoordinates, job.ferryCrossings)
        : job.ferryCrossings
      return pickupFerryCrossings === job.pickupFerryCrossings && ferryCrossings === job.ferryCrossings
        ? job
        : { ...job, pickupFerryCrossings, ferryCrossings }
    })
    const strandedJobVehicleIds = new Set<string>()
    if (savedVersion < 26) {
      jobs = jobs.map((job) => {
        if (job.status !== 'accepted' || !job.pickupFerryCrossings?.length || ferryCrossingsHaveActiveService(job.pickupFerryCrossings, saved.transportRoutes ?? [], saved.transportAssets ?? [])) return job
        if (job.assignedVehicleId) strandedJobVehicleIds.add(job.assignedVehicleId)
        return { ...job, status: 'offered' as const, assignedVehicleId: undefined, acceptedAt: undefined, dispatchOrigin: undefined, pickupRouteCoordinates: undefined, pickupFerryCrossings: undefined }
      })
    }
    const hotels = (saved.hotels ?? []).map((hotel) => ({ ...hotel, coordinates: hotel.coordinates ?? getCity(hotel.cityId, customCities)?.coordinates }))
    const company = saved.company ? { ...saved.company, level: levelForReputation(saved.company.reputation) } : null
    const strandedDriverIds = new Set((saved.vehicles ?? []).filter((vehicle) => strandedJobVehicleIds.has(vehicle.id)).flatMap((vehicle) => vehicle.driverId ? [vehicle.driverId] : []))
    return { ...current, ...saved, version: 26, company, customCities, territoryExpansions, exploredTerritory, hotels, cityEconomies, territoryLicenses: saved.territoryLicenses ?? [], countryLicenses: saved.countryLicenses ?? [], discoveredFerryRoutes, purchasedHarbours, jobs, completedResearch: saved.completedResearch ?? [], competitors: saved.competitors ?? [], difficulty: saved.difficulty ?? 'standard', worldCondition: saved.worldCondition ?? createWorldCondition(), incidents: saved.incidents ?? [], mechanics: saved.mechanics ?? [], dispatchers: saved.dispatchers ?? [], automationEmployees: saved.automationEmployees ?? [], maintenanceAlerts: saved.maintenanceAlerts ?? [], customerReviews: saved.customerReviews ?? [], brandStrategy: { ...defaultBrandStrategy, ...(saved.brandStrategy ?? {}) }, automation: { ...current.automation, ...(saved.automation ?? {}), activity: saved.automation?.activity ?? [] }, vehicles: (saved.vehicles ?? []).map((vehicle) => ({ cleanliness: 100, tireCondition: 100, tireType: 'touring' as const, tireInstalledAtKm: vehicle.odometerKm ?? 0, ...vehicle, status: strandedJobVehicleIds.has(vehicle.id) ? 'available' as const : vehicle.status })), drivers: (saved.drivers ?? []).map((driver) => ({ experience: 0, morale: 80, certifications: [], completedTrips: 0, careerEarnings: 0, ...driver, status: strandedDriverIds.has(driver.id) ? 'available' as const : driver.status })), branches: (saved.branches ?? []).map((branch, index) => ({ ...branch, name: branch.isHeadquarters ? `Station ${index + 1}` : branch.name, isHeadquarters: undefined, coordinates: branch.coordinates ?? getCity(branch.cityId, saved.customCities ?? [])?.coordinates })) }
  },
  partialize: ({ activeSection, focusedJobId, hasHydrated, jobsLoading, jobsError, ...save }) => {
    void activeSection
    void focusedJobId
    void hasHydrated
    void jobsLoading
    void jobsError
    return save
  },
  onRehydrateStorage: () => (state) => {
    // Continue to setup/the map even when the device's persistence backend is
    // unavailable. The storage adapter already attempts its local backup; a
    // storage failure must never turn the splash screen into a dead end.
    if (state) state.setHasHydrated(true)
    else useGameStore.setState({ hasHydrated: true })
  },
}))
