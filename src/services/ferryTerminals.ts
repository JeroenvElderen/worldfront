import type { Coordinates, TaxiFerryCrossing } from '../models/game'

const clampRouteIndex = (index: number, lastIndex: number) =>
  Math.max(0, Math.min(lastIndex, Math.round(index)))

/**
 * Directions marks the ferry geometry itself, whose first and last points can
 * already be over water. Road vehicles should instead stop on the adjacent
 * road points: one immediately before boarding and one immediately after
 * disembarking.
 *
 * The flag makes this safe for persisted routes: legacy crossings are padded
 * once, while crossings produced by current code are left unchanged.
 */
export const resolveLandsideFerryTerminals = (
  coordinates: Coordinates[],
  crossings: TaxiFerryCrossing[],
): TaxiFerryCrossing[] => {
  if (coordinates.length < 2 || !crossings.length) return crossings

  const lastIndex = coordinates.length - 1
  let changed = false
  const resolved = crossings.map((crossing) => {
    if (crossing.landsideTerminalsResolved) return crossing

    const ferryStartIndex = clampRouteIndex(crossing.startIndex, lastIndex)
    const ferryEndIndex = clampRouteIndex(crossing.endIndex, lastIndex)
    const startIndex = Math.max(0, ferryStartIndex - 1)
    const endIndex = Math.min(lastIndex, Math.max(startIndex + 1, ferryEndIndex + 1))
    changed = true

    return {
      ...crossing,
      startIndex,
      endIndex,
      boardAt: coordinates[startIndex] ?? crossing.boardAt,
      disembarkAt: coordinates[endIndex] ?? crossing.disembarkAt,
      landsideTerminalsResolved: true,
    }
  })

  return changed ? resolved : crossings
}
