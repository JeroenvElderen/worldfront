import { useEffect, useState } from 'react'
import { getCity } from '../../data/cities'
import { transportModels } from '../../data/transport'
import type { City, Company, DiscoveredFerryRoute, FerryRouteOption, TransportAsset, TransportRoute } from '../../models/game'
import { discoverFerryRoutes } from '../../services/maritimeRoutes'
import { useCurrency } from './CurrencyContext'

interface FerryDispatchProps {
  company: Company
  activeCityId: string
  customCities: City[]
  discoveredRoutes: DiscoveredFerryRoute[]
  transportAssets: TransportAsset[]
  transportRoutes: TransportRoute[]
  onSaveDiscovery: (cityId: string, routes: FerryRouteOption[]) => void
  onBuyFerry: () => void
  onCreateRoute: (route: FerryRouteOption) => void
  onDispatch: (routeId: string, assetId: string) => void
  onSetTimetable: (routeId: string, departureHour: number, frequencyHours: number) => void
  onClose: () => void
}

export function FerryDispatch({ company, activeCityId, customCities, discoveredRoutes, transportAssets, transportRoutes, onSaveDiscovery, onBuyFerry, onCreateRoute, onDispatch, onSetTimetable, onClose }: FerryDispatchProps) {
  const { money } = useCurrency()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeCity = getCity(activeCityId, customCities)
  const localDiscoveries = discoveredRoutes.filter((route) => route.cityId === activeCityId)
  const localRoutes = transportRoutes.filter((route) => route.mode === 'ferry' && route.fromCityId === activeCityId)
  const ferries = transportAssets.filter((asset) => asset.mode === 'ferry')
  const availableFerries = ferries.filter((asset) => asset.status === 'available' && asset.cityId === activeCityId)
  const activeFerries = ferries.filter((asset) => asset.journey)
  const activeRouteIds = new Set(activeFerries.flatMap((asset) => asset.journey ? [asset.journey.routeId] : []))
  const model = transportModels.ferry

  useEffect(() => {
    if (!activeCity || localDiscoveries.length) return
    const abortController = new AbortController()
    setLoading(true)
    setError(null)
    void discoverFerryRoutes(activeCity.coordinates, abortController.signal)
      .then((routes) => {
        if (abortController.signal.aborted) return
        onSaveDiscovery(activeCity.id, routes)
        setLoading(false)
      })
      .catch((reason) => {
        if ((reason as Error).name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Could not discover ferry services.')
        setLoading(false)
      })
    return () => abortController.abort()
  }, [activeCity, localDiscoveries.length, onSaveDiscovery])

  const originName = localDiscoveries[0]?.originName
  const routeAlreadyOwned = (route: DiscoveredFerryRoute) => localRoutes.some((owned) => owned.sourceRouteId === route.id)

  return <section className="section-sheet ferry-sheet game-panel" aria-labelledby="ferry-dispatch-title" aria-live="polite">
    <div className="sheet-handle" />
    <button className="sheet-close" onClick={onClose} aria-label="Close ferry dispatch">×</button>
    <header className="ferry-heading">
      <div><small>MARITIME OPERATIONS</small><h2 id="ferry-dispatch-title">Ferry dispatch</h2><p>Discover ports once, build corridors, and keep boats running as continuous shuttles.</p></div>
      <span className="ferry-heading-icon" aria-hidden="true">⛴</span>
    </header>

    <div className="ferry-summary">
      <article><small>HARBOUR</small><strong>{originName ?? (loading ? 'Searching…' : 'Not found')}</strong></article>
      <article><small>FLEET</small><strong>{ferries.length} owned</strong></article>
      <article><small>ACTIVE</small><strong>{activeFerries.length} underway</strong></article>
    </div>

    <article className={`mode-card harbour-card ${localDiscoveries.length ? 'available' : ''}`}>
      <header><span>⚓</span><div><strong>{originName ? `${originName} is yours` : 'Discovering the nearest harbour'}</strong><small>{loading ? 'Reading mapped passenger ferry corridors…' : error ? error : localDiscoveries.length ? `${localDiscoveries.length} destination${localDiscoveries.length === 1 ? '' : 's'} saved permanently on your map` : 'No passenger ferry service found within 45 km'}</small></div></header>
      <div className="mode-stats"><span>{availableFerries.length} ready here</span><span>{model.speedKmh} km/h</span><span>{localDiscoveries.some((route) => route.source === 'openstreetmap') ? 'Mapped services' : 'Verified corridors'}</span></div>
      <button disabled={!localDiscoveries.length || company.cash < model.price} onClick={onBuyFerry}>{!localDiscoveries.length ? 'Requires a discovered harbour' : company.cash < model.price ? 'Not enough cash' : `Buy ${model.model} · ${money.format(model.price)}`}</button>
    </article>

    <h3>Discovered destinations</h3>
    <div className="ferry-destinations">
      {localDiscoveries.length ? localDiscoveries.map((route) => {
        const owned = routeAlreadyOwned(route)
        return <article key={route.id}><span aria-hidden="true">⚓</span><div><strong>{route.destinationName}</strong><small>{route.originName} · {route.distanceKm.toFixed(1)} km{route.durationMinutes ? ` · ${Math.round(route.durationMinutes)} min` : ''}</small></div><button disabled={owned} onClick={() => onCreateRoute(route)}>{owned ? 'Route created' : 'Create route'}</button></article>
      }) : <div className="ferry-empty"><strong>{loading ? 'Scanning the coastline' : 'No ferry destinations yet'}</strong><small>{error ?? 'A discovered route will stay saved and marked on the map.'}</small></div>}
    </div>

    <h3>Route dispatch</h3>
    <div className="ferry-route-list">
      {localRoutes.length ? localRoutes.map((route) => <article className="route-card" key={route.id}>
        <span className="route-mode" aria-hidden="true">⛴</span>
        <span><strong>{route.name}</strong><small>{activeRouteIds.has(route.id) ? 'Ferry underway · vehicles may use this crossing' : `${money.format(route.ticketPrice)} ticket · ${String(route.departureHour ?? 9).padStart(2, '0')}:00 / ${route.frequencyHours ?? 6}h`}</small></span>
        <button className="timetable-button" onClick={() => onSetTimetable(route.id, ((route.departureHour ?? 9) + 1) % 24, route.frequencyHours === 3 ? 6 : 3)}>⏱</button>
        <select aria-label={`Dispatch a ferry on ${route.name}`} disabled={activeRouteIds.has(route.id)} defaultValue="" onChange={(event) => { if (event.target.value) onDispatch(route.id, event.target.value); event.target.value = '' }}><option value="">{activeRouteIds.has(route.id) ? 'Operating' : 'Dispatch ferry…'}</option>{availableFerries.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>
      </article>) : <div className="ferry-empty"><strong>No operating routes</strong><small>Create one from a discovered destination above.</small></div>}
    </div>

    {activeFerries.length > 0 && <><h3>Live services</h3><div className="active-services">{activeFerries.map((asset) => <div key={asset.id}><span aria-hidden="true">⛴</span><b>{asset.name}</b><small>to {asset.journey?.destinationName ?? 'harbour'} · {money.format(asset.journey?.reward ?? 0)} each crossing · continuous shuttle</small></div>)}</div></>}
  </section>
}
