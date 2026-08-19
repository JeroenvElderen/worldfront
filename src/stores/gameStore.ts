import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getCity } from '../data/cities'
import type { Company, GameSave, Vehicle } from '../models/game'
import { indexedDbStorage } from '../services/saveDatabase'

type Section = 'map' | 'jobs' | 'fleet' | 'travel' | 'company'
interface GameActions { initializeCompany: (cityId: string) => void; setSection: (section: Section) => void; resetGame: () => void }
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
    set({ ...blankSave, company, startingCityId: cityId, vehicles: [vehicle], updatedAt: now, activeSection: 'map', hasHydrated: true })
  },
  resetGame: () => set({ ...blankSave, activeSection: 'map', hasHydrated: true }),
}), {
  name: 'save:autosave', storage: createJSONStorage(() => indexedDbStorage),
  partialize: ({ activeSection: _activeSection, hasHydrated: _hasHydrated, ...save }) => save,
  onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
}))

export type { Section }
