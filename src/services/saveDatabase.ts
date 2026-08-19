import { openDB } from 'idb'
import type { StateStorage } from 'zustand/middleware'

const database = openDB('travel-empire', 1, { upgrade(db) { db.createObjectStore('saves') } })

export const indexedDbStorage: StateStorage = {
  async getItem(name) { return (await (await database).get('saves', name)) ?? null },
  async setItem(name, value) { await (await database).put('saves', value, name) },
  async removeItem(name) { await (await database).delete('saves', name) },
}
