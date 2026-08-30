import type { PostalDepot } from '../models/game'

export const POSTAL_DEPOT_BUILD_COST = 10_000
export const POSTAL_DEPOT_MAX_LEVEL = 4
export const POSTAL_DEPOT_SLOTS_PER_LEVEL = 3

export const postalDepotCapacity = (depot: Pick<PostalDepot, 'level'>) =>
  Math.max(1, depot.level) * POSTAL_DEPOT_SLOTS_PER_LEVEL

export const postalDepotUpgradeCost = (level: number) =>
  Math.round(7_500 * Math.pow(1.65, Math.max(0, level - 1)))
