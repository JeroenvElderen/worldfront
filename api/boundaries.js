// Private WorldFront GADM 4.1 cache. Configure SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY in Vercel (never expose the service key to Vite).
import { createClient } from '@supabase/supabase-js'

const cacheClient = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null

export default async function handler(req, res) {
  const country = String(req.query.country ?? '').toUpperCase()
  const level = String(req.query.level ?? '').toUpperCase()
  if (!/^[A-Z]{3}$/.test(country) || !/^ADM[123]$/.test(level)) {
    return res.status(400).json({ error: 'Invalid administrative boundary request' })
  }
  const cacheKey = `gadm41:${country}:${level}`
  if (cacheClient) {
    try {
      const { data, error } = await cacheClient.from('administrative_boundary_cache')
        .select('geometry').eq('cache_key', cacheKey).maybeSingle()
      if (error) throw error
      if (data?.geometry?.type === 'FeatureCollection' && Array.isArray(data.geometry.features) && data.geometry.features.length) {
        res.setHeader('Cache-Control', 'private, max-age=3600')
        return res.status(200).json(data.geometry)
      }
    } catch (error) {
      console.warn('[WorldFront] Supabase boundary cache read failed', cacheKey, error)
    }
  }

  const url = `https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_${country}_${level.slice(-1)}.json`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) return res.status(502).json({ error: `GADM geometry returned ${response.status}` })
    const data = await response.json()
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) {
      return res.status(502).json({ error: 'Invalid GADM geometry' })
    }
    if (cacheClient) {
      try {
        const { error } = await cacheClient.from('administrative_boundary_cache')
          .upsert({ cache_key: cacheKey, country_code: country, administrative_level: level,
            geometry: data, source: 'GADM 4.1', updated_at: new Date().toISOString() },
            { onConflict: 'cache_key' })
        if (error) throw error
      } catch (error) {
        console.warn('[WorldFront] Supabase boundary cache write failed', cacheKey, error)
      }
    }
    res.setHeader('Cache-Control', 'private, max-age=3600')
    return res.status(200).json(data)
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'GADM unavailable' })
  }
}
