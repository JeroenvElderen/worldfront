import { booleanPointInPolygon } from '@turf/turf'
import type { Coordinates, TerritoryFeature } from '../models/game'

// Country-specific administrative divisions match Transport Simulator.
const countries: Record<string, [string, 'ADM1' | 'ADM2']> = {
  IE: ['IRL', 'ADM2'], NL: ['NLD', 'ADM1'], DE: ['DEU', 'ADM1'],
  US: ['USA', 'ADM1'], GB: ['GBR', 'ADM2'], FR: ['FRA', 'ADM2'],
  GR: ['GRC', 'ADM1'], SE: ['SWE', 'ADM1'], JP: ['JPN', 'ADM1'],
  PL: ['POL', 'ADM1'], CA: ['CAN', 'ADM1'], AU: ['AUS', 'ADM1'],
  BR: ['BRA', 'ADM1'], IN: ['IND', 'ADM1'], CN: ['CHN', 'ADM1'],
  BE: ['BEL', 'ADM1'], ES: ['ESP', 'ADM1'], PT: ['PRT', 'ADM1'],
}
export const ADMIN_REGION_PRICE = 25_000
export interface AdministrativeRegion {
  id: string
  name: string
  countryCode: string
  level: string
  geometry: TerritoryFeature['geometry']
}
interface BoundaryCollection {
  type: 'FeatureCollection'
  features: Array<{ geometry: TerritoryFeature['geometry']; properties: Record<string, unknown> }>
}
const cache = new Map<string, Promise<BoundaryCollection>>()
async function boundaries(code: string, level: string): Promise<BoundaryCollection> {
  const key = code + ':' + level
  if (!cache.has(key)) cache.set(key, (async () => {
    const metadataResponse = await fetch(`https://www.geoboundaries.org/api/current/gbOpen/${code}/${level}/`)
    if (!metadataResponse.ok) throw new Error('Administrative boundary metadata unavailable')
    const metadata = await metadataResponse.json() as { simplifiedGeometryGeoJSON?: string; gjDownloadURL?: string }
    const url = metadata.simplifiedGeometryGeoJSON || metadata.gjDownloadURL
    if (!url) throw new Error('Administrative boundary geometry unavailable')
    const response = await fetch(url)
    if (!response.ok) throw new Error('Administrative boundary download failed')
    const data = await response.json() as BoundaryCollection
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid boundary data')
    return data
  })().catch(error => { cache.delete(key); throw error }))
  return cache.get(key)!
}
export async function administrativeRegionAt(coordinates: Coordinates, countryCode: string): Promise<AdministrativeRegion> {
  const config = countries[countryCode.toUpperCase()]
  if (!config) throw new Error('Administrative regions are not configured for this country yet')
  const [iso3, level] = config
  const data = await boundaries(iso3, level)
  const match = data.features.find(feature =>
    feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') &&
    booleanPointInPolygon(coordinates, { type: 'Feature', properties: {}, geometry: feature.geometry } as TerritoryFeature)
  )
  if (!match) throw new Error('No administrative region found at this location')
  const shapeId = String(match.properties.shapeID || match.properties.shapeName || '')
  if (!shapeId) throw new Error('Administrative region is missing an identifier')
  return { id: `${iso3}:${level}:${shapeId}`, name: String(match.properties.shapeName || shapeId), countryCode, level, geometry: match.geometry }
}
