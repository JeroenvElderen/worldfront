import type { DemandHotspot, DemandLevel } from '../models/game'
import { gameDateAt } from './gameTime'

export interface DemandPlace {
  id: string
  name: string
  coordinates: [number, number]
}

type DemandProfile = {
  category: string
  terms: string[]
  base: number
  hourly: Array<[start: number, end: number, bonus: number, reason: string]>
  weekendBonus?: number
}

const profiles: DemandProfile[] = [
  { category: 'airport', terms: ['airport'], base: 72, hourly: [[4, 9, 25, 'morning departures'], [16, 23, 18, 'evening arrivals']] },
  { category: 'transit', terms: ['train', 'station', 'bus'], base: 62, hourly: [[6, 10, 26, 'commuter arrivals'], [16, 20, 28, 'evening commute']] },
  { category: 'nightlife', terms: ['restaurant', 'cafe', 'cinema', 'theatre'], base: 43, hourly: [[12, 14, 15, 'lunch rush'], [18, 24, 34, 'evening visitors']], weekendBonus: 13 },
  { category: 'hotel', terms: ['hotel'], base: 50, hourly: [[7, 11, 23, 'guest check-outs'], [14, 19, 20, 'guest check-ins']], weekendBonus: 8 },
  { category: 'business', terms: ['office', 'business', 'bank', 'courthouse', 'government'], base: 48, hourly: [[7, 10, 28, 'morning commute'], [16, 19, 24, 'office closing time']] },
  { category: 'education', terms: ['university', 'school'], base: 38, hourly: [[7, 9, 30, 'classes starting'], [14, 17, 25, 'classes finishing']] },
  { category: 'healthcare', terms: ['hospital', 'clinic', 'pharmacy'], base: 45, hourly: [[7, 10, 14, 'appointment arrivals'], [15, 18, 18, 'appointment departures']] },
  { category: 'shopping', terms: ['shopping', 'supermarket', 'dealership'], base: 39, hourly: [[10, 13, 15, 'morning shoppers'], [15, 19, 22, 'after-work shoppers']], weekendBonus: 16 },
  { category: 'leisure', terms: ['stadium', 'museum', 'park', 'tourist'], base: 38, hourly: [[10, 17, 22, 'day visitors'], [18, 23, 28, 'event traffic']], weekendBonus: 20 },
]

const demandLevel = (score: number): DemandLevel => score >= 86 ? 'surging' : score >= 68 ? 'busy' : score >= 48 ? 'steady' : 'quiet'

const profileFor = (name: string) => {
  const normalized = name.toLocaleLowerCase()
  return profiles.find((profile) => profile.terms.some((term) => normalized.includes(term))) ?? {
    category: 'local', terms: [], base: 35, hourly: [[7, 10, 12, 'morning activity'], [16, 20, 14, 'evening activity']],
  }
}

/** Scores a real POI using the accelerated in-game hour and day of week. */
export function demandForPlace(place: DemandPlace, foundedAt?: string, realNow = Date.now()) {
  const gameNow = foundedAt ? gameDateAt(foundedAt, realNow) : new Date(realNow)
  const hour = gameNow.getUTCHours()
  const weekend = gameNow.getUTCDay() === 0 || gameNow.getUTCDay() === 6
  const profile = profileFor(place.name)
  const peak = profile.hourly.find(([start, end]) => hour >= start && hour < end)
  const weekendBonus = weekend ? profile.weekendBonus ?? 0 : 0
  // A stable POI-specific offset prevents every place of one kind looking identical.
  const localVariation = [...place.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 13 - 6
  const score = Math.max(20, Math.min(100, profile.base + (peak?.[2] ?? 0) + weekendBonus + localVariation))
  const reason = peak?.[3] ?? (weekendBonus ? 'weekend visitors' : `${profile.category} demand`)
  return { score, level: demandLevel(score), reason, category: profile.category }
}

export function buildDemandHotspots(cityId: string, places: DemandPlace[], foundedAt?: string, realNow = Date.now()): DemandHotspot[] {
  return places
    .map((place) => ({ ...place, cityId, ...demandForPlace(place, foundedAt, realNow) }))
    .filter((place) => place.score >= 45)
    .sort((left, right) => right.score - left.score)
    .slice(0, 24)
}
