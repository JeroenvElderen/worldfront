import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getCity } from '../data/cities'
import type { Company, GameSave, Vehicle } from '../models/game'
import { indexedDbStorage } from '../services/saveDatabase'
import { acceptJobState, completeJobState, createJobOffers } from '../services/jobEngine'

type Section = 'map' | 'jobs' | 'fleet' | 'travel' | 'company'
interface GameActions { initializeCompany: (cityId: string) => void; setSection: (section: Section) => void; refreshJobs: () => void; acceptJob: (jobId: string) => void; completeJob: (jobId: string) => void; resetGame: () => void }
interface GameState extends GameSave { activeSection: Section; hasHydrated: boolean; setHasHydrated: (value: boolean) => void }

const blankSave: GameSave = { id: 'autosave', version: 1, updatedAt: new Date(0).toISOString(), company: null, startingCityId: null, vehicles: [], drivers: [], jobs: [], agencies: [], tours: [], passengers: [] }

export const useGameStore = create<GameState & GameActions>()(persist((set) => ({
  ...blankSave, activeSection: 'map', hasHydrated: false,
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
  setSection: (activeSection) => set({ activeSection }),
  initializeCompany: (cityId) => {
    if (!getCity(cityId)) return
    const now = new Date().toISOString()
    const company: Company = { id: crypto.randomUUID(), name: 'Travel Empire', cash: 25_000, reputation: 0, level: 1, homeCityId: cityId, foundedAt: now }
    const vehicle: Vehicle = { id: crypto.randomUUID(), name: 'Compact Taxi', type: 'taxi', value: 12_000, condition: 100, fuel: 100, capacity: 4, status: 'available', cityId }
    const offers = createJobOffers(cityId)
    set({ ...blankSave, company, startingCityId: cityId, vehicles: [vehicle], ...offers, updatedAt: now, activeSection: 'map', hasHydrated: true })
  },
  refreshJobs: () => set((state) => {
    if (!state.startingCityId || state.jobs.some((job) => job.status === 'accepted')) return state
    return { ...createJobOffers(state.startingCityId), updatedAt: new Date().toISOString() }
  }),
  acceptJob: (jobId) => set((state) => {
    const result = acceptJobState(state.jobs, state.vehicles, jobId)
    return result ? { ...result, updatedAt: new Date().toISOString(), activeSection: 'map' } : state
  }),
  completeJob: (jobId) => set((state) => {
    if (!state.company) return state
    const result = completeJobState(state.company, state.jobs, state.vehicles, jobId)
    return result ? { ...result, updatedAt: new Date().toISOString() } : state
  }),
  resetGame: () => set({ ...blankSave, activeSection: 'map', hasHydrated: true }),
}), {
  name: 'save:autosave', storage: createJSONStorage(() => indexedDbStorage),
  partialize: ({ activeSection: _activeSection, hasHydrated: _hasHydrated, ...save }) => save,
  onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
}))

export type { Section }
