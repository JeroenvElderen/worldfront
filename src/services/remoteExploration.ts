import { supabase } from '../lib/supabase'
import type { PendingExploration, TerritoryFeature } from '../models/game'
import { mergeVillageTerritories } from './territoryGeometry'

let inFlight = false
const sent = new Set<string>()
export async function submitExplorationQueue(queue: PendingExploration[]) {
  if (!supabase || inFlight || !queue.length) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  inFlight = true
  try {
    for (const item of queue) {
      if (sent.has(item.jobId)) continue
      const { error } = await supabase.rpc('enqueue_exploration_job', {
        p_job_id: item.jobId,
        p_vehicle_id: item.vehicleId,
        p_completed_at: item.completedAt,
        p_segments: item.segments,
      })
      if (error) {
        console.warn('[exploration] Remote queue submission failed', item.jobId, error.message)
        break
      }
      sent.add(item.jobId)
    }
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
  return mergeVillageTerritories(features)
}

export function subscribeRemoteExploration(onChange: () => void) {
  if (!supabase) return () => {}
  const channel = supabase.channel('worldfront-exploration')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exploration_territories' }, onChange)
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}
