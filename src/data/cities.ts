import type { City } from '../models/game'

// Adding a new country only requires appending cities with their ISO country code.
export const cities: City[] = [
  { id: 'ie-dublin', name: 'Dublin', countryCode: 'IE', coordinates: [-6.2603, 53.3498], mapZoom: 12 },
  { id: 'ie-cork', name: 'Cork', countryCode: 'IE', coordinates: [-8.4756, 51.8985], mapZoom: 12 },
  { id: 'ie-galway', name: 'Galway', countryCode: 'IE', coordinates: [-9.0568, 53.2707], mapZoom: 12 },
  { id: 'ie-limerick', name: 'Limerick', countryCode: 'IE', coordinates: [-8.6305, 52.6638], mapZoom: 12 },
  { id: 'ie-waterford', name: 'Waterford', countryCode: 'IE', coordinates: [-7.1101, 52.2593], mapZoom: 12 },
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
