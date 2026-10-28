import { supabase } from '../lib/supabase'
import type { PendingExploration, TerritoryFeature } from '../models/game'

const OUTBOX_KEY = 'worldfront-exploration-outbox-v1'
let inFlight = false
const DIAGNOSTIC_KEY = 'worldfront-exploration-diagnostic-v1'
const diagnose = (status: string, details = '') => {
  try {
    localStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify({
      time: new Date().toISOString(), status, details,
      outbox: readOutbox().length,
    }))
  } catch { /* Diagnostics must never block gameplay. */ }
}
export function explorationDiagnostic(): string {
  try {
    return localStorage.getItem(DIAGNOSTIC_KEY) ?? 'No exploration submission attempted'
  } catch { return 'Browser storage unavailable' }
}

const readOutbox = (): PendingExploration[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed as PendingExploration[] : []
  } catch { return [] }
}
const writeOutbox = (items: PendingExploration[]) => {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(items)) }
  catch (error) { console.warn('[exploration] Could not persist submission outbox', error) }
}
export async function submitExplorationQueue(queue: PendingExploration[]) {
  // Persist synchronously before the browser's local geometry processor clears
  // pendingExploration. Retry the outbox after reload and connectivity recovery.
  const outstanding = readOutbox()
  const ids = new Set(outstanding.map((item) => item.jobId))
  for (const item of queue) if (!ids.has(item.jobId)) {
    outstanding.push(item)
    ids.add(item.jobId)
  }
  if (queue.length) writeOutbox(outstanding)
  diagnose('submission-check', `incoming=${queue.length}`)
  if (!supabase) { diagnose('supabase-not-configured'); return }
  if (inFlight) { diagnose('submission-already-running'); return }
  if (!outstanding.length) { diagnose('no-routes-to-submit'); return }
  inFlight = true
  try {
    let { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user) {
      const result = await supabase.auth.signInAnonymously()
      user = result.data.user
      authError = result.error
    }
    if (authError || !user) {
      diagnose('authentication-failed', authError?.message ?? 'No user returned')
      console.warn('[exploration] Authentication unavailable', authError?.message)
      return
    }
    for (const item of readOutbox()) {
      const { error } = await supabase.rpc('enqueue_exploration_job', {
        p_job_id: item.jobId,
        p_vehicle_id: item.vehicleId,
        p_completed_at: item.completedAt,
        p_segments: item.segments,
      })
      if (error) {
        diagnose('rpc-failed', `${error.code ?? 'unknown'}: ${error.message}`)
        console.warn('[exploration] Remote queue submission failed', item.jobId, error.message)
        break
      }
      writeOutbox(readOutbox().filter((pending) => pending.jobId !== item.jobId))
      diagnose('queued-successfully', item.jobId)
      console.info('[exploration] Journey queued on server', item.jobId)
    }
  } catch (error) {
    diagnose('unexpected-error', String(error))
    console.warn('[exploration] Remote queue unavailable; will retry', error)
  } finally { inFlight = false }
}

export async function loadRemoteExploration(): Promise<TerritoryFeature | null> {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.from('exploration_territories')
    .select('territory').eq('user_id', user.id)
  if (error) { console.warn('[exploration] Remote load failed', error.message); return null }
  const features = (data ?? []).map((row) => row.territory as TerritoryFeature)
    .filter((feature) => feature?.type === 'Feature' && feature.geometry)
  // A GeoJSON MultiPolygon can contain overlapping polygons; no Turf union
  // is needed on the mobile main thread for rendering.
  if (!features.length) return null
  if (features.length === 1) return features[0]
  const coordinates: number[][][][] = []
  for (const feature of features) {
    if (feature.geometry.type === 'Polygon') coordinates.push(feature.geometry.coordinates)
    else if (feature.geometry.type === 'MultiPolygon') coordinates.push(...feature.geometry.coordinates)
  }
  return { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates }, properties: { id: 'taxi-exploration', unlocked: true } } as TerritoryFeature
}

export function subscribeRemoteExploration(onChange: () => void) {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client.channel('worldfront-exploration')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exploration_territories' }, onChange)
    .subscribe()
  return () => { void client.removeChannel(channel) }
}
