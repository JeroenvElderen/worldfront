/** GADM 4.1 boundaries for private, non-commercial WorldFront use only. */
import { booleanPointInPolygon } from '@turf/turf'
import { point } from '@turf/helpers'
import type { Coordinates } from '../models/game'

export type AdministrativeLevel = 'ADM1' | 'ADM2' | 'ADM3'
export interface AdministrativeRegionProperties {
  shapeID?: string
  shapeName?: string
  gameRegionId: string
  countryCode: string
  countryName: string
  administrativeLevel: AdministrativeLevel
}
export interface AdministrativeRegionFeature {
  type: 'Feature'
  id: number
  properties: AdministrativeRegionProperties
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}
export interface AdministrativeBoundaries {
  type: 'FeatureCollection'
  features: AdministrativeRegionFeature[]
  metadata: {
    countryCode: string
    countryName: string
    administrativeLevel: AdministrativeLevel
    divisionName: string
    regionCount: number
  }
}
const OVERRIDES: Record<string, [AdministrativeLevel, string]> = {
  IRL: ['ADM2', 'County'], NLD: ['ADM1', 'Province'],
  DEU: ['ADM1', 'Federal State'], USA: ['ADM1', 'State'],
  GBR: ['ADM2', 'Administrative Area'], FRA: ['ADM2', 'Department'],
  GRC: ['ADM2', 'Municipality'], SWE: ['ADM1', 'County'],
  JPN: ['ADM1', 'Prefecture'], POL: ['ADM1', 'Voivodeship'],
  CAN: ['ADM1', 'Province / Territory'], AUS: ['ADM1', 'State / Territory'],
  BRA: ['ADM1', 'State'], IND: ['ADM1', 'State / Territory'],
  CHN: ['ADM1', 'Province-level Division'],
}
type RawFeature = { type: 'Feature'; properties?: Record<string, unknown>; geometry: GeoJSON.Geometry }
type RawCollection = { type: 'FeatureCollection'; features: RawFeature[] }
const cache = new Map<string, Promise<AdministrativeBoundaries>>()
const levelsFor = (code: string): AdministrativeLevel[] =>
  [...new Set([OVERRIDES[code]?.[0] ?? 'ADM1', 'ADM1', 'ADM2'])] as AdministrativeLevel[]

async function fetchLevel(code: string, level: AdministrativeLevel): Promise<RawCollection | null> {
  // Browser requests go through our own origin, avoiding geoBoundaries CORS.
  const response = await fetch(`/api/boundaries?country=${encodeURIComponent(code)}&level=${level}`)
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(detail.error ?? `Boundary service returned ${response.status}`)
  }
  const data = await response.json() as RawCollection
  return data.type === 'FeatureCollection' && Array.isArray(data.features) ? data : null
}

export async function fetchAdministrativeBoundaries(countryCode3: string, countryName = countryCode3): Promise<AdministrativeBoundaries> {
  const code = countryCode3.toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Administrative boundaries require an ISO-3166 alpha-3 country code')
  const key = code
  const existing = cache.get(key)
  if (existing) return existing
  const task = (async () => {
    for (const level of levelsFor(code)) {
      let data: RawCollection | null
      try { data = await fetchLevel(code, level) } catch (error) { console.warn('[WorldFront] Region boundary request failed', code, level, error); continue }
      if (!data) continue
      const features: AdministrativeRegionFeature[] = data.features.flatMap((feature, index) => {
        if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return []
        const props = feature.properties ?? {}
        const gid = props[`GID_${level.slice(-1)}`]
        const shapeID = typeof gid === 'string' ? gid : `${level}-${index}`
        return [{
          type: 'Feature' as const, id: index + 1, geometry: feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          properties: {
            shapeID, shapeName: typeof props[`NAME_${level.slice(-1)}`] === 'string' ? String(props[`NAME_${level.slice(-1)}`]) : `Region ${index + 1}`,
            gameRegionId: `${code}:${level}:${shapeID}`, countryCode: code,
            countryName, administrativeLevel: level,
          },
        }]
      })
      if (features.length) return {
        type: 'FeatureCollection' as const, features,
        metadata: {
          countryCode: code, countryName, administrativeLevel: level,
          divisionName: level === (OVERRIDES[code]?.[0] ?? 'ADM1') ? (OVERRIDES[code]?.[1] ?? 'Administrative Region') : 'Administrative Region',
          regionCount: features.length,
        },
      }
    }
    throw new Error(`No administrative boundaries available for ${code}`)
  })()
  cache.set(key, task)
  try { return await task } catch (error) { cache.delete(key); throw error }
}

export function regionAtCoordinates(boundaries: AdministrativeBoundaries, coordinates: Coordinates): AdministrativeRegionFeature | null {
  const location = point(coordinates)
  return boundaries.features.find((feature) => booleanPointInPolygon(location, feature.geometry)) ?? null
}

/** The game stores ISO alpha-2 codes while geoBoundaries requires alpha-3. */
const ISO2_TO_3: Record<string, string> = {
  IE: 'IRL', NL: 'NLD', DE: 'DEU', GR: 'GRC', GB: 'GBR', UK: 'GBR',
  FR: 'FRA', US: 'USA', SE: 'SWE', PL: 'POL', CA: 'CAN', AU: 'AUS',
  JP: 'JPN', BR: 'BRA', IN: 'IND', CN: 'CHN', BE: 'BEL', ES: 'ESP',
  IT: 'ITA', PT: 'PRT', AT: 'AUT', CH: 'CHE', DK: 'DNK', NO: 'NOR',
  FI: 'FIN', CZ: 'CZE', SK: 'SVK', HU: 'HUN', RO: 'ROU', BG: 'BGR',
  HR: 'HRV', SI: 'SVN', EE: 'EST', LV: 'LVA', LT: 'LTU', LU: 'LUX',
  NZ: 'NZL', ZA: 'ZAF', MX: 'MEX', AR: 'ARG', CL: 'CHL', TR: 'TUR',
  IS: 'ISL', CY: 'CYP', MT: 'MLT', UA: 'UKR',
}
export function toGeoBoundariesCountryCode(countryCode: string): string | null {
  const code = countryCode.trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(code)) return code
  return ISO2_TO_3[code] ?? null
}
