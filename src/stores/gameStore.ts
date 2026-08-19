import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getCity } from '../data/cities'
import type { Company, GameSave, Vehicle } from '../models/game'
import { indexedDbStorage } from '../services/saveDatabase'
import { generateJobOffers } from '../services/aiJobService'
import { acceptJobState, completeJobState, MAX_JOB_OFFERS } from '../services/jobEngine'

type Section = 'map' | 'jobs' | 'fleet' | 'travel' | 'company'
interface GameActions { initializeCompany: (cityId: string) => void; setSection: (section: Section) => void; refreshJobs: () => Promise<void>; addRandomJob: () => Promise<void>; acceptJob: (jobId: string) => void; completeJob: (jobId: string) => void; buyTaxi: () => void; resetGame: () => void }
interface GameState extends GameSave { activeSection: Section; hasHydrated: boolean; jobsLoading: boolean; jobsError: string | null; setHasHydrated: (value: boolean) => void }

const blankSave: GameSave = { id: 'autosave', version: 2, updatedAt: new Date(0).toISOString(), company: null, startingCityId: null, vehicles: [], drivers: [], jobs: [], agencies: [], tours: [], passengers: [], jobRequestHistory: [] }

export const useGameStore = create<GameState & GameActions>()(persist((set) => ({
  ...blankSave, activeSection: 'map', hasHydrated: false, jobsLoading: false, jobsError: null,
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
  setSection: (activeSection) => set({ activeSection }),
  initializeCompany: (cityId) => {
    if (!getCity(cityId)) return
    const now = new Date().toISOString()
    const company: Company = { id: crypto.randomUUID(), name: 'Travel Empire', cash: 25_000, reputation: 0, level: 1, homeCityId: cityId, foundedAt: now }
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: 'Compact Taxi 1', type: 'taxi', value: 12_000, condition: 100, fuel: 100, capacity: 4, status: 'available', cityId, position: getCity(cityId)?.coordinates }
    set({ ...blankSave, company, startingCityId: cityId, vehicles: [vehicle], updatedAt: now, activeSection: 'map', hasHydrated: true, jobsLoading: false, jobsError: null })
  },
  refreshJobs: async () => {
    const state = useGameStore.getState()
    if (!state.startingCityId || state.jobsLoading || state.jobs.some((job) => job.status === 'accepted')) return
    const city = getCity(state.startingCityId)
    if (!city) return
    set({ jobsLoading: true, jobsError: null })
    try {
      const generated = await generateJobOffers(city, 4, state.jobRequestHistory ?? [])
      set((latest) => ({ jobs: generated.jobs, passengers: generated.passengers, jobRequestHistory: [...(latest.jobRequestHistory ?? []), ...generated.signatures].slice(-100), updatedAt: new Date().toISOString(), jobsLoading: false }))
    } catch (error) {
      set({ jobsLoading: false, jobsError: error instanceof Error ? error.message : 'Could not generate AI requests.' })
    }
  },
  addRandomJob: async () => {
    const state = useGameStore.getState()
    if (!state.startingCityId || state.jobsLoading || state.jobs.filter((job) => job.status === 'offered').length >= MAX_JOB_OFFERS) return
    const city = getCity(state.startingCityId)
    if (!city) return
    set({ jobsLoading: true, jobsError: null })
    try {
      const generated = await generateJobOffers(city, 1, state.jobRequestHistory ?? [])
      set((latest) => ({ jobs: [...latest.jobs.filter((job) => job.status !== 'complete'), ...generated.jobs], passengers: [...latest.passengers, ...generated.passengers], jobRequestHistory: [...(latest.jobRequestHistory ?? []), ...generated.signatures].slice(-100), updatedAt: new Date().toISOString(), jobsLoading: false }))
    } catch (error) {
      set({ jobsLoading: false, jobsError: error instanceof Error ? error.message : 'Could not generate an AI request.' })
    }
  },
  acceptJob: (jobId) => set((state) => {
    const result = acceptJobState(state.jobs, state.vehicles, jobId)
    return result ? { ...result, updatedAt: new Date().toISOString(), activeSection: 'map' } : state
  }),
  completeJob: (jobId) => set((state) => {
    if (!state.company) return state
    const result = completeJobState(state.company, state.jobs, state.vehicles, jobId)
    return result ? { ...result, updatedAt: new Date().toISOString() } : state
  }),
  buyTaxi: () => set((state) => {
    if (!state.company || !state.startingCityId || state.company.cash < 12_000) return state
    const city = getCity(state.startingCityId)
    if (!city) return state
    const taxi: Vehicle = { id: crypto.randomUUID(), name: `Compact Taxi ${state.vehicles.filter((vehicle) => vehicle.type === 'taxi').length + 1}`, type: 'taxi', value: 12_000, condition: 100, fuel: 100, capacity: 4, status: 'available', cityId: city.id, position: city.coordinates }
    return { company: { ...state.company, cash: state.company.cash - taxi.value }, vehicles: [...state.vehicles, taxi], updatedAt: new Date().toISOString() }
  }),
  resetGame: () => set({ ...blankSave, activeSection: 'map', hasHydrated: true }),
}), {
  name: 'save:autosave', storage: createJSONStorage(() => indexedDbStorage),
  partialize: ({ activeSection, hasHydrated, jobsLoading, jobsError, ...save }) => {
    void activeSection
    void hasHydrated
    void jobsLoading
    void jobsError
    return save
  },
  onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
}))

export type { Section }
