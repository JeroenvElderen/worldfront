import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getCity } from '../data/cities'
import { getTaxiModel } from '../data/taxis'
import type { Company, ExteriorAccessory, GameSave, Vehicle } from '../models/game'
import { indexedDbStorage } from '../services/saveDatabase'
import { levelForReputation, maxJobDistanceForLevel } from '../services/companyProgression'
import { generateJobOffers } from '../services/jobOfferService'
import { acceptJobState, completeArrivedJobsState, completeJobState, MAX_JOB_OFFERS } from '../services/jobEngine'

type Section = 'map' | 'fleet' | 'travel' | 'company'
interface GameActions { initializeCompany: (cityId: string) => void; setSection: (section: Section) => void; openJob: (jobId: string) => void; refreshJobs: () => Promise<void>; addRandomJob: () => Promise<void>; acceptJob: (jobId: string) => void; declineJob: (jobId: string) => void; completeJob: (jobId: string) => void; tickJobs: () => void; buyTaxi: (modelId: string) => void; toggleExteriorAccessory: (vehicleId: string, accessory: ExteriorAccessory) => void; resetGame: () => void }
interface GameState extends GameSave { activeSection: Section; focusedJobId: string | null; hasHydrated: boolean; jobsLoading: boolean; jobsError: string | null; setHasHydrated: (value: boolean) => void }

const blankSave: GameSave = { id: 'autosave', version: 2, updatedAt: new Date(0).toISOString(), company: null, startingCityId: null, vehicles: [], drivers: [], jobs: [], agencies: [], tours: [], passengers: [], jobRequestHistory: [] }

export const useGameStore = create<GameState & GameActions>()(persist((set) => ({
  ...blankSave, activeSection: 'map', focusedJobId: null, hasHydrated: false, jobsLoading: false, jobsError: null,
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
  setSection: (activeSection) => set({ activeSection }),
  openJob: (focusedJobId) => set({ focusedJobId, activeSection: 'map' }),
  initializeCompany: (cityId) => {
    if (!getCity(cityId)) return
    const now = new Date().toISOString()
    const company: Company = { id: crypto.randomUUID(), name: 'Travel Empire', cash: 25_000, reputation: 0, level: 1, homeCityId: cityId, foundedAt: now }
    const starter = getTaxiModel('toyota-corolla')
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: `${starter.brand} ${starter.name} 1`, type: 'taxi', modelId: starter.id, powertrain: starter.powertrain, exteriorAccessories: [], value: starter.price, condition: 100, fuel: 100, capacity: starter.capacity, topSpeedKmh: starter.topSpeedKmh, status: 'available', cityId, position: getCity(cityId)?.coordinates }
    set({ ...blankSave, company, startingCityId: cityId, vehicles: [vehicle], updatedAt: now, activeSection: 'map', hasHydrated: true, jobsLoading: false, jobsError: null })
  },
  refreshJobs: async () => {
    const state = useGameStore.getState()
    const availableTaxi = state.vehicles.find((vehicle) => vehicle.status === 'available')
    if (!state.startingCityId || state.jobsLoading || !availableTaxi) return
    const city = getCity(state.startingCityId)
    if (!city) return
    set({ jobsLoading: true, jobsError: null })
    try {
      const level = levelForReputation(state.company?.reputation ?? 0)
      const searchArea = availableTaxi.position ? { ...city, coordinates: availableTaxi.position } : city
      const taxiPositions = state.vehicles.filter((vehicle) => vehicle.status === 'available').map((vehicle) => vehicle.position ?? city.coordinates)
      const generated = await generateJobOffers(searchArea, 1, state.jobRequestHistory ?? [], maxJobDistanceForLevel(level), undefined, taxiPositions)
      set((latest) => ({ jobs: [...latest.jobs.filter((job) => job.status !== 'complete'), ...generated.jobs], passengers: [...latest.passengers, ...generated.passengers], jobRequestHistory: [...(latest.jobRequestHistory ?? []), ...generated.signatures].slice(-100), updatedAt: new Date().toISOString(), jobsLoading: false }))
    } catch (error) {
      set({ jobsLoading: false, jobsError: error instanceof Error ? error.message : 'Could not generate requests.' })
    }
  },
  addRandomJob: async () => {
    const state = useGameStore.getState()
    const availableTaxi = state.vehicles.find((vehicle) => vehicle.status === 'available')
    if (!state.startingCityId || state.jobsLoading || !availableTaxi || state.jobs.filter((job) => job.status === 'offered').length >= MAX_JOB_OFFERS) return
    const city = getCity(state.startingCityId)
    if (!city) return
    set({ jobsLoading: true, jobsError: null })
    try {
      const level = levelForReputation(state.company?.reputation ?? 0)
      const searchArea = availableTaxi.position ? { ...city, coordinates: availableTaxi.position } : city
      const taxiPositions = state.vehicles.filter((vehicle) => vehicle.status === 'available').map((vehicle) => vehicle.position ?? city.coordinates)
      const generated = await generateJobOffers(searchArea, 1, state.jobRequestHistory ?? [], maxJobDistanceForLevel(level), undefined, taxiPositions)
      set((latest) => ({ jobs: [...latest.jobs.filter((job) => job.status !== 'complete'), ...generated.jobs], passengers: [...latest.passengers, ...generated.passengers], jobRequestHistory: [...(latest.jobRequestHistory ?? []), ...generated.signatures].slice(-100), updatedAt: new Date().toISOString(), jobsLoading: false }))
    } catch (error) {
      set({ jobsLoading: false, jobsError: error instanceof Error ? error.message : 'Could not generate a request.' })
    }
  },
  acceptJob: (jobId) => set((state) => {
    const result = acceptJobState(state.jobs, state.vehicles, jobId)
    return result ? { ...result, updatedAt: new Date().toISOString(), activeSection: 'map' } : state
  }),
  declineJob: (jobId) => set((state) => ({ jobs: state.jobs.filter((job) => job.id !== jobId), focusedJobId: state.focusedJobId === jobId ? null : state.focusedJobId, updatedAt: new Date().toISOString() })),
  completeJob: (jobId) => set((state) => {
    if (!state.company) return state
    const result = completeJobState(state.company, state.jobs, state.vehicles, jobId)
    return result ? { ...result, updatedAt: new Date().toISOString() } : state
  }),
  tickJobs: () => set((state) => {
    if (!state.company || !state.jobs.some((job) => job.status === 'accepted')) return state
    const result = completeArrivedJobsState(state.company, state.jobs, state.vehicles)
    return result ? { company: result.company, jobs: result.jobs, vehicles: result.vehicles, focusedJobId: null, updatedAt: new Date().toISOString() } : state
  }),
  buyTaxi: (modelId) => set((state) => {
    const model = getTaxiModel(modelId)
    if (!state.company || !state.startingCityId || state.company.cash < model.price) return state
    const city = getCity(state.startingCityId)
    if (!city) return state
    const modelNumber = state.vehicles.filter((vehicle) => vehicle.modelId === model.id).length + 1
    const taxi: Vehicle = { id: crypto.randomUUID(), name: `${model.brand} ${model.name} ${modelNumber}`, type: 'taxi', modelId: model.id, powertrain: model.powertrain, exteriorAccessories: [], value: model.price, condition: 100, fuel: 100, capacity: model.capacity, topSpeedKmh: model.topSpeedKmh, status: 'available', cityId: city.id, position: city.coordinates }
    return { company: { ...state.company, cash: state.company.cash - taxi.value }, vehicles: [...state.vehicles, taxi], updatedAt: new Date().toISOString() }
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
