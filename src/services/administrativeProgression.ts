/** Rules for administrative expansion; independent of village discovery. */
export const REGION_EXPLORATION_THRESHOLD = 0.5
export const REGION_PURCHASE_COST = 25_000

export interface RegionRoadCoverage {
  regionId: string
  eligibleRoadKm: number
  exploredRoadKm: number
  inventoryComplete: boolean
  eligibleAreaKm2?: number
  exploredAreaKm2?: number
}
export interface RegionExpansionLedger {
  creditedRegionIds: string[]
  purchasedRegionIds: string[]
  purchasedCountryIds?: string[]
}
/** Null means the complete eligible-road inventory is not available. */
export function regionRoadProgress(coverage: RegionRoadCoverage): number | null {
  if (Number.isFinite(coverage.eligibleAreaKm2) && (coverage.eligibleAreaKm2 ?? 0) > 0 && Number.isFinite(coverage.exploredAreaKm2)) return Math.min(1, Math.max(0, coverage.exploredAreaKm2 ?? 0) / (coverage.eligibleAreaKm2 ?? 1))
  return null
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

/** Area-weighted exploration, never an average of municipalities. */
export const COUNTRY_EXPLORATION_THRESHOLD = 0.25
export function countryExplorationProgress(countryIso3: string, coverages: RegionRoadCoverage[]): number | null {
  const entries = coverages.filter((item) => item.regionId.startsWith(countryIso3 + ':ADM'))
  if (!entries.length || entries.some((item) => !Number.isFinite(item.eligibleAreaKm2) || (item.eligibleAreaKm2 ?? 0) <= 0 || !Number.isFinite(item.exploredAreaKm2))) return null
  const total = entries.reduce((sum, item) => sum + (item.eligibleAreaKm2 ?? 0), 0)
  const explored = entries.reduce((sum, item) => sum + Math.min(item.eligibleAreaKm2 ?? 0, Math.max(0, item.exploredAreaKm2 ?? 0)), 0)
  return total > 0 ? Math.min(1, explored / total) : null
}
/** Larger countries cost more, without making small countries free. */
export function countryTerritoryCost(countryAreaKm2: number): number {
  return 100_000 + Math.ceil(Math.max(0, countryAreaKm2) / 1000) * 1000
}
