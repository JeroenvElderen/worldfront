import type { City } from '../models/game'

// Adding a new country only requires appending cities with their ISO country code.
export const cities: City[] = [
  { id: 'ie-dublin', name: 'Dublin', countryCode: 'IE', coordinates: [-6.2603, 53.3498], mapZoom: 12 },
  { id: 'ie-cork', name: 'Cork', countryCode: 'IE', coordinates: [-8.4756, 51.8985], mapZoom: 12 },
  { id: 'ie-galway', name: 'Galway', countryCode: 'IE', coordinates: [-9.0568, 53.2707], mapZoom: 12 },
  { id: 'ie-limerick', name: 'Limerick', countryCode: 'IE', coordinates: [-8.6305, 52.6638], mapZoom: 12 },
  { id: 'ie-waterford', name: 'Waterford', countryCode: 'IE', coordinates: [-7.1101, 52.2593], mapZoom: 12 },
]

export const irelandOverview = { center: [-8.1, 53.25] as const, zoom: 5.7 }
export const getCity = (id: string | null) => cities.find((city) => city.id === id)
