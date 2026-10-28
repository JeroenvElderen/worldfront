import { openDB } from 'idb'
import type { StateStorage } from 'zustand/middleware'

const database = openDB('travel-empire', 1, { upgrade(db) { db.createObjectStore('saves') } })

// Some Android WebViews leave IndexedDB requests pending indefinitely while
// restoring the app (for example after an OS update or an interrupted WebView
// shutdown). Zustand waits for getItem before it finishes hydration, so one
// stuck request would otherwise leave the game on its splash screen forever.
const DATABASE_TIMEOUT_MS = 4_000
const DATABASE_WRITE_DELAY_MS = 250
const LOCAL_BACKUP_WRITE_DELAY_MS = 2_000
let resettingGame = false
const RESET_MARKER = 'worldfront-reset-pending-v1'
const pendingWrites = new Map<string, { value: string; timeout: number }>()
const pendingBackupWrites = new Map<string, string>()
let backupTimeout: number | undefined

const flushLocalBackups = () => {
  if (backupTimeout !== undefined) window.clearTimeout(backupTimeout)
  backupTimeout = undefined
  pendingBackupWrites.forEach((value, name) => {
    try { window.localStorage.setItem(name, value) } catch { /* Storage can be disabled. */ }
  })
  pendingBackupWrites.clear()
}

const queueLocalBackup = (name: string, value: string) => {
  pendingBackupWrites.set(name, value)
  if (backupTimeout === undefined) backupTimeout = window.setTimeout(flushLocalBackups, LOCAL_BACKUP_WRITE_DELAY_MS)
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushLocalBackups()
})

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
    queueLocalBackup(name, value)
  },
  remove(name: string) {
    pendingBackupWrites.delete(name)
    try { window.localStorage.removeItem(name) } catch { /* Storage can be disabled. */ }
  },
}

// A malformed or obsolete save must never prevent Zustand from hydrating.
// Keep the invalid payload in a separate backup key for troubleshooting.
const validateSave = (name: string, value: string | null): string | null => {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || !('state' in parsed) ||
        !parsed.state || typeof parsed.state !== 'object') throw new Error('Invalid save envelope')
    return value
  } catch (error) {
    console.warn('[WorldFront] Invalid local save; starting a new game', error)
    try { window.localStorage.setItem(name + ':invalid-backup', value) } catch { /* unavailable */ }
    return null
  }
}

export const indexedDbStorage: StateStorage = {
  async getItem(name) {
    if (localBackup.get(RESET_MARKER) === '1') {
      localBackup.remove(RESET_MARKER)
      return null
    }
    try {
      const saved = await withTimeout(database.then((db) => db.get('saves', name)))
      const valid = validateSave(name, saved ?? null)
      if (valid) localBackup.set(name, valid)
      return valid ?? validateSave(name, localBackup.get(name))
    } catch {
      return validateSave(name, localBackup.get(name))
    }
  },
  async setItem(name, value) {
    if (resettingGame || localBackup.get(RESET_MARKER) === '1') return
    // Coalesce the fallback copy so serializing frequent game updates does not
    // repeatedly block the UI thread; backgrounding always flushes it at once.
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

/** Prevent active timers and Zustand subscriptions from resurrecting a deleted save. */
export async function wipeLocalGameSave(): Promise<void> {
  resettingGame = true
  window.localStorage.setItem(RESET_MARKER, '1')
  for (const pending of pendingWrites.values()) window.clearTimeout(pending.timeout)
  pendingWrites.clear()
  if (backupTimeout !== undefined) window.clearTimeout(backupTimeout)
  backupTimeout = undefined
  pendingBackupWrites.clear()
  localBackup.remove('save:autosave')
  await withTimeout(database.then((db) => db.delete('saves', 'save:autosave')))
}
