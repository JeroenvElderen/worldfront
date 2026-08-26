import { openDB } from 'idb'
import type { StateStorage } from 'zustand/middleware'

const database = openDB('travel-empire', 1, { upgrade(db) { db.createObjectStore('saves') } })

// Some Android WebViews leave IndexedDB requests pending indefinitely while
// restoring the app (for example after an OS update or an interrupted WebView
// shutdown). Zustand waits for getItem before it finishes hydration, so one
// stuck request would otherwise leave the game on its splash screen forever.
const DATABASE_TIMEOUT_MS = 4_000
const DATABASE_WRITE_DELAY_MS = 250
const pendingWrites = new Map<string, { value: string; timeout: number }>()

const withTimeout = async <T>(operation: Promise<T>): Promise<T> => {
  let timeout: number | undefined
  const expired = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(
      () => reject(new Error('Save database timed out')),
      DATABASE_TIMEOUT_MS,
    )
  })

  try {
    return await Promise.race([operation, expired])
  } finally {
    window.clearTimeout(timeout)
  }
}

const localBackup = {
  get(name: string) {
    try { return window.localStorage.getItem(name) } catch { return null }
  },
  set(name: string, value: string) {
    try { window.localStorage.setItem(name, value) } catch { /* Storage can be disabled. */ }
  },
  remove(name: string) {
    try { window.localStorage.removeItem(name) } catch { /* Storage can be disabled. */ }
  },
}

export const indexedDbStorage: StateStorage = {
  async getItem(name) {
    try {
      const saved = await withTimeout(database.then((db) => db.get('saves', name)))
      if (saved) localBackup.set(name, saved)
      return saved ?? localBackup.get(name)
    } catch {
      return localBackup.get(name)
    }
  },
  async setItem(name, value) {
    // Keep a synchronous backup so a broken IndexedDB database can never make
    // a player choose between starting the app and retaining their save.
    localBackup.set(name, value)
    const pending = pendingWrites.get(name)
    if (pending) window.clearTimeout(pending.timeout)
    const timeout = window.setTimeout(() => {
      pendingWrites.delete(name)
      void withTimeout(database.then((db) => db.put('saves', value, name))).catch(() => { /* The backup is authoritative until IndexedDB recovers. */ })
    }, DATABASE_WRITE_DELAY_MS)
    pendingWrites.set(name, { value, timeout })
  },
  async removeItem(name) {
    const pending = pendingWrites.get(name)
    if (pending) {
      window.clearTimeout(pending.timeout)
      pendingWrites.delete(name)
    }
    localBackup.remove(name)
    try { await withTimeout(database.then((db) => db.delete('saves', name))) } catch { /* Nothing else to remove. */ }
  },
}
