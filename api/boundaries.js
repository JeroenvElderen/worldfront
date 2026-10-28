// Private, non-commercial WorldFront only. GADM 4.1 is not licensed for redistribution.
export default async function handler(req, res) {
  const country = String(req.query.country ?? '').toUpperCase()
  const level = String(req.query.level ?? '').toUpperCase()
  if (!/^[A-Z]{3}$/.test(country) || !/^ADM[123]$/.test(level)) {
    return res.status(400).json({ error: 'Invalid administrative boundary request' })
  }
  const url = `https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_${country}_${level.slice(-1)}.json`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) return res.status(502).json({ error: `GADM geometry returned ${response.status}` })
    const data = await response.json()
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      return res.status(502).json({ error: 'Invalid GADM geometry' })
    }
    res.setHeader('Cache-Control', 'private, max-age=86400')
    return res.status(200).json(data)
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'GADM unavailable' })
  }
}
