import { transportModels } from '../../data/transport'
import type { Company, FerryRouteOption, PurchasedHarbour, TransportAsset, TransportRoute } from '../../models/game'
import { harbourId } from '../../services/maritimeRoutes'
import { useCurrency } from './CurrencyContext'

interface FerryDispatchProps {
  company: Company
  purchasedHarbours: PurchasedHarbour[]
  discoveredRoutes: FerryRouteOption[]
  transportAssets: TransportAsset[]
  transportRoutes: TransportRoute[]
  onPlaceHarbour: () => void
  onBuyFerry: () => void
  onCreateRoute: (route: FerryRouteOption) => void
  onDispatch: (routeId: string, assetId: string) => void
  onSetTimetable: (routeId: string, departureHour: number, frequencyHours: number) => void
  onClose: () => void
}

const HARBOUR_PRICE = 5_000

export function FerryDispatch({ company, purchasedHarbours, discoveredRoutes, transportAssets, transportRoutes, onPlaceHarbour, onBuyFerry, onCreateRoute, onDispatch, onSetTimetable, onClose }: FerryDispatchProps) {
  const { money } = useCurrency()
  const ownedHarbourIds = new Set(purchasedHarbours.map((harbour) => harbour.id))
  const routeHarbourId = (route: FerryRouteOption) => route.harbourId ?? harbourId(route.originCoordinates)
  const availableRoutes = discoveredRoutes.filter((route) => ownedHarbourIds.has(routeHarbourId(route)))
  const localRoutes = transportRoutes.filter((route) => route.mode === 'ferry')
  const ferries = transportAssets.filter((asset) => asset.mode === 'ferry')
  const availableFerries = ferries.filter((asset) => asset.status === 'available')
  const activeFerries = ferries.filter((asset) => asset.journey)
  const activeRouteIds = new Set(activeFerries.flatMap((asset) => asset.journey ? [asset.journey.routeId] : []))
  const model = transportModels.ferry
  const routeAlreadyOwned = (route: FerryRouteOption) => localRoutes.some((owned) => owned.sourceRouteId === route.id)

  return <section className="section-sheet ferry-sheet game-panel" aria-labelledby="ferry-dispatch-title" aria-live="polite">
    <div className="sheet-handle" />
    <button className="sheet-close" onClick={onClose} aria-label="Close ferry dispatch">×</button>
    <header className="ferry-heading">
      <div><small>MARITIME OPERATIONS</small><h2 id="ferry-dispatch-title">Ferry dispatch</h2><p>Place your own harbour marker, then operate only the routes found at that point.</p></div>
      <span className="ferry-heading-icon" aria-hidden="true">⛴</span>
    </header>

    <div className="ferry-summary">
      <article><small>HARBOUR</small><strong>{purchasedHarbours.length ? `${purchasedHarbours.length} owned` : 'Choose one below'}</strong></article>
      <article><small>FLEET</small><strong>{ferries.length} owned</strong></article>
      <article><small>ACTIVE</small><strong>{activeFerries.length} underway</strong></article>
    </div>

    <h3>Your harbours</h3>
    <div className="ferry-destinations harbour-market">
      {purchasedHarbours.map((harbour) => <article key={harbour.id}><span aria-hidden="true">⚓</span><div><strong>{harbour.name}</strong><small>{availableRoutes.filter((route) => routeHarbourId(route) === harbour.id).length} routes discovered from this point</small></div><button disabled>Placed</button></article>)}
      {!purchasedHarbours.length && <div className="ferry-empty"><strong>No harbours placed</strong><small>Place your first harbour inside owned territory to discover its routes.</small></div>}
    </div>
    <button disabled={company.cash < HARBOUR_PRICE} onClick={onPlaceHarbour}>{company.cash < HARBOUR_PRICE ? 'Not enough cash' : `Place harbour on map · ${money.format(HARBOUR_PRICE)}`}</button>

    <article className={`mode-card harbour-card ${purchasedHarbours.length ? 'available' : ''}`}>
      <header><span>⛴</span><div><strong>Ferry fleet</strong><small>Ferries serve routes created from harbours you own.</small></div></header>
      <div className="mode-stats"><span>{availableFerries.length} ready</span><span>{model.speedKmh} km/h</span></div>
      <button disabled={!purchasedHarbours.length || company.cash < model.price} onClick={onBuyFerry}>{!purchasedHarbours.length ? 'Purchase a harbour first' : company.cash < model.price ? 'Not enough cash' : `Buy ${model.model} · ${money.format(model.price)}`}</button>
    </article>

    <h3>Destinations from owned harbours</h3>
    <div className="ferry-destinations">
      {availableRoutes.length ? availableRoutes.map((route) => {
        const owned = routeAlreadyOwned(route)
        return <article key={route.id}><span aria-hidden="true">⚓</span><div><strong>{route.destinationName}</strong><small>from {route.originName} · {route.distanceKm.toFixed(1)} km{route.durationMinutes ? ` · ${Math.round(route.durationMinutes)} min` : ''}</small></div><button disabled={owned} onClick={() => onCreateRoute(route)}>{owned ? 'Route created' : 'Create route'}</button></article>
      }) : <div className="ferry-empty"><strong>Place a harbour to discover routes</strong><small>Only routes starting near one of your placed harbour points become available.</small></div>}
    </div>

    <h3>Route dispatch</h3>
    <div className="ferry-route-list">
      {localRoutes.length ? localRoutes.map((route) => <article className="route-card" key={route.id}>
        <span className="route-mode" aria-hidden="true">⛴</span>
        <span><strong>{route.name}</strong><small>{activeRouteIds.has(route.id) ? 'Ferry underway · vehicles may use this crossing' : `${money.format(route.ticketPrice)} ticket · ${String(route.departureHour ?? 9).padStart(2, '0')}:00 / ${route.frequencyHours ?? 6}h`}</small></span>
        <button className="timetable-button" onClick={() => onSetTimetable(route.id, ((route.departureHour ?? 9) + 1) % 24, route.frequencyHours === 3 ? 6 : 3)}>⏱</button>
        <select aria-label={`Dispatch a ferry on ${route.name}`} disabled={activeRouteIds.has(route.id)} defaultValue="" onChange={(event) => { if (event.target.value) onDispatch(route.id, event.target.value); event.target.value = '' }}><option value="">{activeRouteIds.has(route.id) ? 'Operating' : 'Dispatch ferry…'}</option>{availableFerries.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>
      </article>) : <div className="ferry-empty"><strong>No operating routes</strong><small>Create one from an owned harbour destination above.</small></div>}
    </div>

    {activeFerries.length > 0 && <><h3>Live services</h3><div className="active-services">{activeFerries.map((asset) => <div key={asset.id}><span aria-hidden="true">⛴</span><b>{asset.name}</b><small>to {asset.journey?.destinationName ?? 'harbour'} · {money.format(asset.journey?.reward ?? 0)} each crossing · continuous shuttle</small></div>)}</div></>}
  </section>
}
