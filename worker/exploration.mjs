import { createClient } from '@supabase/supabase-js'
import { buffer, featureCollection, lineString, simplify, union } from '@turf/turf'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Railway')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const pollMs = Math.max(1000, Number(process.env.EXPLORATION_POLL_MS ?? 3000))
const workerId = process.env.RAILWAY_SERVICE_ID ?? crypto.randomUUID()
let running = true
process.on('SIGTERM', () => { running = false })
process.on('SIGINT', () => { running = false })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function routePolygon(segments, jobId) {
  const polygons = []
  for (const segment of segments) {
    if (!Array.isArray(segment) || segment.length < 2) continue
    const valid = segment.filter((point) => Array.isArray(point) && point.length === 2 &&
      point.every((coordinate) => Number.isFinite(coordinate)))
    if (valid.length < 2) continue
    const path = lineString(valid)
    const shape = buffer(simplify(path, { tolerance: 0.0001, highQuality: false }), 0.5, { steps: 8, units: 'kilometers' })
    if (shape) polygons.push(shape)
  }
  if (!polygons.length) throw new Error('No usable land route segments')
  const merged = polygons.length === 1 ? polygons[0] : union(featureCollection(polygons))
  if (!merged) throw new Error('Could not calculate exploration polygon')
  return { type: 'Feature', geometry: merged.geometry, properties: { id: jobId, unlocked: true, source: 'taxi-discovery' } }
}

async function work() {
  const { data: jobs, error } = await db.rpc('claim_exploration_jobs', { p_worker: workerId, p_limit: 3 })
  if (error) throw error
  for (const job of jobs ?? []) {
    try {
      const territory = routePolygon(job.segments, job.job_id)
      const { error: saveError } = await db.rpc('complete_exploration_job', {
        p_job_id: job.id, p_worker: workerId, p_territory: territory,
      })
      if (saveError) throw saveError
      console.log('Exploration processed:', job.job_id)
    } catch (error) {
      console.error('Exploration failed:', job.job_id, error)
      const { error: retryError } = await db.rpc('retry_exploration_job', {
        p_job_id: job.id, p_worker: workerId, p_error: String(error).slice(0, 500),
      })
      if (retryError) console.error('Failed to schedule retry:', retryError)
    }
  }
  return (jobs ?? []).length
}

console.log('WorldFront exploration worker started')
while (running) {
  try {
    const count = await work()
    if (!count) await sleep(pollMs)
  } catch (error) {
    console.error('Worker polling failed:', error)
    await sleep(Math.max(5000, pollMs))
  }
}
console.log('WorldFront exploration worker stopped')
