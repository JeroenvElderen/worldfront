import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { countries, getCity } from '../data/cities'
import { transportModels } from '../data/transport'
import { getTaxiModel } from '../data/taxis'
import { getPostVehicleModel } from '../data/postVehicles'
import type { City, Company, DepotFacility, Driver, ExteriorAccessory, FinancialTransaction, GameSave, RefuelStrategy, Specialization, TransactionCategory, TransportMode, Vehicle, VehicleUpgrade } from '../models/game'
import { indexedDbStorage } from '../services/saveDatabase'
import { addReputation, DEPOT_FACILITY_MAX_LEVEL, depotFacilityLevel, depotFacilityUpgradeCost, fleetSlotCapacity, garageUpgradeCost, LEASING_UNLOCK_LEVEL, levelForReputation, maxJobDistanceForFleet } from '../services/companyProgression'
import { generateJobOffers } from '../services/jobOfferService'
import { acceptJobState, completeArrivedJobsState, completeJobState, distanceKmBetween, getJobJourney, jobDestination, jobOfferExpiresAt, jobPickup, MAX_JOB_OFFERS } from '../services/jobEngine'
import { createDynamicEvent, energyUseForJob, fatigueUseForJob, startRecoveryTrip } from '../services/operationsEngine'
import { nextMonthlyPaymentAt } from '../services/gameTime'
import { createPostalRoute } from '../services/postalEngine'
import { createRentalJourney } from '../services/rentalEngine'
import { maintenanceCost, vehicleMarketValue } from '../services/vehicleEconomics'
import { calculateJobOutcome, createDriverCandidates, createGoals, pickupSpeedMultiplier, updateGoals, upgradeDetails, vehicleCanTakeJob } from '../services/earlyGameEngine'

type Section = 'map' | 'jobs' | 'fleet' | 'finance' | 'travel' | 'company'
interface GameActions { initializeCompany: (city: City) => void; upgradeDepotFacility: (cityId: string, facility: DepotFacility) => void; pauseGame: () => void; resumeGame: () => void; setSection: (section: Section) => void; openJob: (jobId: string) => void; showJobOnMap: (jobId: string) => void; refreshJobs: () => Promise<void>; addRandomJob: () => Promise<void>; acceptJob: (jobId: string) => void; declineJob: (jobId: string) => void; completeJob: (jobId: string) => void; tickJobs: () => void; buyTaxi: (modelId: string) => void; leaseTaxi: (modelId: string) => void; upgradeGarage: () => void; buyPostVehicle: (modelId: string) => void; startPostalRoute: (vehicleId: string) => void; buyRentalCar: (modelId: string) => void; startRental: (vehicleId: string) => void; buyCountryLicense: (countryCode: string) => void; openBranch: (cityId: string) => void; switchCity: (cityId: string) => void; openAgency: () => void; createTour: () => void; dispatchTour: (tourId: string, vehicleId: string) => void; buyTourBus: () => void; buyCoach: () => void; createCoachRoute: (toCityId: string) => void; dispatchCoach: (routeId: string, vehicleId: string) => void; buyTransportAsset: (mode: TransportMode) => void; createTransportRoute: (mode: TransportMode, toCityId: string) => void; dispatchTransport: (routeId: string, assetId: string) => void; setAutomation: (patch: Partial<GameSave['automation']>) => void; acceptContract: (contractId: string) => void; chooseSpecialization: (specialization: Specialization) => void; takeLoan: (amount: number) => void; sellVehicle: (vehicleId: string) => void; setDriverShift: (driverId: string, shift: Driver['shift']) => void; hireDriver: (candidateId: string, vehicleId: string) => void; refreshDriverCandidates: () => void; serviceVehicle: (vehicleId: string, service: 'quick' | 'full' | 'preventative') => void; installUpgrade: (vehicleId: string, upgrade: VehicleUpgrade) => void; setRefuelStrategy: (vehicleId: string, strategy: RefuelStrategy) => void; refuelVehicle: (vehicleId: string) => void; claimGoal: (goalId: string) => void; toggleExteriorAccessory: (vehicleId: string, accessory: ExteriorAccessory) => void; resetGame: () => void }
interface GameState extends GameSave { activeSection: Section; focusedJobId: string | null; hasHydrated: boolean; jobsLoading: boolean; jobsError: string | null; setHasHydrated: (value: boolean) => void }

const initialContracts = () => [
  { id: crypto.randomUUID(), name: 'Airport partner', description: 'Complete 5 airport transfers', category: 'airport' as const, target: 5, progress: 0, reward: 4_500, expiresAt: new Date(Date.now() + 7 * 60_000).toISOString(), accepted: false, completed: false },
  { id: crypto.randomUUID(), name: 'City post tender', description: 'Complete 3 postal rounds', category: 'postal' as const, target: 3, progress: 0, reward: 6_000, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), accepted: false, completed: false },
  { id: crypto.randomUUID(), name: 'Visitor experience', description: 'Complete 2 guided tours', category: 'tour' as const, target: 2, progress: 0, reward: 5_000, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), accepted: false, completed: false },
]
const blankSave: GameSave = { id: 'autosave', version: 11, updatedAt: new Date(0).toISOString(), pausedAt: null, company: null, startingCityId: null, activeCityId: null, branches: [], customCities: [], territoryLicenses: [], countryLicenses: [], vehicles: [], garageLevel: 0, transportAssets: [], transportRoutes: [], drivers: [], driverCandidates: [], jobs: [], agencies: [], tours: [], coachRoutes: [], contracts: [], specialization: null, specializationPoints: 1, automation: { enabled: false, minFare: 20, maxPickupKm: 10, autoServiceBelow: 30 }, passengers: [], goals: [], jobRequestHistory: [], loans: [], financialTransactions: [], activeEvent: null, nextEventAt: new Date(0).toISOString(), nextOperatingPaymentAt: new Date(0).toISOString() }


const transaction = (category: TransactionCategory, description: string, amount: number, vehicleId?: string, occurredAt = new Date().toISOString()): FinancialTransaction => ({
  id: crypto.randomUUID(), occurredAt, category, description, amount, vehicleId,
})
const addTransactions = (existing: FinancialTransaction[] | undefined, ...entries: FinancialTransaction[]) =>
  [...(existing ?? []), ...entries].slice(-500)
const availableStaffedTaxiCount = (state: Pick<GameState, 'vehicles' | 'drivers'>) => state.vehicles.filter((vehicle) =>
  vehicle.type === 'taxi' &&
  vehicle.status === 'available' &&
  vehicle.driverId &&
  state.drivers.some((driver) => driver.id === vehicle.driverId && driver.status === 'available'),
).length
const fitOffersToAvailableTaxis = (jobs: GameSave['jobs'], taxiCount: number) => {
  let offersKept = 0
  return jobs.filter((job) => job.status !== 'offered' || offersKept++ < taxiCount)
}
const newVehicleLifecycle = (price: number, purchasedAt = new Date().toISOString()) => ({
  purchasePrice: price, purchasedAt, odometerKm: 0, lifetimeRevenue: 0, lifetimeExpenses: 0, batteryHealth: 100, lastServiceAtKm: 0,
})
const hasFleetSlot = (state: Pick<GameState, 'company' | 'garageLevel' | 'vehicles' | 'branches'>) =>
  Boolean(state.company && state.vehicles.length < fleetSlotCapacity(state.company.level, state.garageLevel ?? 0, state.branches))
const advanceContracts = (contracts: GameSave['contracts'], category: GameSave['contracts'][number]['category']) => contracts.map((contract) => {
  if (!contract.accepted || contract.completed || contract.category !== category) return contract
  const progress = Math.min(contract.target, contract.progress + 1)
  return { ...contract, progress, completed: progress >= contract.target }
})
export const useGameStore = create<GameState & GameActions>()(persist((set) => ({
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
    const driver: Driver = { id: crypto.randomUUID(), name: 'Alex Morgan', rating: 4.7, salary: 650, status: 'available', fatigue: 0, home, shift: 'day', trait: 'careful' }
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${starter.brand} ${starter.name} 1`, type: 'taxi', modelId: starter.id, powertrain: starter.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: starter.price, ...newVehicleLifecycle(starter.price, now), condition: 100, fuel: 100, capacity: starter.capacity, topSpeedKmh: starter.topSpeedKmh, status: 'available', cityId, position: home, driverId: driver.id, ownership: 'owned' }
    set({ ...blankSave, company, startingCityId: cityId, activeCityId: cityId, customCities: [city], territoryLicenses: [`${city.countryCode}:${city.regionCode ?? city.regionName ?? city.name}`], countryLicenses: [city.countryCode], branches: [{ id: crypto.randomUUID(), cityId, name: `${city.name} HQ`, openedAt: now, managerName: 'Alex Morgan', isHeadquarters: true, depot: { parking: 0, workshop: 0, energy: 0, lounge: 0 } }], contracts: initialContracts(), vehicles: [vehicle], drivers: [driver], driverCandidates: createDriverCandidates(home), goals: createGoals(), financialTransactions: [transaction('loans', 'Founder capital', 25_000, undefined, now)], activeEvent: createDynamicEvent(), nextEventAt: new Date(Date.now() + 8 * 60_000).toISOString(), nextOperatingPaymentAt: nextMonthlyPaymentAt(now), updatedAt: now, activeSection: 'map', hasHydrated: true, jobsLoading: false, jobsError: null })
  },
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
    const availableTaxi = state.vehicles.find((vehicle) => vehicle.type === 'taxi' && vehicle.status === 'available' && vehicle.driverId)
    if (!(state.activeCityId ?? state.startingCityId) || state.jobsLoading || !availableTaxi) return
    const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    if (!city) return
    set({ jobsLoading: true, jobsError: null })
    try {
      const level = levelForReputation(state.company?.reputation ?? 0)
      const searchArea = availableTaxi.position ? { ...city, coordinates: availableTaxi.position } : city
      const taxis = state.vehicles.filter((vehicle) => vehicle.type === 'taxi')
      const taxiPositions = taxis.filter((vehicle) => vehicle.status === 'available').map((vehicle) => vehicle.position ?? city.coordinates)
      const maxDistanceKm = maxJobDistanceForFleet(level, taxis.length)
      const generated = await generateJobOffers(searchArea, 1, state.jobRequestHistory ?? [], maxDistanceKm, undefined, taxiPositions, state.activeEvent?.fareMultiplier ?? 1)
      set((latest) => {
        const openSlots = Math.max(0, availableStaffedTaxiCount(latest) - latest.jobs.filter((job) => job.status === 'offered').length)
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
    const availableTaxi = state.vehicles.find((vehicle) => vehicle.type === 'taxi' && vehicle.status === 'available' && vehicle.driverId)
    if (!(state.activeCityId ?? state.startingCityId) || state.jobsLoading || !availableTaxi || state.jobs.filter((job) => job.status === 'offered').length >= MAX_JOB_OFFERS) return
    const city = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    if (!city) return
    set({ jobsLoading: true, jobsError: null })
    try {
      const level = levelForReputation(state.company?.reputation ?? 0)
      const searchArea = availableTaxi.position ? { ...city, coordinates: availableTaxi.position } : city
      const taxis = state.vehicles.filter((vehicle) => vehicle.type === 'taxi')
      const taxiPositions = taxis.filter((vehicle) => vehicle.status === 'available').map((vehicle) => vehicle.position ?? city.coordinates)
      const maxDistanceKm = maxJobDistanceForFleet(level, taxis.length)
      const generated = await generateJobOffers(searchArea, 1, state.jobRequestHistory ?? [], maxDistanceKm, undefined, taxiPositions, state.activeEvent?.fareMultiplier ?? 1)
      set((latest) => {
        const openSlots = Math.max(0, availableStaffedTaxiCount(latest) - latest.jobs.filter((job) => job.status === 'offered').length)
        const acceptedJobs = generated.jobs.slice(0, openSlots)
        const acceptedPassengerIds = new Set(acceptedJobs.flatMap((job) => job.passengerIds))
        return { jobs: [...latest.jobs.filter((job) => job.status !== 'complete'), ...acceptedJobs], passengers: [...latest.passengers, ...generated.passengers.filter((passenger) => acceptedPassengerIds.has(passenger.id))], jobRequestHistory: [...(latest.jobRequestHistory ?? []), ...generated.signatures.slice(0, openSlots)].slice(-100), updatedAt: new Date().toISOString(), jobsLoading: false }
      })
    } catch (error) {
      set({ jobsLoading: false, jobsError: error instanceof Error ? error.message : 'Could not generate a request.' })
    }
  },
  acceptJob: (jobId) => set((state) => {
    const offeredJob = state.jobs.find((job) => job.id === jobId)
    const passenger = state.passengers.find((item) => offeredJob?.passengerIds.includes(item.id))
    const suitableVehicles = state.vehicles.filter((vehicle) => vehicle.type === 'taxi' && vehicle.status === 'available' && vehicle.driverId && state.drivers.find((driver) => driver.id === vehicle.driverId)?.status === 'available' && offeredJob && vehicleCanTakeJob(vehicle, offeredJob, passenger?.partySize ?? 1))
    if (!offeredJob || !suitableVehicles.length) return state
    const result = acceptJobState(state.jobs, state.vehicles, jobId, new Set(suitableVehicles.map((vehicle) => vehicle.id)))
    if (!result) return state
    const assignedVehicleId = result.jobs.find((job) => job.id === jobId)?.assignedVehicleId
    const driverId = result.vehicles.find((vehicle) => vehicle.id === assignedVehicleId)?.driverId
    const driver = state.drivers.find((candidate) => candidate.id === driverId)
    if (driver?.trait === 'unreliable' && Math.random() < .12) return { drivers: state.drivers.map((candidate) => candidate.id === driverId ? { ...candidate, status: 'off-duty' as const, missedShiftUntil: new Date(Date.now() + 60_000).toISOString() } : candidate), updatedAt: new Date().toISOString() }
    const drivers = state.drivers.map((candidate) => candidate.id === driverId ? { ...candidate, status: 'driving' as const } : candidate)
    const jobs = result.jobs.map((job) => job.id === jobId ? { ...job, pickupTimeMultiplier: pickupSpeedMultiplier(driver), durationMinutes: driver?.trait === 'careful' ? job.durationMinutes * 1.05 : job.durationMinutes, fare: (result.vehicles.find((vehicle) => vehicle.id === assignedVehicleId)?.upgrades ?? []).includes('meter-pro') ? Math.round(job.fare * 1.08 * 100) / 100 : job.fare } : job)
    return { ...result, jobs: fitOffersToAvailableTaxis(jobs, availableStaffedTaxiCount({ vehicles: result.vehicles, drivers })), drivers, focusedJobId: jobId, updatedAt: new Date().toISOString(), activeSection: 'map' }
  }),
  declineJob: (jobId) => set((state) => ({ jobs: state.jobs.filter((job) => job.id !== jobId), focusedJobId: state.focusedJobId === jobId ? null : state.focusedJobId, updatedAt: new Date().toISOString() })),
  completeJob: (jobId) => set((state) => {
    if (!state.company) return state
    const result = completeJobState(state.company, state.jobs, state.vehicles, jobId)
    return result ? { ...result, updatedAt: new Date().toISOString() } : state
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
    if (result) {
      for (const jobId of result.completedJobIds) {
        const job = state.jobs.find((candidate) => candidate.id === jobId)!
        const previousVehicle = state.vehicles.find((candidate) => candidate.id === job.assignedVehicleId)!
        const driver = drivers.find((candidate) => candidate.id === previousVehicle.driverId)
        // Base recovery on the actual arrival time. If the app was closed long
        // enough for both journeys to finish, the service trip can settle in
        // this same tick instead of leaving the taxi unavailable after launch.
        const completedAt = getJobJourney(job, previousVehicle).arrivesAt
        const outcome = calculateJobOutcome(job, previousVehicle, driver)
        const emptyDistanceKm = previousVehicle.position ? distanceKmBetween(previousVehicle.position, jobPickup(job)) : 0
        const journeyDistanceKm = emptyDistanceKm + job.distanceKm
        // completeArrivedJobsState already applied the one-star (0.2) floor.
        const reputation = addReputation(company.reputation, outcome.reputationEarned - 0.2)
        company = { ...company, cash: company.cash + outcome.tip, reputation, level: levelForReputation(reputation) }
        financialTransactions = addTransactions(
          financialTransactions,
          transaction('fares', `${previousVehicle.name} fare`, job.fare, previousVehicle.id, new Date(completedAt).toISOString()),
          ...(outcome.tip > 0 ? [transaction('tips', `${previousVehicle.name} tip`, outcome.tip, previousVehicle.id, new Date(completedAt).toISOString())] : []),
        )
        result.jobs = result.jobs.map((candidate) => candidate.id === jobId ? { ...candidate, satisfaction: outcome.satisfaction, customerRating: outcome.customerRating, tip: outcome.tip, reputationEarned: outcome.reputationEarned } : candidate)
        const batteryWear = previousVehicle.powertrain === 'electric' ? journeyDistanceKm / 30_000 : 0
        const depleted = { ...previousVehicle, position: jobDestination(job), status: 'available' as const, odometerKm: (previousVehicle.odometerKm ?? 0) + journeyDistanceKm, lifetimeRevenue: (previousVehicle.lifetimeRevenue ?? 0) + job.fare + outcome.tip, batteryHealth: Math.max(60, (previousVehicle.batteryHealth ?? 100) - batteryWear), condition: Math.max(0, previousVehicle.condition - outcome.wear), fuel: Math.max(0, previousVehicle.fuel - energyUseForJob(job, previousVehicle, state.activeEvent, driver)) }
        const tiredDriver = driver && { ...driver, fatigue: Math.min(100, driver.fatigue + fatigueUseForJob(job)) }
        const needsAutomaticRecovery = previousVehicle.refuelStrategy === 'automatic' || (tiredDriver?.fatigue ?? 0) >= 80
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
    vehicles = vehicles.map((vehicle) => {
      if (vehicle.scheduledJourney && new Date(vehicle.scheduledJourney.arrivesAt).getTime() <= now) {
        const journey = vehicle.scheduledJourney
        const bonus = state.specialization === 'tourism' && journey.kind === 'tour' ? Math.round(journey.reward * .2) : 0
        const reputation = addReputation(company.reputation, 1)
        company = { ...company, cash: company.cash + journey.reward + bonus, reputation, level: levelForReputation(reputation) }
        financialTransactions = addTransactions(financialTransactions, transaction(journey.kind === 'tour' ? 'tours' : 'coach', `${vehicle.name} ${journey.kind} service`, journey.reward + bonus, vehicle.id, journey.arrivesAt))
        if (journey.kind === 'tour') state = { ...state, contracts: advanceContracts(state.contracts ?? [], 'tour') }
        return { ...vehicle, position: journey.destination, status: 'available' as const, scheduledJourney: undefined, odometerKm: (vehicle.odometerKm ?? 0) + journey.distanceKm, lifetimeRevenue: (vehicle.lifetimeRevenue ?? 0) + journey.reward + bonus, fuel: Math.max(0, vehicle.fuel - journey.distanceKm / 8), condition: Math.max(0, vehicle.condition - journey.distanceKm / 350) }
      }
      if (vehicle.rentalJourney && new Date(vehicle.rentalJourney.arrivesAt).getTime() <= now) {
        const { reward, distanceKm, arrivesAt, waypoints } = vehicle.rentalJourney
        company = { ...company, cash: company.cash + reward }
        financialTransactions = addTransactions(financialTransactions, transaction('rentals', `${vehicle.name} rental`, reward, vehicle.id, arrivesAt))
        return { ...vehicle, position: waypoints.at(-1) ?? vehicle.position, status: 'available' as const, rentalJourney: undefined, odometerKm: (vehicle.odometerKm ?? 0) + distanceKm, lifetimeRevenue: (vehicle.lifetimeRevenue ?? 0) + reward, batteryHealth: vehicle.powertrain === 'electric' ? Math.max(60, (vehicle.batteryHealth ?? 100) - distanceKm / 30_000) : vehicle.batteryHealth, fuel: Math.max(0, vehicle.fuel - distanceKm / 5), condition: Math.max(0, vehicle.condition - distanceKm / 250) }
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
        return { ...vehicle, position: vehicle.postalRoute.stops.at(-1)?.coordinates ?? vehicle.position, status: 'available' as const, postalRoute: undefined, odometerKm: (vehicle.odometerKm ?? 0) + routeDistanceKm, lifetimeRevenue: (vehicle.lifetimeRevenue ?? 0) + revenue, batteryHealth: vehicle.powertrain === 'electric' ? Math.max(60, (vehicle.batteryHealth ?? 100) - routeDistanceKm / 30_000) : vehicle.batteryHealth, fuel: Math.max(0, vehicle.fuel - plannedHours * 4), condition: Math.max(0, vehicle.condition - plannedHours * .2) }
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
      const reputation = addReputation(company.reputation, 1.3)
      company = { ...company, cash: company.cash + journey.reward, reputation, level: levelForReputation(reputation) }
      financialTransactions = addTransactions(financialTransactions, transaction(asset.mode === 'airliner' ? 'airline' : asset.mode === 'train' ? 'rail' : 'ferry', `${asset.name} scheduled service`, journey.reward, undefined, journey.arrivesAt))
      return { ...asset, cityId: journey.destinationCityId, status: 'available' as const, lifetimeRevenue: asset.lifetimeRevenue + journey.reward, condition: Math.max(0, asset.condition - journey.distanceKm / 2_500), journey: undefined }
    })
    drivers = drivers.map((driver) => {
      if (driver.missedShiftUntil && new Date(driver.missedShiftUntil).getTime() <= now) return { ...driver, missedShiftUntil: undefined, status: 'available' as const }
      const vehicle = vehicles.find((candidate) => candidate.driverId === driver.id)
      if (vehicle?.serviceTrip) return driver
      const returningHome = state.vehicles.find((candidate) => candidate.driverId === driver.id)?.serviceTrip?.kind === 'home'
      return { ...driver, fatigue: returningHome ? 0 : driver.fatigue, status: 'available' as const }
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
      const leaseCost = vehicles.reduce((sum, vehicle) => sum + (vehicle.leaseMonthlyCost ?? vehicle.leaseWeeklyCost ?? 0), 0)
      const payrollCost = drivers.reduce((sum, driver) => {
        const vehicle = vehicles.find((candidate) => candidate.driverId === driver.id)
        const branch = state.branches.find((candidate) => candidate.cityId === vehicle?.cityId)
        return sum + Math.round(driver.salary * (1 - depotFacilityLevel(branch, 'lounge') * .05))
      }, 0)
      company = { ...company, cash: company.cash - leaseCost - payrollCost }
      if (leaseCost) financialTransactions = addTransactions(financialTransactions, transaction('leases', 'Fleet lease payments', -leaseCost))
      if (payrollCost) financialTransactions = addTransactions(financialTransactions, transaction('payroll', 'Driver payroll', -payrollCost))
      vehicles = vehicles.map((vehicle) => vehicle.ownership === 'leased' ? { ...vehicle, lifetimeExpenses: (vehicle.lifetimeExpenses ?? 0) + (vehicle.leaseMonthlyCost ?? vehicle.leaseWeeklyCost ?? 0) } : vehicle)
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
    return { company, jobs: result?.jobs ?? jobs, vehicles, transportAssets, drivers, goals, contracts, driverCandidates, loans, financialTransactions, activeEvent, nextEventAt, nextOperatingPaymentAt, focusedJobId: result ? null : (jobs.some((job) => job.id === state.focusedJobId) ? state.focusedJobId : null), updatedAt: new Date().toISOString() }
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
    const taxi: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} Lease`, type: 'taxi', modelId, powertrain: model.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: model.price, ...newVehicleLifecycle(model.price), condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'leased', leaseMonthlyCost: Math.round(model.price * 0.025) }
    const deposit = Math.round(model.price * 0.1)
    return { company: { ...state.company, cash: state.company.cash - deposit }, vehicles: [...state.vehicles, taxi], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Lease deposit: ${taxi.name}`, -deposit, taxi.id)), updatedAt: new Date().toISOString() }
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
    if (!country || !state.company || state.company.level < 3 || state.company.cash < country.licenseCost || (state.countryLicenses ?? ['IE']).includes(countryCode)) return state
    return { company: { ...state.company, cash: state.company.cash - country.licenseCost }, countryLicenses: [...(state.countryLicenses ?? ['IE']), countryCode], financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `${country.name} operating license`, -country.licenseCost)), updatedAt: new Date().toISOString() }
  }),
  openBranch: (cityId) => set((state) => {
    const city = getCity(cityId, state.customCities); const cost = state.specialization === 'mobility' ? 13_500 : 15_000
    if (!city || !state.company || state.company.level < 2 || state.company.cash < cost || !(state.countryLicenses ?? ['IE']).includes(city.countryCode) || state.branches.some((branch) => branch.cityId === cityId)) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, branches: [...state.branches, { id: crypto.randomUUID(), cityId, name: `${city.name} Branch`, openedAt: new Date().toISOString(), depot: { parking: 0, workshop: 0, energy: 0, lounge: 0 } }], activeCityId: cityId, financialTransactions: addTransactions(state.financialTransactions, transaction('expansion', `Opened ${city.name} branch`, -cost)), updatedAt: new Date().toISOString(), activeSection: 'map' }
  }),
  switchCity: (cityId) => set((state) => state.branches.some((branch) => branch.cityId === cityId) ? { activeCityId: cityId, activeSection: 'map' } : state),
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
    const startedAt = new Date(); const guestCount = vehicle.serviceClass === 'tour-bus' ? Math.round(vehicle.capacity * .75) : Math.min(vehicle.capacity, 12); const reward = Math.round(tour.price * guestCount * .72)
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
    if (!model || !city || !state.company || state.company.level < model.unlockLevel || state.company.cash < model.price) return state
    const count = (state.transportAssets ?? []).filter((asset) => asset.mode === mode).length + 1
    const asset = { id: crypto.randomUUID(), mode, name: `${model.model} ${count}`, model: model.model, capacity: model.capacity, speedKmh: model.speedKmh, value: model.price, condition: 100, status: 'available' as const, cityId: city.id, lifetimeRevenue: 0 }
    return { company: { ...state.company, cash: state.company.cash - model.price }, transportAssets: [...(state.transportAssets ?? []), asset], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Purchased ${model.label}: ${asset.name}`, -model.price)), updatedAt: new Date().toISOString() }
  }),
  createTransportRoute: (mode, toCityId) => set((state) => {
    const from = getCity(state.activeCityId ?? state.startingCityId, state.customCities)
    const to = getCity(toCityId, state.customCities)
    const licensed = state.countryLicenses ?? ['IE']
    if (!from || !to || from.id === to.id || !licensed.includes(to.countryCode) || (state.transportRoutes ?? []).some((route) => route.mode === mode && route.fromCityId === from.id && route.toCityId === to.id)) return state
    const distanceKm = distanceKmBetween(from.coordinates, to.coordinates)
    const baseFare = mode === 'train' ? 0.13 : mode === 'ferry' ? 0.1 : 0.2
    return { transportRoutes: [...(state.transportRoutes ?? []), { id: crypto.randomUUID(), mode, fromCityId: from.id, toCityId: to.id, name: `${from.name} → ${to.name}`, ticketPrice: Math.max(18, Math.round(distanceKm * baseFare)) }], updatedAt: new Date().toISOString() }
  }),
  dispatchTransport: (routeId, assetId) => set((state) => {
    const route = (state.transportRoutes ?? []).find((item) => item.id === routeId)
    const asset = (state.transportAssets ?? []).find((item) => item.id === assetId && item.mode === route?.mode && item.status === 'available' && item.cityId === route?.fromCityId)
    const from = getCity(route?.fromCityId ?? null, state.customCities)
    const destination = getCity(route?.toCityId ?? null, state.customCities)
    if (!route || !asset || !from || !destination) return state
    const distanceKm = distanceKmBetween(from.coordinates, destination.coordinates)
    const occupancy = route.mode === 'airliner' ? .72 : route.mode === 'ferry' ? .58 : .66
    const reward = Math.round(route.ticketPrice * asset.capacity * occupancy)
    const durationMs = Math.max(45_000, Math.min(240_000, distanceKm / asset.speedKmh * 35_000))
    const startedAt = new Date()
    return { transportRoutes: (state.transportRoutes ?? []).map((item) => item.id === routeId ? { ...item, assetId } : item), transportAssets: (state.transportAssets ?? []).map((item) => item.id === assetId ? { ...item, status: 'on-route' as const, journey: { routeId, startedAt: startedAt.toISOString(), arrivesAt: new Date(startedAt.getTime() + durationMs).toISOString(), reward, distanceKm, destinationCityId: destination.id } } : item), updatedAt: startedAt.toISOString(), activeSection: 'map' }
  }),
  setAutomation: (patch) => set((state) => ({ automation: { ...state.automation, ...patch }, updatedAt: new Date().toISOString() })),
  acceptContract: (contractId) => set((state) => ({ contracts: state.contracts.map((contract) => contract.id === contractId ? { ...contract, accepted: true } : contract), updatedAt: new Date().toISOString() })),
  chooseSpecialization: (specialization) => set((state) => state.specializationPoints < 1 || state.specialization ? state : ({ specialization, specializationPoints: state.specializationPoints - 1, updatedAt: new Date().toISOString() })),
  takeLoan: (amount) => set((state) => !state.company || amount <= 0 ? state : ({ company: { ...state.company, cash: state.company.cash + amount }, loans: [...(state.loans ?? []), { id: crypto.randomUUID(), principal: amount, balance: Math.round(amount * 1.12), paymentAmount: Math.round(amount * 0.112), nextPaymentAt: nextMonthlyPaymentAt(state.company.foundedAt) }], financialTransactions: addTransactions(state.financialTransactions, transaction('loans', 'Business loan received', amount)), updatedAt: new Date().toISOString() })),
  sellVehicle: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId)
    if (!state.company || !vehicle || vehicle.status !== 'available' || state.vehicles.length <= 1) return state
    const proceeds = vehicleMarketValue(vehicle)
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
    const cost = vehicle ? Math.round(maintenanceCost(vehicle, plan.cost) * (1 - workshopLevel * .1)) : plan.cost
    if (!state.company || !vehicle || state.company.cash < cost || (vehicle.condition >= 100 && (vehicle.odometerKm ?? 0) < (vehicle.lastServiceAtKm ?? 0) + 10_000)) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, vehicles: state.vehicles.map((item) => item.id === vehicleId ? { ...item, condition: Math.min(100, item.condition + plan.condition), lifetimeExpenses: (item.lifetimeExpenses ?? 0) + cost, lastServiceAtKm: service === 'preventative' ? item.odometerKm ?? 0 : item.lastServiceAtKm } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('maintenance', `${vehicle.name} ${service} service`, -cost, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  installUpgrade: (vehicleId, upgrade) => set((state) => {
    const vehicle = state.vehicles.find((item) => item.id === vehicleId)
    const price = upgradeDetails[upgrade].price
    if (!state.company || !vehicle || (vehicle.upgrades ?? []).includes(upgrade) || state.company.cash < price) return state
    return { company: { ...state.company, cash: state.company.cash - price }, vehicles: state.vehicles.map((item) => item.id === vehicleId ? { ...item, upgrades: [...(item.upgrades ?? []), upgrade], lifetimeExpenses: (item.lifetimeExpenses ?? 0) + price } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('upgrades', `${vehicle.name}: ${upgradeDetails[upgrade].label}`, -price, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  setRefuelStrategy: (vehicleId, refuelStrategy) => set((state) => ({ vehicles: state.vehicles.map((vehicle) => vehicle.id === vehicleId ? { ...vehicle, refuelStrategy } : vehicle), updatedAt: new Date().toISOString() })),
  refuelVehicle: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((item) => item.id === vehicleId && item.status === 'available')
    const strategy = vehicle?.refuelStrategy ?? 'fast'
    const rate = strategy === 'economy' ? .8 : strategy === 'overnight' ? .55 : 1.2
    const energyLevel = depotFacilityLevel(state.branches.find((branch) => branch.cityId === vehicle?.cityId), 'energy')
    const cost = vehicle ? Math.round((100 - vehicle.fuel) * rate * (1 - energyLevel * .1)) : 0
    if (!state.company || !vehicle || state.company.cash < cost || vehicle.fuel >= 100) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, vehicles: state.vehicles.map((item) => item.id === vehicleId ? { ...item, fuel: 100, lifetimeExpenses: (item.lifetimeExpenses ?? 0) + cost } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('energy', `${vehicle.name} refuel / charge`, -cost, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  claimGoal: (goalId) => set((state) => {
    const goal = state.goals.find((item) => item.id === goalId && item.completed && !item.claimed)
    if (!state.company || !goal) return state
    const reputation = addReputation(state.company.reputation, goal.reputationReward)
    return { company: { ...state.company, cash: state.company.cash + goal.cashReward, reputation, level: levelForReputation(reputation) }, goals: state.goals.map((item) => item.id === goalId ? { ...item, claimed: true } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('goals', `Goal reward: ${goal.label}`, goal.cashReward)), updatedAt: new Date().toISOString() }
  }),
  toggleExteriorAccessory: (vehicleId, accessory) => set((state) => ({
    vehicles: state.vehicles.map((vehicle) => vehicle.id !== vehicleId ? vehicle : { ...vehicle, exteriorAccessories: (vehicle.exteriorAccessories ?? []).includes(accessory) ? (vehicle.exteriorAccessories ?? []).filter((item) => item !== accessory) : [...(vehicle.exteriorAccessories ?? []), accessory] }),
    updatedAt: new Date().toISOString(),
  })),
  resetGame: () => set({ ...blankSave, activeSection: 'map', hasHydrated: true }),
}), {
  name: 'save:autosave', storage: createJSONStorage(() => indexedDbStorage),
  version: 11,
  merge: (persisted, current) => {
    const saved = persisted as Partial<GameState>
    return { ...current, ...saved, customCities: saved.customCities ?? [], territoryLicenses: saved.territoryLicenses ?? [], countryLicenses: saved.countryLicenses ?? [] }
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

export type { Section }
