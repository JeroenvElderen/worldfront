/** Rules for administrative expansion; independent of village discovery. */
export const REGION_EXPLORATION_THRESHOLD = 0.5
export const REGION_PURCHASE_COST = 25_000

export interface RegionRoadCoverage {
  regionId: string
  eligibleRoadKm: number
  exploredRoadKm: number
  inventoryComplete: boolean
}
export interface RegionExpansionLedger {
  creditedRegionIds: string[]
  purchasedRegionIds: string[]
}
/** Null means the complete eligible-road inventory is not available. */
export function regionRoadProgress(coverage: RegionRoadCoverage): number | null {
  if (!coverage.inventoryComplete || !Number.isFinite(coverage.eligibleRoadKm) || coverage.eligibleRoadKm <= 0) return null
  if (!Number.isFinite(coverage.exploredRoadKm) || coverage.exploredRoadKm < 0) return null
  return Math.min(1, coverage.exploredRoadKm / coverage.eligibleRoadKm)
}
export function regionQualifiesForCredit(coverage: RegionRoadCoverage): boolean {
  const progress = regionRoadProgress(coverage)
  return progress !== null && progress >= REGION_EXPLORATION_THRESHOLD
}
export function unclaimedRegionCredits(coverages: RegionRoadCoverage[], ledger: RegionExpansionLedger): string[] {
  const alreadyCredited = new Set(ledger.creditedRegionIds)
  return [...new Map(coverages.map((region) => [region.regionId, region])).values()]
    .filter((region) => !alreadyCredited.has(region.regionId) && regionQualifiesForCredit(region))
    .map((region) => region.regionId)
}
export function availableRegionCredits(ledger: RegionExpansionLedger): number {
  return Math.max(0, new Set(ledger.creditedRegionIds).size - new Set(ledger.purchasedRegionIds).size)
}
export function canPurchaseRegion(regionId: string, ownedRegionIds: readonly string[], cash: number, ledger: RegionExpansionLedger): boolean {
  return !ownedRegionIds.includes(regionId)
    && !ledger.purchasedRegionIds.includes(regionId)
    && cash >= REGION_PURCHASE_COST
    && availableRegionCredits(ledger) > 0
}
