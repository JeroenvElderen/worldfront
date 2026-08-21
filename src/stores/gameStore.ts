import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getCity } from '../data/cities'
import { getTaxiModel } from '../data/taxis'
import { getPostVehicleModel } from '../data/postVehicles'
import type { Company, Driver, ExteriorAccessory, FinancialTransaction, GameSave, RefuelStrategy, TransactionCategory, Vehicle, VehicleUpgrade } from '../models/game'
import { indexedDbStorage } from '../services/saveDatabase'
import { levelForReputation, maxJobDistanceForFleet } from '../services/companyProgression'
import { generateJobOffers } from '../services/jobOfferService'
import { acceptJobState, completeArrivedJobsState, completeJobState, distanceKmBetween, getJobJourney, jobOfferExpiresAt, MAX_JOB_OFFERS } from '../services/jobEngine'
import { createDynamicEvent, energyUseForJob, fatigueUseForJob, startRecoveryTrip } from '../services/operationsEngine'
import { nextMonthlyPaymentAt } from '../services/gameTime'
import { createPostalRoute } from '../services/postalEngine'
import { createRentalJourney } from '../services/rentalEngine'
import { maintenanceCost, vehicleMarketValue } from '../services/vehicleEconomics'
import { calculateJobOutcome, createDriverCandidates, createGoals, pickupSpeedMultiplier, updateGoals, upgradeDetails, vehicleCanTakeJob } from '../services/earlyGameEngine'

type Section = 'map' | 'jobs' | 'fleet' | 'finance' | 'travel' | 'company'
interface GameActions { initializeCompany: (cityId: string) => void; pauseGame: () => void; resumeGame: () => void; setSection: (section: Section) => void; openJob: (jobId: string) => void; showJobOnMap: (jobId: string) => void; refreshJobs: () => Promise<void>; addRandomJob: () => Promise<void>; acceptJob: (jobId: string) => void; declineJob: (jobId: string) => void; completeJob: (jobId: string) => void; tickJobs: () => void; buyTaxi: (modelId: string) => void; leaseTaxi: (modelId: string) => void; buyPostVehicle: (modelId: string) => void; startPostalRoute: (vehicleId: string) => void; buyRentalCar: (modelId: string) => void; startRental: (vehicleId: string) => void; takeLoan: (amount: number) => void; sellVehicle: (vehicleId: string) => void; setDriverShift: (driverId: string, shift: Driver['shift']) => void; hireDriver: (candidateId: string, vehicleId: string) => void; refreshDriverCandidates: () => void; serviceVehicle: (vehicleId: string, service: 'quick' | 'full' | 'preventative') => void; installUpgrade: (vehicleId: string, upgrade: VehicleUpgrade) => void; setRefuelStrategy: (vehicleId: string, strategy: RefuelStrategy) => void; refuelVehicle: (vehicleId: string) => void; claimGoal: (goalId: string) => void; toggleExteriorAccessory: (vehicleId: string, accessory: ExteriorAccessory) => void; resetGame: () => void }
interface GameState extends GameSave { activeSection: Section; focusedJobId: string | null; hasHydrated: boolean; jobsLoading: boolean; jobsError: string | null; setHasHydrated: (value: boolean) => void }

const blankSave: GameSave = { id: 'autosave', version: 7, updatedAt: new Date(0).toISOString(), pausedAt: null, company: null, startingCityId: null, vehicles: [], drivers: [], driverCandidates: [], jobs: [], agencies: [], tours: [], passengers: [], goals: [], jobRequestHistory: [], loans: [], financialTransactions: [], activeEvent: null, nextEventAt: new Date(0).toISOString(), nextOperatingPaymentAt: new Date(0).toISOString() }


const transaction = (category: TransactionCategory, description: string, amount: number, vehicleId?: string, occurredAt = new Date().toISOString()): FinancialTransaction => ({
  id: crypto.randomUUID(), occurredAt, category, description, amount, vehicleId,
})
const addTransactions = (existing: FinancialTransaction[] | undefined, ...entries: FinancialTransaction[]) =>
  [...(existing ?? []), ...entries].slice(-500)
const newVehicleLifecycle = (price: number, purchasedAt = new Date().toISOString()) => ({
  purchasePrice: price, purchasedAt, odometerKm: 0, lifetimeRevenue: 0, lifetimeExpenses: 0, batteryHealth: 100, lastServiceAtKm: 0,
})
export const useGameStore = create<GameState & GameActions>()(persist((set) => ({
  ...blankSave, activeSection: 'map', focusedJobId: null, hasHydrated: false, jobsLoading: false, jobsError: null,
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
  setSection: (activeSection) => set({ activeSection }),
  openJob: (focusedJobId) => set({ focusedJobId, activeSection: 'jobs' }),
  showJobOnMap: (focusedJobId) => set({ focusedJobId, activeSection: 'map' }),
  initializeCompany: (cityId) => {
    if (!getCity(cityId)) return
    const now = new Date().toISOString()
    const company: Company = { id: crypto.randomUUID(), name: 'Travel Empire', cash: 25_000, reputation: 0, level: 1, homeCityId: cityId, foundedAt: now }
    const starter = getTaxiModel('toyota-corolla')
    const home = getCity(cityId)!.coordinates
    const driver: Driver = { id: crypto.randomUUID(), name: 'Alex Morgan', rating: 4.7, salary: 650, status: 'available', fatigue: 0, home, shift: 'day', trait: 'careful' }
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${starter.brand} ${starter.name} 1`, type: 'taxi', modelId: starter.id, powertrain: starter.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: starter.price, ...newVehicleLifecycle(starter.price, now), condition: 100, fuel: 100, capacity: starter.capacity, topSpeedKmh: starter.topSpeedKmh, status: 'available', cityId, position: home, driverId: driver.id, ownership: 'owned' }
    set({ ...blankSave, company, startingCityId: cityId, vehicles: [vehicle], drivers: [driver], driverCandidates: createDriverCandidates(home), goals: createGoals(), financialTransactions: [transaction('loans', 'Founder capital', 25_000, undefined, now)], activeEvent: createDynamicEvent(), nextEventAt: new Date(Date.now() + 8 * 60_000).toISOString(), nextOperatingPaymentAt: nextMonthlyPaymentAt(now), updatedAt: now, activeSection: 'map', hasHydrated: true, jobsLoading: false, jobsError: null })
  },
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
    if (!state.startingCityId || state.jobsLoading || !availableTaxi) return
    const city = getCity(state.startingCityId)
    if (!city) return
    set({ jobsLoading: true, jobsError: null })
    try {
      const level = levelForReputation(state.company?.reputation ?? 0)
      const searchArea = availableTaxi.position ? { ...city, coordinates: availableTaxi.position } : city
      const taxis = state.vehicles.filter((vehicle) => vehicle.type === 'taxi')
      const taxiPositions = taxis.filter((vehicle) => vehicle.status === 'available').map((vehicle) => vehicle.position ?? city.coordinates)
      const maxDistanceKm = maxJobDistanceForFleet(level, taxis.length)
      const generated = await generateJobOffers(searchArea, 1, state.jobRequestHistory ?? [], maxDistanceKm, undefined, taxiPositions, state.activeEvent?.fareMultiplier ?? 1)
      set((latest) => ({ jobs: [...latest.jobs.filter((job) => job.status !== 'complete'), ...generated.jobs], passengers: [...latest.passengers, ...generated.passengers], jobRequestHistory: [...(latest.jobRequestHistory ?? []), ...generated.signatures].slice(-100), updatedAt: new Date().toISOString(), jobsLoading: false }))
    } catch (error) {
      set({ jobsLoading: false, jobsError: error instanceof Error ? error.message : 'Could not generate requests.' })
    }
  },
  addRandomJob: async () => {
    const state = useGameStore.getState()
    const availableTaxi = state.vehicles.find((vehicle) => vehicle.type === 'taxi' && vehicle.status === 'available' && vehicle.driverId)
    if (!state.startingCityId || state.jobsLoading || !availableTaxi || state.jobs.filter((job) => job.status === 'offered').length >= MAX_JOB_OFFERS) return
    const city = getCity(state.startingCityId)
    if (!city) return
    set({ jobsLoading: true, jobsError: null })
    try {
      const level = levelForReputation(state.company?.reputation ?? 0)
      const searchArea = availableTaxi.position ? { ...city, coordinates: availableTaxi.position } : city
      const taxis = state.vehicles.filter((vehicle) => vehicle.type === 'taxi')
      const taxiPositions = taxis.filter((vehicle) => vehicle.status === 'available').map((vehicle) => vehicle.position ?? city.coordinates)
      const maxDistanceKm = maxJobDistanceForFleet(level, taxis.length)
      const generated = await generateJobOffers(searchArea, 1, state.jobRequestHistory ?? [], maxDistanceKm, undefined, taxiPositions, state.activeEvent?.fareMultiplier ?? 1)
      set((latest) => ({ jobs: [...latest.jobs.filter((job) => job.status !== 'complete'), ...generated.jobs], passengers: [...latest.passengers, ...generated.passengers], jobRequestHistory: [...(latest.jobRequestHistory ?? []), ...generated.signatures].slice(-100), updatedAt: new Date().toISOString(), jobsLoading: false }))
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
    return { ...result, jobs: result.jobs.map((job) => job.id === jobId ? { ...job, pickupTimeMultiplier: pickupSpeedMultiplier(driver), durationMinutes: driver?.trait === 'careful' ? job.durationMinutes * 1.05 : job.durationMinutes, fare: (result.vehicles.find((vehicle) => vehicle.id === assignedVehicleId)?.upgrades ?? []).includes('meter-pro') ? Math.round(job.fare * 1.08 * 100) / 100 : job.fare } : job), drivers: state.drivers.map((candidate) => candidate.id === driverId ? { ...candidate, status: 'driving' as const } : candidate), updatedAt: new Date().toISOString(), activeSection: 'map' }
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
      if (vehicle.postalRoute || vehicle.rentalJourney || activeVehicleIds.has(vehicle.id)) return { ...vehicle, status: 'on-job' as const }
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
        const emptyDistanceKm = previousVehicle.position ? distanceKmBetween(previousVehicle.position, job.pickup) : 0
        const journeyDistanceKm = emptyDistanceKm + job.distanceKm
        company = { ...company, cash: company.cash + outcome.tip, reputation: company.reputation - 1 + outcome.reputationEarned, level: levelForReputation(company.reputation - 1 + outcome.reputationEarned) }
        financialTransactions = addTransactions(
          financialTransactions,
          transaction('fares', `${previousVehicle.name} fare`, job.fare, previousVehicle.id, new Date(completedAt).toISOString()),
          ...(outcome.tip > 0 ? [transaction('tips', `${previousVehicle.name} tip`, outcome.tip, previousVehicle.id, new Date(completedAt).toISOString())] : []),
        )
        result.jobs = result.jobs.map((candidate) => candidate.id === jobId ? { ...candidate, satisfaction: outcome.satisfaction, tip: outcome.tip, reputationEarned: outcome.reputationEarned } : candidate)
        const batteryWear = previousVehicle.powertrain === 'electric' ? journeyDistanceKm / 30_000 : 0
        const depleted = { ...previousVehicle, position: job.destination, status: 'available' as const, odometerKm: (previousVehicle.odometerKm ?? 0) + journeyDistanceKm, lifetimeRevenue: (previousVehicle.lifetimeRevenue ?? 0) + job.fare + outcome.tip, batteryHealth: Math.max(60, (previousVehicle.batteryHealth ?? 100) - batteryWear), condition: Math.max(0, previousVehicle.condition - outcome.wear), fuel: Math.max(0, previousVehicle.fuel - energyUseForJob(job, previousVehicle, state.activeEvent, driver)) }
        const tiredDriver = driver && { ...driver, fatigue: Math.min(100, driver.fatigue + fatigueUseForJob(job)) }
        const needsAutomaticRecovery = previousVehicle.refuelStrategy === 'automatic' || (tiredDriver?.fatigue ?? 0) >= 80
        vehicles = vehicles.map((vehicle) => vehicle.id !== previousVehicle.id ? vehicle : needsAutomaticRecovery ? startRecoveryTrip(depleted, tiredDriver, getCity(vehicle.cityId)?.coordinates ?? job.destination, completedAt) : depleted)
        drivers = drivers.map((candidate) => candidate.id !== driver?.id ? candidate : { ...candidate, fatigue: Math.min(100, candidate.fatigue + fatigueUseForJob(job)), status: vehicles.find((vehicle) => vehicle.driverId === candidate.id)?.status === 'maintenance' ? 'driving' : 'available' })
        let goals = updateGoals(state.goals ?? [], 'fares', 1)
        goals = updateGoals(goals, 'earnings', job.fare + outcome.tip)
        if (depleted.fuel > 20) goals = updateGoals(goals, 'safe-jobs', 1)
        if (job.category === 'airport') goals = updateGoals(goals, 'airport-jobs', 1)
        state = { ...state, goals }
      }
    }
    vehicles = vehicles.map((vehicle) => {
      if (vehicle.rentalJourney && new Date(vehicle.rentalJourney.arrivesAt).getTime() <= now) {
        const { reward, distanceKm, arrivesAt, waypoints } = vehicle.rentalJourney
        company = { ...company, cash: company.cash + reward }
        financialTransactions = addTransactions(financialTransactions, transaction('rentals', `${vehicle.name} rental`, reward, vehicle.id, arrivesAt))
        return { ...vehicle, position: waypoints.at(-1) ?? vehicle.position, status: 'available' as const, rentalJourney: undefined, odometerKm: (vehicle.odometerKm ?? 0) + distanceKm, lifetimeRevenue: (vehicle.lifetimeRevenue ?? 0) + reward, batteryHealth: vehicle.powertrain === 'electric' ? Math.max(60, (vehicle.batteryHealth ?? 100) - distanceKm / 30_000) : vehicle.batteryHealth, fuel: Math.max(0, vehicle.fuel - distanceKm / 5), condition: Math.max(0, vehicle.condition - distanceKm / 250) }
      }
      if (vehicle.postalRoute && new Date(vehicle.postalRoute.arrivesAt).getTime() <= now) {
        const reputation = company.reputation + 1
        company = { ...company, cash: company.cash + vehicle.postalRoute.reward, reputation, level: levelForReputation(reputation) }
        const plannedHours = vehicle.postalRoute.plannedHours ?? 1
        state = { ...state, goals: updateGoals(state.goals ?? [], 'postal-rounds', 1) }
        const postalBonus = (vehicle.upgrades ?? []).includes('parcel-shelving') ? vehicle.postalRoute.reward * .15 : 0
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
        ? startRecoveryTrip(arrived, driver, getCity(vehicle.cityId)?.coordinates ?? arrived.position, now)
        : arrived
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
      const payrollCost = drivers.reduce((sum, driver) => sum + driver.salary, 0)
      company = { ...company, cash: company.cash - leaseCost - payrollCost }
      if (leaseCost) financialTransactions = addTransactions(financialTransactions, transaction('leases', 'Fleet lease payments', -leaseCost))
      if (payrollCost) financialTransactions = addTransactions(financialTransactions, transaction('payroll', 'Driver payroll', -payrollCost))
      vehicles = vehicles.map((vehicle) => vehicle.ownership === 'leased' ? { ...vehicle, lifetimeExpenses: (vehicle.lifetimeExpenses ?? 0) + (vehicle.leaseMonthlyCost ?? vehicle.leaseWeeklyCost ?? 0) } : vehicle)
    }
    const nextOperatingPaymentAt = operatingPaymentDue ? nextMonthlyPaymentAt(company.foundedAt, now) : state.nextOperatingPaymentAt
    const activeEvent = state.activeEvent && new Date(state.activeEvent.expiresAt).getTime() > now ? state.activeEvent : (new Date(state.nextEventAt ?? 0).getTime() <= now ? createDynamicEvent(now) : null)
    const nextEventAt = activeEvent && activeEvent.id !== state.activeEvent?.id ? new Date(now + 13 * 60_000).toISOString() : state.nextEventAt
    const goals = (state.goals?.length && state.goals.some((goal) => new Date(goal.expiresAt).getTime() > now)) ? state.goals : createGoals(now)
    const driverCandidates = (state.driverCandidates?.length && state.driverCandidates.some((candidate) => new Date(candidate.expiresAt).getTime() > now)) ? state.driverCandidates : createDriverCandidates(getCity(state.startingCityId)?.coordinates ?? [0, 0], now)
    return { company, jobs: result?.jobs ?? jobs, vehicles, drivers, goals, driverCandidates, loans, financialTransactions, activeEvent, nextEventAt, nextOperatingPaymentAt, focusedJobId: result ? null : (jobs.some((job) => job.id === state.focusedJobId) ? state.focusedJobId : null), updatedAt: new Date().toISOString() }
  }),
  buyTaxi: (modelId) => set((state) => {
    const model = getTaxiModel(modelId)
    if (!state.company || !state.startingCityId || state.company.cash < model.price) return state
    const city = getCity(state.startingCityId)
    if (!city) return state
    const modelNumber = state.vehicles.filter((vehicle) => vehicle.modelId === model.id).length + 1
    const taxi: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} ${modelNumber}`, type: 'taxi', modelId: model.id, powertrain: model.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: model.price, ...newVehicleLifecycle(model.price), condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'owned' }
    return { company: { ...state.company, cash: state.company.cash - taxi.value }, vehicles: [...state.vehicles, taxi], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Purchased ${taxi.name}`, -taxi.value, taxi.id)), updatedAt: new Date().toISOString() }
  }),
  leaseTaxi: (modelId) => set((state) => {
    const model = getTaxiModel(modelId); const city = getCity(state.startingCityId)
    if (!state.company || !city || state.company.cash < Math.round(model.price * 0.1)) return state
    const taxi: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} Lease`, type: 'taxi', modelId, powertrain: model.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: model.price, ...newVehicleLifecycle(model.price), condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'leased', leaseMonthlyCost: Math.round(model.price * 0.025) }
    const deposit = Math.round(model.price * 0.1)
    return { company: { ...state.company, cash: state.company.cash - deposit }, vehicles: [...state.vehicles, taxi], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Lease deposit: ${taxi.name}`, -deposit, taxi.id)), updatedAt: new Date().toISOString() }
  }),
  buyPostVehicle: (modelId) => set((state) => {
    const model = getPostVehicleModel(modelId); const city = getCity(state.startingCityId)
    if (!state.company || !city || state.company.cash < model.price) return state
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name}`, type: 'post', modelId: model.id, powertrain: model.powertrain, upgrades: [], refuelStrategy: 'automatic', value: model.price, ...newVehicleLifecycle(model.price), condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'owned' }
    return { company: { ...state.company, cash: state.company.cash - model.price }, vehicles: [...state.vehicles, vehicle], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Purchased ${vehicle.name}`, -model.price, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  startPostalRoute: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId && candidate.type === 'post' && candidate.status === 'available' && candidate.driverId)
    const city = getCity(vehicle?.cityId ?? null)
    if (!vehicle || !city) return state
    const postalRoute = createPostalRoute(vehicle, city.coordinates)
    return { vehicles: state.vehicles.map((candidate) => candidate.id === vehicleId ? { ...candidate, status: 'on-job' as const, postalRoute } : candidate), drivers: state.drivers.map((driver) => driver.id === vehicle.driverId ? { ...driver, status: 'driving' as const } : driver), updatedAt: new Date().toISOString(), activeSection: 'map' }
  }),
  buyRentalCar: (modelId) => set((state) => {
    const model = getTaxiModel(modelId); const city = getCity(state.startingCityId)
    if (!state.company || !city || state.company.cash < model.price) return state
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} Rental`, type: 'rental', modelId: model.id, powertrain: model.powertrain, exteriorAccessories: [], upgrades: [], refuelStrategy: 'automatic', value: model.price, ...newVehicleLifecycle(model.price), condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'owned' }
    return { company: { ...state.company, cash: state.company.cash - model.price }, vehicles: [...state.vehicles, vehicle], financialTransactions: addTransactions(state.financialTransactions, transaction('vehicles', `Purchased rental car: ${vehicle.name}`, -model.price, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  startRental: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId && candidate.type === 'rental' && candidate.status === 'available' && candidate.fuel >= 20 && candidate.condition >= 30)
    const city = getCity(vehicle?.cityId ?? null)
    if (!vehicle || !city) return state
    const rentalJourney = createRentalJourney(vehicle, city.coordinates)
    return { vehicles: state.vehicles.map((candidate) => candidate.id === vehicleId ? { ...candidate, status: 'on-job' as const, rentalJourney } : candidate), updatedAt: new Date().toISOString(), activeSection: 'map' }
  }),
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
  refreshDriverCandidates: () => set((state) => ({ driverCandidates: createDriverCandidates(getCity(state.startingCityId)?.coordinates ?? [0, 0]), updatedAt: new Date().toISOString() })),
  serviceVehicle: (vehicleId, service) => set((state) => {
    const vehicle = state.vehicles.find((item) => item.id === vehicleId && item.status === 'available')
    const plans = { quick: { cost: 350, condition: 15 }, full: { cost: 1_200, condition: 45 }, preventative: { cost: 2_400, condition: 100 } }
    const plan = plans[service]
    const cost = vehicle ? maintenanceCost(vehicle, plan.cost) : plan.cost
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
    const cost = vehicle ? Math.round((100 - vehicle.fuel) * rate) : 0
    if (!state.company || !vehicle || state.company.cash < cost || vehicle.fuel >= 100) return state
    return { company: { ...state.company, cash: state.company.cash - cost }, vehicles: state.vehicles.map((item) => item.id === vehicleId ? { ...item, fuel: 100, lifetimeExpenses: (item.lifetimeExpenses ?? 0) + cost } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('energy', `${vehicle.name} refuel / charge`, -cost, vehicle.id)), updatedAt: new Date().toISOString() }
  }),
  claimGoal: (goalId) => set((state) => {
    const goal = state.goals.find((item) => item.id === goalId && item.completed && !item.claimed)
    if (!state.company || !goal) return state
    const reputation = state.company.reputation + goal.reputationReward
    return { company: { ...state.company, cash: state.company.cash + goal.cashReward, reputation, level: levelForReputation(reputation) }, goals: state.goals.map((item) => item.id === goalId ? { ...item, claimed: true } : item), financialTransactions: addTransactions(state.financialTransactions, transaction('goals', `Goal reward: ${goal.label}`, goal.cashReward)), updatedAt: new Date().toISOString() }
  }),
  toggleExteriorAccessory: (vehicleId, accessory) => set((state) => ({
    vehicles: state.vehicles.map((vehicle) => vehicle.id !== vehicleId ? vehicle : { ...vehicle, exteriorAccessories: (vehicle.exteriorAccessories ?? []).includes(accessory) ? (vehicle.exteriorAccessories ?? []).filter((item) => item !== accessory) : [...(vehicle.exteriorAccessories ?? []), accessory] }),
    updatedAt: new Date().toISOString(),
  })),
  resetGame: () => set({ ...blankSave, activeSection: 'map', hasHydrated: true }),
}), {
  name: 'save:autosave', storage: createJSONStorage(() => indexedDbStorage),
  partialize: ({ activeSection, focusedJobId, hasHydrated, jobsLoading, jobsError, ...save }) => {
    void activeSection
    void focusedJobId
    void hasHydrated
    void jobsLoading
    void jobsError
    return save
  },
  onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
}))

export type { Section }
