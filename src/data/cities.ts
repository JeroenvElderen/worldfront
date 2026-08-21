import type { City } from '../models/game'

// Adding a new country only requires appending cities with their ISO country code.
export const cities: City[] = [
  { id: 'ie-wicklow', name: 'County Wicklow', countryCode: 'IE', countryName: 'Ireland', regionCode: 'WW', regionName: 'County Wicklow', coordinates: [-6.42, 53.02], mapZoom: 9.2 },
  { id: 'ie-dublin', name: 'County Dublin', countryCode: 'IE', countryName: 'Ireland', regionCode: 'D', regionName: 'County Dublin', coordinates: [-6.26, 53.4], mapZoom: 9.2 },
  { id: 'ie-kildare', name: 'County Kildare', countryCode: 'IE', countryName: 'Ireland', regionCode: 'KE', regionName: 'County Kildare', coordinates: [-6.75, 53.18], mapZoom: 9.2 },
  { id: 'ie-carlow', name: 'County Carlow', countryCode: 'IE', countryName: 'Ireland', regionCode: 'CW', regionName: 'County Carlow', coordinates: [-6.78, 52.72], mapZoom: 9.4 },
  { id: 'ie-wexford', name: 'County Wexford', countryCode: 'IE', countryName: 'Ireland', regionCode: 'WX', regionName: 'County Wexford', coordinates: [-6.52, 52.45], mapZoom: 9.1 },
  { id: 'gb-london', name: 'London', countryCode: 'GB', coordinates: [-0.1276, 51.5072], mapZoom: 11 },
  { id: 'gb-manchester', name: 'Manchester', countryCode: 'GB', coordinates: [-2.2426, 53.4808], mapZoom: 12 },
  { id: 'gb-edinburgh', name: 'Edinburgh', countryCode: 'GB', coordinates: [-3.1883, 55.9533], mapZoom: 12 },
  { id: 'fr-paris', name: 'Paris', countryCode: 'FR', coordinates: [2.3522, 48.8566], mapZoom: 11 },
  { id: 'fr-lyon', name: 'Lyon', countryCode: 'FR', coordinates: [4.8357, 45.764], mapZoom: 12 },
  { id: 'nl-amsterdam', name: 'Amsterdam', countryCode: 'NL', coordinates: [4.9041, 52.3676], mapZoom: 12 },
  { id: 'be-brussels', name: 'Brussels', countryCode: 'BE', coordinates: [4.3517, 50.8503], mapZoom: 12 },
  { id: 'de-berlin', name: 'Berlin', countryCode: 'DE', coordinates: [13.405, 52.52], mapZoom: 11 },
  { id: 'de-hamburg', name: 'Hamburg', countryCode: 'DE', coordinates: [9.9937, 53.5511], mapZoom: 12 },
  { id: 'es-madrid', name: 'Madrid', countryCode: 'ES', coordinates: [-3.7038, 40.4168], mapZoom: 11 },
  { id: 'pt-lisbon', name: 'Lisbon', countryCode: 'PT', coordinates: [-9.1393, 38.7223], mapZoom: 12 },
]

export const countries = [
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', licenseCost: 0 },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', licenseCost: 35_000 },
  { code: 'FR', name: 'France', flag: '🇫🇷', licenseCost: 55_000 },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', licenseCost: 60_000 },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪', licenseCost: 60_000 },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', licenseCost: 80_000 },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', licenseCost: 85_000 },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', licenseCost: 85_000 },
] as const

export const irelandOverview = {
  center: [-8.1, 53.25] as [number, number],
  zoom: 5.7,
}
export const getCity = (id: string | null, customCities: City[] = []) => [...customCities, ...cities].find((city) => city.id === id)

export const CITY_EXPANSION_DISTANCE_KM = 50
export const CITY_PURCHASE_COST = 10_000
export const DEPOT_BUILD_COST = 15_000
