// Same-origin Vercel Function: geoBoundaries geometry hosts may block browser CORS.
export default async function handler(req, res) {
  const country = String(req.query.country ?? '').toUpperCase()
  const level = String(req.query.level ?? '').toUpperCase()
  if (!/^[A-Z]{3}$/.test(country) || !/^ADM[123]$/.test(level)) {
    return res.status(400).json({ error: 'Invalid administrative boundary request' })
  }
  try {
    const metadataResponse = await fetch(`https://www.geoboundaries.org/api/current/gbOpen/${country}/${level}/`, { signal: AbortSignal.timeout(12000) })
    if (!metadataResponse.ok) return res.status(502).json({ error: `Boundary metadata returned ${metadataResponse.status}` })
    const metadata = await metadataResponse.json()
    const url = metadata.simplifiedGeometryGeoJSON || metadata.gjDownloadURL
    if (!url || !/^https:\/\//.test(url)) return res.status(502).json({ error: 'Boundary geometry URL missing' })
    const parsed = new URL(url)
    if (!['github.com', 'raw.githubusercontent.com', 'media.githubusercontent.com', 'www.geoboundaries.org', 'geoboundaries.org'].includes(parsed.hostname)) {
      return res.status(502).json({ error: 'Unexpected geometry host' })
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) return res.status(502).json({ error: `Boundary geometry returned ${response.status}` })
    const data = await response.json()
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) return res.status(502).json({ error: 'Invalid boundary geometry' })
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return res.status(200).json(data)
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Boundary provider unavailable' })
  }
}
