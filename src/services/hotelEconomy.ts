import type { City, CityEconomy, Hotel } from '../models/game'

const hash = (value: string) => [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 2166136261)

export const createCityEconomy = (city: City): CityEconomy => {
  const seed = hash(city.id)
  return {
    cityId: city.id,
    population: 80_000 + seed % 920_000,
    tourism: 35 + seed % 56,
    business: 35 + Math.floor(seed / 7) % 56,
    prosperity: 40 + Math.floor(seed / 13) % 46,
    costIndex: 75 + Math.floor(seed / 17) % 51,
    trend: -2 + Math.floor(seed / 23) % 6,
  }
}

export const HOTEL_PURCHASE_COST = 12_000
export const hotelUpgradeCost = (hotel: Hotel) => 9_000 * hotel.level
export const hotelOccupancy = (economy: CityEconomy) => Math.min(96, Math.round(38 + economy.tourism * .42 + economy.prosperity * .14))
// Population evolves once per simulated day (24 real minutes). Keep the
// per-day rate modest and deterministic, using each city's existing trend.
export const growCityPopulation = (economy: CityEconomy, days: number): CityEconomy => {
  if (days <= 0) return economy
  const dailyRate = (0.00015 + economy.trend * 0.000055) * (0.7 + economy.prosperity / 200)
  return { ...economy, population: Math.max(1000, Math.round(economy.population * Math.pow(1 + dailyRate, days))) }
}

export const cityDemandMultiplier = (economy: CityEconomy | undefined) => economy
  ? (.85 + (economy.business + economy.tourism) / 500) * Math.max(0.75, Math.min(1.8, Math.sqrt(economy.population / 400_000)))
  : 1

export const pendingHotelRevenue = (hotel: Hotel, economy: CityEconomy, now = Date.now()) => {
  const elapsedHours = Math.min(24, Math.max(0, now - new Date(hotel.lastCollectedAt).getTime()) / 3_600_000)
  const gameDays = elapsedHours * 2.5 // one real hour advances 60 game hours
  const occupiedRooms = hotel.rooms * hotelOccupancy(economy) / 100
  const roomRate = (42 + economy.costIndex * .42) * (1 + (hotel.level - 1) * .12)
  return Math.floor(gameDays * occupiedRooms * roomRate * .28)
}
