import type { TransportMode } from '../models/game'

export const transportModels: Record<TransportMode, { model: string; icon: string; label: string; price: number; capacity: number; speedKmh: number; unlockLevel: number }> = {
  train: { model: 'InterCity 220', icon: '🚆', label: 'Intercity train', price: 180_000, capacity: 220, speedKmh: 160, unlockLevel: 4 },
  ferry: { model: 'Coastal Voyager', icon: '⛴️', label: 'Passenger ferry', price: 260_000, capacity: 420, speedKmh: 48, unlockLevel: 5 },
  airliner: { model: 'SkyLink 90', icon: '✈️', label: 'Regional airliner', price: 750_000, capacity: 90, speedKmh: 780, unlockLevel: 6 },
}
