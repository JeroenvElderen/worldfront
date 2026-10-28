import { calculateAdministrativeTerritoryCoverage } from '../services/administrativeTerritoryCoverage'
import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { fetchAdministrativeBoundaries, regionAtCoordinates, toGeoBoundariesCountryCode, type AdministrativeBoundaries } from '../services/administrativeBoundaries'
import { availableRegionCredits, regionRoadProgress, REGION_PURCHASE_COST, countryExplorationProgress, countryTerritoryCost, COUNTRY_EXPLORATION_THRESHOLD } from '../services/administrativeProgression'
import type { City } from '../models/game'

/** A small, on-demand region manager. No additional Mapbox render loop. */
export function AdministrativeRegions({ city, onClose, onBoundaries }: {
  city: City
  onClose: () => void
  onBoundaries?: (boundaries: AdministrativeBoundaries | null) => void
}) {
  const [boundaries, setBoundaries] = useState<AdministrativeBoundaries | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [query, setQuery] = useState('')
  const licenses = useGameStore((state) => state.territoryLicenses)
  const ledger = useGameStore((state) => state.administrativeExpansionLedger)
  const coverage = useGameStore((state) => state.administrativeRoadCoverage)
  const cash = useGameStore((state) => state.company?.cash ?? 0)
  const explored = useGameStore((state) => state.exploredTerritory)
  const updateCoverage = useGameStore((state) => state.updateAdministrativeCoverage)
  const registerStart = useGameStore((state) => state.registerStartingAdministrativeRegion)
  const purchase = useGameStore((state) => state.purchaseAdministrativeRegion)
  const claim = useGameStore((state) => state.claimAdministrativeCredits)
  const purchaseCountry = useGameStore((state) => state.purchaseCountryTerritory)
  const iso3 = toGeoBoundariesCountryCode(city.countryCode)
  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setBoundaries(null)
    setError('')
    onBoundaries?.(null)
    if (!iso3) {
      setError('This country is not mapped to a boundary dataset yet.')
      setBusy(false)
      return () => { cancelled = true }
    }
    void fetchAdministrativeBoundaries(iso3, city.countryName).then((result) => {
      if (cancelled) return
      setBoundaries(result)
      onBoundaries?.(result)
      const start = regionAtCoordinates(result, city.coordinates)
      if (start) registerStart(start.properties.gameRegionId)
      setBusy(false)
    }).catch((reason: unknown) => {
      if (cancelled) return
      setError(reason instanceof Error ? reason.message : 'Unable to load administrative boundaries')
      setBusy(false)
    })
    return () => { cancelled = true; onBoundaries?.(null) }
  }, [iso3, city.countryName, city.coordinates, onBoundaries, registerStart])
  useEffect(() => {
    if (!boundaries) return
    // Allow the exploration engine to finish merging its latest journey before
    // performing the potentially expensive polygon intersection work.
    const timer = window.setTimeout(() => {
      updateCoverage(calculateAdministrativeTerritoryCoverage(boundaries, explored))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [boundaries, explored, updateCoverage])
  useEffect(() => { claim() }, [claim, coverage])
  const countryOwned = !!iso3 && (ledger?.purchasedCountryIds ?? []).includes(iso3)
  const countryProgress = iso3 ? countryExplorationProgress(iso3, coverage ?? []) : null
  const countryArea = boundaries?.features.reduce((sum, feature) => sum + ((coverage ?? []).find((item) => item.regionId === feature.properties.gameRegionId)?.eligibleAreaKm2 ?? 0), 0) ?? 0
  const countryCost = countryTerritoryCost(countryArea)
  const completeCountryCoverage = !!boundaries && boundaries.features.every((feature) => (coverage ?? []).some((item) => item.regionId === feature.properties.gameRegionId && (item.eligibleAreaKm2 ?? 0) > 0))
  const credits = availableRegionCredits(ledger ?? { creditedRegionIds: [], purchasedRegionIds: [] })
  const filtered = useMemo(() => (boundaries?.features ?? []).filter((feature) =>
    (feature.properties.shapeName ?? '').toLowerCase().includes(query.toLowerCase())
  ), [boundaries, query])
  return <aside aria-label="Administrative regions" style={{
    position: 'absolute', zIndex: 45, right: 12, top: 75, bottom: 90, width: 'min(360px, calc(100vw - 24px))',
    background: 'rgba(5, 30, 39, .97)', color: 'white', border: '1px solid #398f82',
    borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
    boxShadow: '0 15px 50px #0009',
  }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <strong>Administrative regions</strong>
      <button aria-label="Close regions" onClick={onClose}>✕</button>
    </header>
    <small>{city.countryName} · {boundaries?.metadata.divisionName ?? 'Loading boundaries'}</small>
    <div style={{ fontSize: 13 }}>Expansion credits: <strong>{credits}</strong> · New region: €{REGION_PURCHASE_COST.toLocaleString()}</div>
    <small>Earn one credit after discovering 50% of an administrative region's area with taxis.</small>
    {busy && <div role="status">Loading administrative borders…</div>}
    {error && <div role="alert">{error}</div>}
    {boundaries && <>
      <section style={{ padding: 10, border: '1px solid #b99343', borderRadius: 10 }}>
        <strong>Country territory · {city.countryName}</strong>
        <div style={{ fontSize: 12, marginTop: 5 }}>
          {countryOwned ? 'Purchased — all administrative districts unlocked' :
            countryProgress === null ? 'Calculating country exploration…' :
            `${Math.round(countryProgress * 100)}% explored · 25% required`}
        </div>
        {!countryOwned && <button style={{ marginTop: 7 }}
          disabled={!completeCountryCoverage || countryProgress === null || countryProgress < COUNTRY_EXPLORATION_THRESHOLD || cash < countryCost || !Number.isFinite(countryArea) || countryArea <= 0}
          onClick={() => iso3 && purchaseCountry(iso3, countryArea, boundaries.features.length)}>
          Purchase country · €{countryCost.toLocaleString()}
        </button>}
      </section>
      <input aria-label="Search regions" placeholder="Search regions" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div style={{ overflowY: 'auto', flex: 1, display: 'grid', alignContent: 'start', gap: 8 }}>
        {filtered.map((feature) => {
          const id = feature.properties.gameRegionId
          const owned = countryOwned || (licenses ?? []).includes(id)
          const data = (coverage ?? []).find((item) => item.regionId === id)
          const progress = data ? regionRoadProgress(data) : null
          const canBuy = !owned && credits > 0 && cash >= REGION_PURCHASE_COST
          return <div key={id} style={{ border: '1px solid #37565a', padding: 10, borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <strong>{feature.properties.shapeName}</strong>
              <small>{owned ? 'Owned' : 'Locked'}</small>
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{progress === null ? 'Territory coverage unavailable' : `${Math.round(progress * 100)}% territory explored`}</div>
            {!owned && <button style={{ marginTop: 7 }} disabled={!canBuy} onClick={() => purchase(id)}>
              Unlock · €25,000 + 1 credit
            </button>}
          </div>
        })}
      </div>
    </>}
  </aside>
}
