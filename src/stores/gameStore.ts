import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getCity } from '../data/cities'
import { getTaxiModel } from '../data/taxis'
import { getPostVehicleModel } from '../data/postVehicles'
import type { Company, Driver, ExteriorAccessory, GameSave, Vehicle } from '../models/game'
import { indexedDbStorage } from '../services/saveDatabase'
import { levelForReputation, maxJobDistanceForFleet } from '../services/companyProgression'
import { generateJobOffers } from '../services/jobOfferService'
import { acceptJobState, completeArrivedJobsState, completeJobState, getJobJourney, jobOfferExpiresAt, MAX_JOB_OFFERS } from '../services/jobEngine'
import { createDynamicEvent, energyUseForJob, fatigueUseForJob, FINANCE_PERIOD_MS, startRecoveryTrip } from '../services/operationsEngine'
import { createPostalRoute } from '../services/postalEngine'

type Section = 'map' | 'jobs' | 'fleet' | 'travel' | 'company'
interface GameActions { initializeCompany: (cityId: string) => void; setSection: (section: Section) => void; openJob: (jobId: string) => void; showJobOnMap: (jobId: string) => void; refreshJobs: () => Promise<void>; addRandomJob: () => Promise<void>; acceptJob: (jobId: string) => void; declineJob: (jobId: string) => void; completeJob: (jobId: string) => void; tickJobs: () => void; buyTaxi: (modelId: string) => void; leaseTaxi: (modelId: string) => void; buyPostVehicle: (modelId: string) => void; startPostalRoute: (vehicleId: string) => void; takeLoan: (amount: number) => void; sellVehicle: (vehicleId: string) => void; setDriverShift: (driverId: string, shift: Driver['shift']) => void; toggleExteriorAccessory: (vehicleId: string, accessory: ExteriorAccessory) => void; resetGame: () => void }
interface GameState extends GameSave { activeSection: Section; focusedJobId: string | null; hasHydrated: boolean; jobsLoading: boolean; jobsError: string | null; setHasHydrated: (value: boolean) => void }

const blankSave: GameSave = { id: 'autosave', version: 4, updatedAt: new Date(0).toISOString(), company: null, startingCityId: null, vehicles: [], drivers: [], jobs: [], agencies: [], tours: [], passengers: [], jobRequestHistory: [], loans: [], activeEvent: null, nextEventAt: new Date(0).toISOString(), nextOperatingPaymentAt: new Date(0).toISOString() }

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
    const driver: Driver = { id: crypto.randomUUID(), name: 'Alex Morgan', rating: 4.7, salary: 650, status: 'available', fatigue: 0, home, shift: 'day' }
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${starter.brand} ${starter.name} 1`, type: 'taxi', modelId: starter.id, powertrain: starter.powertrain, exteriorAccessories: [], value: starter.price, condition: 100, fuel: 100, capacity: starter.capacity, topSpeedKmh: starter.topSpeedKmh, status: 'available', cityId, position: home, driverId: driver.id, ownership: 'owned' }
    set({ ...blankSave, company, startingCityId: cityId, vehicles: [vehicle], drivers: [driver], activeEvent: createDynamicEvent(), nextEventAt: new Date(Date.now() + 8 * 60_000).toISOString(), nextOperatingPaymentAt: new Date(Date.now() + FINANCE_PERIOD_MS).toISOString(), updatedAt: now, activeSection: 'map', hasHydrated: true, jobsLoading: false, jobsError: null })
  },
  refreshJobs: async () => {
    const state = useGameStore.getState()
    const availableTaxi = state.vehicles.find((vehicle) => vehicle.type === 'taxi' && vehicle.status === 'available')
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
    const availableTaxi = state.vehicles.find((vehicle) => vehicle.type === 'taxi' && vehicle.status === 'available')
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
    const result = acceptJobState(state.jobs, state.vehicles, jobId)
    if (!result) return state
    const assignedVehicleId = result.jobs.find((job) => job.id === jobId)?.assignedVehicleId
    const driverId = result.vehicles.find((vehicle) => vehicle.id === assignedVehicleId)?.driverId
    return { ...result, drivers: state.drivers.map((driver) => driver.id === driverId ? { ...driver, status: 'driving' as const } : driver), updatedAt: new Date().toISOString(), activeSection: 'map' }
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
    const jobs = state.jobs.filter((job) => job.status !== 'offered' || jobOfferExpiresAt(job) > now)
    const result = completeArrivedJobsState(state.company, jobs, state.vehicles, now)
    let company = result?.company ?? state.company
    let vehicles = result?.vehicles ?? state.vehicles
    let drivers = state.drivers
    if (result) {
      for (const jobId of result.completedJobIds) {
        const job = state.jobs.find((candidate) => candidate.id === jobId)!
        const previousVehicle = state.vehicles.find((candidate) => candidate.id === job.assignedVehicleId)!
        const driver = drivers.find((candidate) => candidate.id === previousVehicle.driverId)
        // Base recovery on the actual arrival time. If the app was closed long
        // enough for both journeys to finish, the service trip can settle in
        // this same tick instead of leaving the taxi unavailable after launch.
        const completedAt = getJobJourney(job, previousVehicle).arrivesAt
        vehicles = vehicles.map((vehicle) => vehicle.id !== previousVehicle.id ? vehicle : startRecoveryTrip({ ...vehicle, fuel: Math.max(0, vehicle.fuel - energyUseForJob(job, previousVehicle, state.activeEvent)) }, driver && { ...driver, fatigue: Math.min(100, driver.fatigue + fatigueUseForJob(job)) }, getCity(vehicle.cityId)?.coordinates ?? job.destination, completedAt))
        drivers = drivers.map((candidate) => candidate.id !== driver?.id ? candidate : { ...candidate, fatigue: Math.min(100, candidate.fatigue + fatigueUseForJob(job)), status: vehicles.find((vehicle) => vehicle.driverId === candidate.id)?.status === 'maintenance' ? 'driving' : 'available' })
      }
    }
    vehicles = vehicles.map((vehicle) => {
      if (vehicle.postalRoute && new Date(vehicle.postalRoute.arrivesAt).getTime() <= now) {
        const reputation = company.reputation + 1
        company = { ...company, cash: company.cash + vehicle.postalRoute.reward, reputation, level: levelForReputation(reputation) }
        const plannedHours = vehicle.postalRoute.plannedHours ?? 1
        return { ...vehicle, position: vehicle.postalRoute.stops.at(-1)?.coordinates ?? vehicle.position, status: 'available' as const, postalRoute: undefined, fuel: Math.max(0, vehicle.fuel - plannedHours * 4) }
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
      const vehicle = vehicles.find((candidate) => candidate.driverId === driver.id)
      if (vehicle?.serviceTrip) return driver
      const returningHome = state.vehicles.find((candidate) => candidate.driverId === driver.id)?.serviceTrip?.kind === 'home'
      return { ...driver, fatigue: returningHome ? 0 : driver.fatigue, status: 'available' as const }
    })
    let loans = state.loans ?? []
    for (const loan of loans.filter((item) => new Date(item.nextPaymentAt).getTime() <= now)) company = { ...company, cash: company.cash - Math.min(loan.paymentAmount, loan.balance) }
    loans = loans.map((loan) => new Date(loan.nextPaymentAt).getTime() > now ? loan : { ...loan, balance: Math.max(0, loan.balance - loan.paymentAmount), nextPaymentAt: new Date(now + FINANCE_PERIOD_MS).toISOString() }).filter((loan) => loan.balance > 0)
    const operatingPaymentDue = new Date(state.nextOperatingPaymentAt ?? 0).getTime() <= now
    if (operatingPaymentDue) company = { ...company, cash: company.cash - vehicles.reduce((sum, vehicle) => sum + (vehicle.leaseWeeklyCost ?? 0), 0) - drivers.reduce((sum, driver) => sum + driver.salary, 0) }
    const nextOperatingPaymentAt = operatingPaymentDue ? new Date(now + FINANCE_PERIOD_MS).toISOString() : state.nextOperatingPaymentAt
    const activeEvent = state.activeEvent && new Date(state.activeEvent.expiresAt).getTime() > now ? state.activeEvent : (new Date(state.nextEventAt ?? 0).getTime() <= now ? createDynamicEvent(now) : null)
    const nextEventAt = activeEvent && activeEvent.id !== state.activeEvent?.id ? new Date(now + 13 * 60_000).toISOString() : state.nextEventAt
    return { company, jobs: result?.jobs ?? jobs, vehicles, drivers, loans, activeEvent, nextEventAt, nextOperatingPaymentAt, focusedJobId: result ? null : (jobs.some((job) => job.id === state.focusedJobId) ? state.focusedJobId : null), updatedAt: new Date().toISOString() }
  }),
  buyTaxi: (modelId) => set((state) => {
    const model = getTaxiModel(modelId)
    if (!state.company || !state.startingCityId || state.company.cash < model.price) return state
    const city = getCity(state.startingCityId)
    if (!city) return state
    const modelNumber = state.vehicles.filter((vehicle) => vehicle.modelId === model.id).length + 1
    const driver: Driver = { id: crypto.randomUUID(), name: `Driver ${state.drivers.length + 1}`, rating: 4.5, salary: 650, status: 'available', fatigue: 0, home: city.coordinates, shift: 'day' }
    const taxi: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} ${modelNumber}`, type: 'taxi', modelId: model.id, powertrain: model.powertrain, exteriorAccessories: [], value: model.price, condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'owned', driverId: driver.id }
    return { company: { ...state.company, cash: state.company.cash - taxi.value }, vehicles: [...state.vehicles, taxi], drivers: [...state.drivers, driver], updatedAt: new Date().toISOString() }
  }),
  leaseTaxi: (modelId) => set((state) => {
    const model = getTaxiModel(modelId); const city = getCity(state.startingCityId)
    if (!state.company || !city || state.company.cash < Math.round(model.price * 0.1)) return state
    const driver: Driver = { id: crypto.randomUUID(), name: `Driver ${state.drivers.length + 1}`, rating: 4.5, salary: 650, status: 'available', fatigue: 0, home: city.coordinates, shift: 'day' }
    const taxi: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} Lease`, type: 'taxi', modelId, powertrain: model.powertrain, exteriorAccessories: [], value: model.price, condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'leased', leaseWeeklyCost: Math.round(model.price * 0.025), driverId: driver.id }
    return { company: { ...state.company, cash: state.company.cash - Math.round(model.price * 0.1) }, vehicles: [...state.vehicles, taxi], drivers: [...state.drivers, driver], updatedAt: new Date().toISOString() }
  }),
  buyPostVehicle: (modelId) => set((state) => {
    const model = getPostVehicleModel(modelId); const city = getCity(state.startingCityId)
    if (!state.company || !city || state.company.cash < model.price) return state
    const driver: Driver = { id: crypto.randomUUID(), name: `Post driver ${state.drivers.length + 1}`, rating: 4.5, salary: 650, status: 'available', fatigue: 0, home: city.coordinates, shift: 'day' }
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name}`, type: 'post', modelId: model.id, powertrain: model.powertrain, value: model.price, condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates, ownership: 'owned', driverId: driver.id }
    return { company: { ...state.company, cash: state.company.cash - model.price }, vehicles: [...state.vehicles, vehicle], drivers: [...state.drivers, driver], updatedAt: new Date().toISOString() }
  }),
  startPostalRoute: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId && candidate.type === 'post' && candidate.status === 'available')
    const city = getCity(vehicle?.cityId ?? null)
    if (!vehicle || !city) return state
    const postalRoute = createPostalRoute(vehicle, city.coordinates)
    return { vehicles: state.vehicles.map((candidate) => candidate.id === vehicleId ? { ...candidate, status: 'on-job' as const, postalRoute } : candidate), drivers: state.drivers.map((driver) => driver.id === vehicle.driverId ? { ...driver, status: 'driving' as const } : driver), updatedAt: new Date().toISOString(), activeSection: 'map' }
  }),
  takeLoan: (amount) => set((state) => !state.company || amount <= 0 ? state : ({ company: { ...state.company, cash: state.company.cash + amount }, loans: [...(state.loans ?? []), { id: crypto.randomUUID(), principal: amount, balance: Math.round(amount * 1.12), paymentAmount: Math.round(amount * 0.112), nextPaymentAt: new Date(Date.now() + FINANCE_PERIOD_MS).toISOString() }], updatedAt: new Date().toISOString() })),
  sellVehicle: (vehicleId) => set((state) => {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId)
    if (!state.company || !vehicle || vehicle.status !== 'available' || state.vehicles.length <= 1) return state
    const proceeds = vehicle.ownership === 'leased' ? 0 : Math.round(vehicle.value * 0.65 * vehicle.condition / 100)
    return { company: { ...state.company, cash: state.company.cash + proceeds }, vehicles: state.vehicles.filter((candidate) => candidate.id !== vehicleId), drivers: state.drivers.filter((driver) => driver.id !== vehicle.driverId), updatedAt: new Date().toISOString() }
  }),
  setDriverShift: (driverId, shift) => set((state) => ({ drivers: state.drivers.map((driver) => driver.id === driverId ? { ...driver, shift } : driver), updatedAt: new Date().toISOString() })),
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
