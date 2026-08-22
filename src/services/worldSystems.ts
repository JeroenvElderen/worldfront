import type { BrandStrategy, Competitor, Difficulty, WeatherKind, WorldCondition } from '../models/game'

export const defaultBrandStrategy: BrandStrategy = { primaryColor: '#43ddb5', fareStrategy: 'standard', marketingCampaign: 'none', safetyRating: 100 }

export const createCompetitors = (cityId: string): Competitor[] => [
  { id: crypto.randomUUID(), name: 'CityLink Mobility', color: '#60a5fa', cash: 82_000, fleetSize: 7, stationCount: 2, serviceQuality: 74, fareIndex: .92, marketShare: 23, relationship: 'rival', cityIds: [cityId] },
  { id: crypto.randomUUID(), name: 'Northstar Travel', color: '#f59e0b', cash: 126_000, fleetSize: 11, stationCount: 3, serviceQuality: 82, fareIndex: 1.12, marketShare: 31, relationship: 'rival', cityIds: [cityId] },
]

const weatherDescriptions: Record<WeatherKind, string> = {
  clear: 'Clear roads and normal passenger demand.', rain: 'Rain is lifting taxi demand and slowing road traffic.', snow: 'Snow reduces road speeds and raises breakdown risk.', storm: 'Severe winds disrupt ferry and airport operations.', heatwave: 'Heat increases electric energy consumption.',
}

export const createWorldCondition = (now = Date.now()): WorldCondition => {
  const roll = Math.random()
  const weather: WeatherKind = roll < .36 ? 'clear' : roll < .62 ? 'rain' : roll < .75 ? 'heatwave' : roll < .88 ? 'snow' : 'storm'
  const disruption = weather === 'storm' ? (Math.random() < .5 ? 'ferry-cancelled' : 'airport-delay') : Math.random() < .12 ? (Math.random() < .5 ? 'road-closure' : 'rail-strike') : 'none'
  return { weather, temperatureC: weather === 'snow' ? -2 : weather === 'heatwave' ? 34 : weather === 'storm' ? 12 : weather === 'rain' ? 9 : 18, demandMultiplier: weather === 'rain' ? 1.3 : weather === 'snow' ? 1.2 : 1, speedMultiplier: weather === 'snow' ? .7 : weather === 'storm' ? .78 : weather === 'rain' ? .88 : 1, energyMultiplier: weather === 'heatwave' ? 1.25 : weather === 'snow' ? 1.18 : 1, disruption, description: `${weatherDescriptions[weather]}${disruption !== 'none' ? ` Active disruption: ${disruption.replace('-', ' ')}.` : ''}`, expiresAt: new Date(now + 5 * 60_000).toISOString() }
}

export const competitorGrowth = (difficulty: Difficulty) => difficulty === 'relaxed' ? 1 : difficulty === 'ruthless' ? 3 : 2
export const fareMultiplier = (strategy: BrandStrategy['fareStrategy']) => strategy === 'value' ? .88 : strategy === 'premium' ? 1.22 : 1
export const marketingDemandMultiplier = (strategy: BrandStrategy) => strategy.marketingCampaign === 'none' ? 1 : strategy.marketingCampaign === 'event' ? 1.25 : strategy.marketingCampaign === 'digital' ? 1.16 : 1.1
