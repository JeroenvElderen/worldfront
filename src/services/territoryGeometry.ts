import { featureCollection, polygon } from '@turf/helpers'
import { union } from '@turf/turf'
import type { Coordinates } from '../models/game'

const EARTH_KM_PER_LATITUDE_DEGREE = 110.574

const hash = (value: string) => {
  let result = 2166136261
  for (const character of value) {
    result ^= character.charCodeAt(0)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

/** A stable pseudo-random value, so a village keeps the same border after reloading. */
const noise = (seed: number, index: number) => {
  let value = seed + Math.imul(index + 1, 0x6d2b79f5)
  value = Math.imul(value ^ value >>> 15, value | 1)
  value ^= value + Math.imul(value ^ value >>> 7, value | 61)
  return ((value ^ value >>> 14) >>> 0) / 4294967296
}

/**
 * Creates an organic service territory around a settlement. It deliberately uses
 * uneven sectors rather than a buffer, making expansion resemble neighboring
 * village borders instead of perfect station-radius circles.
 */
export const villageTerritory = (id: string, center: Coordinates, radiusKm: number) => {
  const seed = hash(id)
  const sectorCount = 18
  const [longitude, latitude] = center
  const longitudeKmPerDegree = 111.32 * Math.max(.15, Math.cos(latitude * Math.PI / 180))
  const points: Coordinates[] = Array.from({ length: sectorCount }, (_, index) => {
    const angleJitter = (noise(seed, index * 2) - .5) * .16
    const angle = index / sectorCount * Math.PI * 2 + angleJitter
    const neighboringNoise = (noise(seed, index * 2 + 1) + noise(seed, ((index + 1) % sectorCount) * 2 + 1)) / 2
    const distanceKm = radiusKm * (.72 + neighboringNoise * .42)
    return [
      longitude + Math.cos(angle) * distanceKm / longitudeKmPerDegree,
      latitude + Math.sin(angle) * distanceKm / EARTH_KM_PER_LATITUDE_DEGREE,
    ]
  })
  points.push(points[0])
  return polygon([points], { id, unlocked: true })
}

export const mergeVillageTerritories = (territories: ReturnType<typeof villageTerritory>[]) => {
  if (!territories.length) return null
  if (territories.length === 1) return territories[0]
  return union(featureCollection(territories)) ?? null
}

/** A red world overlay with the purchased territory cut out as transparent holes. */
export const lockedTerritoryMask = (unlocked: ReturnType<typeof mergeVillageTerritories>) => {
  const worldRing: Coordinates[] = [[-179.9, -85], [179.9, -85], [179.9, 85], [-179.9, 85], [-179.9, -85]]
  if (!unlocked) return polygon([worldRing], { locked: true })
  // GeoJSON interior rings must wind in the opposite direction to their outer
  // ring. Village territories wind counter-clockwise, just like worldRing, so
  // passing them through unchanged makes Mapbox fill them instead of treating
  // them as transparent unlocked areas.
  const holes = unlocked.geometry.type === 'Polygon'
    ? [unlocked.geometry.coordinates[0].slice().reverse() as Coordinates[]]
    : unlocked.geometry.coordinates.map((part: number[][][]) => part[0].slice().reverse() as Coordinates[])
  return polygon([worldRing, ...holes], { locked: true })
}
