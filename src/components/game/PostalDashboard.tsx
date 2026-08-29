import { useEffect, useMemo, useState } from 'react'
import { getCity } from '../../data/cities'
import { postVehicleModels } from '../../data/postVehicles'
import type { Branch, BusinessContract, City, Company, Driver, PostalPerformance, PostalRoute, PostalRoutePlan, PostalServiceLevel, ResearchId, Vehicle } from '../../models/game'
import { fleetSlotCapacity } from '../../services/companyProgression'
import { createPostalRoute, defaultPostalRoutePlan, postalRouteProgress } from '../../services/postalEngine'
import { hasResearch } from '../../services/research'
import { licensePlateForVehicle } from '../../services/vehicleIdentity'
import { useCurrency } from './CurrencyContext'

type PostalView = 'overview' | 'plan' | 'contracts' | 'fleet'

interface PostalDashboardProps {
  company: Company
  activeCityId: string
  customCities: City[]
  vehicles: Vehicle[]
  drivers: Driver[]
  branches: Branch[]
  completedResearch: ResearchId[]
  garageLevel: number
  contracts: BusinessContract[]
  performance: PostalPerformance
  onClose: () => void
  onShowMap: () => void
  onOpenFleet: () => void
  onOpenCompany: () => void
  onBuyVehicle: (modelId: string) => void
  onStartRoute: (vehicleId: string, plan: PostalRoutePlan) => void
  onAcceptContract: (contractId: string) => void
}

const serviceDetails: Record<PostalServiceLevel, { label: string; description: string; icon: string }> = {
  standard: { label: 'Standard', description: 'Balanced local parcel round', icon: '📦' },
  express: { label: 'Express', description: 'Fewer stops with premium revenue', icon: '⚡' },
  business: { label: 'Business', description: 'Dense commercial collections', icon: '🏢' },
}

const routeSvg = (route: PostalRoute) => {
  const coordinates = route.stops.map((stop) => stop.coordinates)
  const longitudes = coordinates.map(([longitude]) => longitude)
  const latitudes = coordinates.map(([, latitude]) => latitude)
  const minimumLongitude = Math.min(...longitudes)
  const maximumLongitude = Math.max(...longitudes)
  const minimumLatitude = Math.min(...latitudes)
  const maximumLatitude = Math.max(...latitudes)
  const longitudeRange = Math.max(.0001, maximumLongitude - minimumLongitude)
  const latitudeRange = Math.max(.0001, maximumLatitude - minimumLatitude)
  return coordinates.map(([longitude, latitude]) => [
    10 + (longitude - minimumLongitude) / longitudeRange * 180,
    90 - (latitude - minimumLatitude) / latitudeRange * 80,
  ] as const)
}

const timeRemaining = (arrivesAt: string, now: number) => {
  const milliseconds = Math.max(0, new Date(arrivesAt).getTime() - now)
  const minutes = Math.ceil(milliseconds / 60_000)
  return minutes < 1 ? '<1 min' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function PostalDashboard({ company, activeCityId, customCities, vehicles, drivers, branches, completedResearch, garageLevel, contracts, performance, onClose, onShowMap, onOpenFleet, onOpenCompany, onBuyVehicle, onStartRoute, onAcceptContract }: PostalDashboardProps) {
  const { money } = useCurrency()
  const [view, setView] = useState<PostalView>('overview')
  const postalVehicles = vehicles.filter((vehicle) => vehicle.type === 'post')
  const [selectedVehicleId, setSelectedVehicleId] = useState(postalVehicles[0]?.id ?? '')
  const [plan, setPlan] = useState<PostalRoutePlan>(() => defaultPostalRoutePlan())
  const [now, setNow] = useState(Date.now())
  const selectedVehicle = postalVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? postalVehicles[0]
  const selectedCity = getCity(selectedVehicle?.cityId ?? activeCityId, customCities)
  const activeRounds = postalVehicles.filter((vehicle) => vehicle.postalRoute)
  const availableVans = postalVehicles.filter((vehicle) => vehicle.status === 'available')
  const researchCapacity = (hasResearch(completedResearch, 'autonomous-operations') ? 4 : 0) + (hasResearch(completedResearch, 'global-network') ? 4 : 0) + (hasResearch(completedResearch, 'regional-hubs') ? branches.length : 0)
  const fleetCapacity = fleetSlotCapacity(company.level, garageLevel, branches) + researchCapacity
  const fleetFull = vehicles.length >= fleetCapacity
  const onTimePercent = performance.completedRounds ? Math.round(performance.onTimeRounds / performance.completedRounds * 100) : 100
  const postalContracts = contracts.filter((contract) => contract.category === 'postal')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!selectedVehicleId && postalVehicles[0]) setSelectedVehicleId(postalVehicles[0].id)
  }, [postalVehicles, selectedVehicleId])

  const previewRoute = useMemo(() => selectedVehicle && selectedCity
    ? createPostalRoute(selectedVehicle, selectedCity.coordinates, Date.now(), Math.random, plan)
    : null, [plan, selectedCity, selectedVehicle])
  const previewPoints = useMemo(() => previewRoute ? routeSvg(previewRoute) : [], [previewRoute])
  const canDispatch = Boolean(selectedVehicle?.driverId && selectedVehicle.status === 'available' && selectedVehicle.fuel >= 20 && selectedVehicle.condition >= 30)

  const updatePlan = <Key extends keyof PostalRoutePlan>(key: Key, value: PostalRoutePlan[Key]) => setPlan((current) => ({ ...current, [key]: value }))

  return <section className="section-sheet postal-sheet game-panel">
    <button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <header className="postal-heading">
      <div><small>POSTAL OPERATIONS</small><h2>Delivery command centre</h2><p>Plan local rounds, monitor every van, and grow a profitable parcel network.</p></div>
      <span aria-hidden="true">📮</span>
    </header>

    <nav className="postal-tabs" aria-label="Postal sections">
      {(['overview', 'plan', 'contracts', 'fleet'] as const).map((item) => <button className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>
        {item === 'overview' ? 'Command' : item === 'plan' ? 'Plan round' : item === 'contracts' ? 'Tenders' : 'Postal fleet'}
        {item === 'overview' && activeRounds.length > 0 && <b>{activeRounds.length}</b>}
      </button>)}
    </nav>

    {view === 'overview' && <>
      <div className="postal-kpis">
        <article><span>↗</span><small>ACTIVE ROUNDS</small><strong>{activeRounds.length}</strong><em>{availableVans.length} vans ready</em></article>
        <article><span>▦</span><small>PARCELS DELIVERED</small><strong>{performance.deliveredParcels.toLocaleString()}</strong><em>{performance.completedRounds} completed rounds</em></article>
        <article><span>✓</span><small>ON-TIME RATE</small><strong>{onTimePercent}%</strong><em>{performance.distanceKm.toFixed(0)} km covered</em></article>
        <article><span>◆</span><small>POSTAL REVENUE</small><strong>{money.format(performance.revenue)}</strong><em>All-time operations</em></article>
      </div>

      <div className="postal-section-heading"><div><small>LIVE OPERATIONS</small><h3>Rounds in progress</h3></div><button onClick={() => setView('plan')}>＋ Plan a round</button></div>
      <div className="postal-live-list">{activeRounds.length ? activeRounds.map((vehicle) => {
        const route = vehicle.postalRoute!
        const progress = postalRouteProgress(route, now)
        const deliveryStops = Math.max(1, route.stops.length - 2)
        const completedStops = Math.min(deliveryStops, Math.floor(progress * (deliveryStops + 1)))
        const nextStopIndex = Math.min(route.stops.length - 1, Math.max(1, completedStops + 1))
        const driver = drivers.find((candidate) => candidate.id === vehicle.driverId)
        return <article key={vehicle.id}>
          <header><span>🚐</span><div><strong>{vehicle.name}</strong><small>{driver?.name ?? 'Unstaffed'} · {licensePlateForVehicle(vehicle)}</small></div><b>{Math.round(progress * 100)}%</b></header>
          <div className="postal-progress"><i style={{ width: `${progress * 100}%` }} /></div>
          <div className="postal-live-meta"><span><small>NEXT STOP</small><b>{route.stops[nextStopIndex]?.label ?? 'Postal depot'}</b></span><span><small>DELIVERIES</small><b>{completedStops} / {deliveryStops}</b></span><span><small>RETURNING IN</small><b>{timeRemaining(route.arrivesAt, now)}</b></span></div>
          <footer><span>{serviceDetails[route.serviceLevel ?? 'standard'].icon} {serviceDetails[route.serviceLevel ?? 'standard'].label} · {route.parcelCount ?? '—'} parcels · {(route.distanceKm ?? 0).toFixed(1)} km</span><button onClick={onShowMap}>Track on map</button></footer>
        </article>
      }) : <div className="postal-empty"><span>◎</span><strong>No rounds are moving</strong><small>Build a route around {selectedCity?.name ?? 'your station'} and dispatch a staffed postal van.</small><button onClick={() => setView('plan')}>Plan the first round</button></div>}</div>

      <div className="postal-quick-grid">
        <button onClick={() => setView('contracts')}><span>▤</span><strong>{postalContracts.filter((contract) => contract.accepted && !contract.completed).length} active tenders</strong><small>View municipal and commercial work</small></button>
        <button onClick={() => setView('fleet')}><span>🚐</span><strong>{postalVehicles.length} postal vans</strong><small>{postalVehicles.filter((vehicle) => !vehicle.driverId).length} still need a driver</small></button>
      </div>
    </>}

    {view === 'plan' && <div className="postal-planner">
      <div className="postal-planner-controls">
        <div className="postal-section-heading"><div><small>ROUTE BUILDER</small><h3>Configure a delivery round</h3></div></div>
        {postalVehicles.length ? <>
          <label>Dispatch van<select value={selectedVehicle?.id ?? ''} onChange={(event) => setSelectedVehicleId(event.target.value)}>{postalVehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.name} · {vehicle.status === 'available' ? vehicle.driverId ? 'Ready' : 'Driver required' : 'In service'}</option>)}</select></label>
          <div className="postal-service-picker">{(Object.keys(serviceDetails) as PostalServiceLevel[]).map((service) => <button className={plan.serviceLevel === service ? 'selected' : ''} onClick={() => updatePlan('serviceLevel', service)} key={service}><span>{serviceDetails[service].icon}</span><strong>{serviceDetails[service].label}</strong><small>{serviceDetails[service].description}</small></button>)}</div>
          <label><span>Round duration <b>{plan.plannedHours} hours</b></span><input type="range" min="1" max="8" value={plan.plannedHours} onChange={(event) => updatePlan('plannedHours', Number(event.target.value))} /></label>
          <label><span>Service radius <b>{plan.radiusKm} km</b></span><input type="range" min="2" max="30" step="1" value={plan.radiusKm} onChange={(event) => updatePlan('radiusKm', Number(event.target.value))} /></label>
          <label><span>Parcel load <b>{plan.loadPercent}% · {Math.round((selectedVehicle?.capacity ?? 0) * plan.loadPercent / 100)} parcels</b></span><input type="range" min="25" max="100" step="5" value={plan.loadPercent} onChange={(event) => updatePlan('loadPercent', Number(event.target.value))} /></label>
          {!selectedVehicle?.driverId && <button className="postal-warning" onClick={onOpenCompany}>⚠ Assign a driver before dispatching <b>Manage staff →</b></button>}
          {selectedVehicle && selectedVehicle.driverId && (selectedVehicle.fuel < 20 || selectedVehicle.condition < 30) && <button className="postal-warning" onClick={onOpenFleet}>⚠ Van requires fuel or maintenance <b>Open Fleet →</b></button>}
        </> : <div className="postal-empty compact"><span>🚐</span><strong>You need a postal van</strong><small>Buy a purpose-built parcel vehicle to unlock route planning.</small><button onClick={() => setView('fleet')}>Browse postal vans</button></div>}
      </div>

      <div className="postal-route-preview">
        <header><div><small>ROUTE PREVIEW</small><strong>{selectedCity?.name ?? 'Local'} {serviceDetails[plan.serviceLevel].label} Round</strong></div><button disabled={!previewRoute} onClick={() => updatePlan('seed', Math.floor(Math.random() * 2_147_483_647))}>↻ Regenerate</button></header>
        {previewRoute ? <>
          <div className="postal-mini-map">
            <svg viewBox="0 0 200 100" role="img" aria-label={`Preview with ${previewRoute.stops.length - 2} delivery stops`}>
              <defs><linearGradient id="postal-route-gradient" x1="0" x2="1"><stop stopColor="#fbbf24" /><stop offset="1" stopColor="#fb7185" /></linearGradient></defs>
              <path d={`M ${previewPoints.map(([x, y]) => `${x} ${y}`).join(' L ')}`} />
              {previewPoints.slice(1, -1).map(([x, y], index) => <circle cx={x} cy={y} r="2.2" key={index} />)}
              {previewPoints[0] && <rect x={previewPoints[0][0] - 3.5} y={previewPoints[0][1] - 3.5} width="7" height="7" rx="2" />}
            </svg>
            <span>📮 Depot</span><b>{previewRoute.stops.length - 2} stops</b>
          </div>
          <div className="postal-preview-metrics">
            <span><small>DISTANCE</small><b>{previewRoute.distanceKm?.toFixed(1)} km</b></span>
            <span><small>PARCELS</small><b>{previewRoute.parcelCount}</b></span>
            <span><small>DURATION</small><b>{previewRoute.plannedHours}h</b></span>
            <span><small>EXPECTED REVENUE</small><b>{money.format(previewRoute.reward)}</b></span>
          </div>
          <div className="postal-route-manifest"><small>MANIFEST</small><p>{serviceDetails[plan.serviceLevel].icon} {serviceDetails[plan.serviceLevel].label} service across a {plan.radiusKm} km radius, returning to the same depot automatically.</p><span><b>Capacity</b><i><em style={{ width: `${plan.loadPercent}%` }} /></i><strong>{plan.loadPercent}%</strong></span></div>
          <button className="postal-dispatch" disabled={!canDispatch} onClick={() => selectedVehicle && onStartRoute(selectedVehicle.id, plan)}>{!selectedVehicle?.driverId ? 'Driver required' : selectedVehicle?.status !== 'available' ? 'Van is already assigned' : selectedVehicle.fuel < 20 || selectedVehicle.condition < 30 ? 'Service van before dispatch' : `Dispatch round · ${money.format(previewRoute.reward)}`}</button>
        </> : <div className="postal-preview-placeholder"><span>⌁</span><p>Select a postal van to generate its route preview.</p></div>}
      </div>
    </div>}

    {view === 'contracts' && <>
      <div className="postal-section-heading"><div><small>CONTRACT BOARD</small><h3>Postal tenders</h3></div></div>
      <p className="postal-intro">Accept delivery commitments for bonus payments. Every completed postal round advances matching tenders.</p>
      <div className="postal-contracts">{postalContracts.length ? postalContracts.map((contract) => {
        const expired = new Date(contract.expiresAt).getTime() <= now
        const remainingMinutes = Math.max(0, Math.ceil((new Date(contract.expiresAt).getTime() - now) / 60_000))
        return <article className={contract.accepted ? 'accepted' : ''} key={contract.id}><header><span>▤</span><div><small>{contract.accepted ? 'ACTIVE TENDER' : 'AVAILABLE TENDER'}</small><strong>{contract.name}</strong></div><b>{contract.completed ? '✓ Complete' : expired ? 'Expired' : `${remainingMinutes}m left`}</b></header><p>{contract.description}</p><div className="postal-contract-progress"><i><em style={{ width: `${Math.min(100, contract.progress / contract.target * 100)}%` }} /></i><span>{contract.progress} / {contract.target} rounds</span></div><footer><strong>{contract.reward ? money.format(contract.reward) : 'Reward paid'}</strong>{!contract.accepted && !expired && <button onClick={() => onAcceptContract(contract.id)}>Accept tender</button>}</footer></article>
      }) : <div className="postal-empty"><span>▤</span><strong>No postal tenders available</strong><small>New business opportunities will appear as your company grows.</small></div>}</div>
    </>}

    {view === 'fleet' && <>
      <div className="postal-section-heading"><div><small>POSTAL FLEET</small><h3>Vehicles and capacity</h3></div><button onClick={onOpenFleet}>Manage all vehicles</button></div>
      <div className="postal-capacity"><span><small>GARAGE CAPACITY</small><b>{vehicles.length} / {fleetCapacity} slots</b></span><i><em style={{ width: `${Math.min(100, vehicles.length / fleetCapacity * 100)}%` }} /></i></div>
      {postalVehicles.length > 0 && <div className="postal-owned-fleet">{postalVehicles.map((vehicle) => { const driver = drivers.find((candidate) => candidate.id === vehicle.driverId); return <article key={vehicle.id}><span>🚐</span><div><strong>{vehicle.name}</strong><small>{licensePlateForVehicle(vehicle)} · {vehicle.capacity} parcels</small><em>{driver?.name ?? '⚠ Driver required'} · {Math.round(vehicle.fuel)}% energy · {Math.round(vehicle.condition)}% condition</em></div><b className={vehicle.status}>{vehicle.postalRoute ? 'Delivering' : vehicle.status === 'available' ? 'Ready' : 'Service'}</b></article> })}</div>}
      <div className="postal-section-heading marketplace"><div><small>VEHICLE MARKETPLACE</small><h3>Expand postal capacity</h3></div></div>
      <div className="postal-marketplace">{postVehicleModels.map((model) => <article key={model.id}><div className="postal-van-art"><span>🚐</span><b>{model.powertrain === 'electric' ? 'ELECTRIC' : 'DIESEL'}</b></div><div className="postal-model-copy"><small>{model.brand.toUpperCase()}</small><strong>{model.name}</strong><p>{model.description}</p><div><span><b>{model.capacity}</b><small>PARCELS</small></span><span><b>{model.topSpeedKmh}</b><small>KM/H</small></span><span><b>{model.powertrain === 'electric' ? 'Zero' : 'Standard'}</b><small>TAILPIPE</small></span></div></div><footer><strong>{money.format(model.price)}</strong><button disabled={company.cash < model.price || fleetFull} onClick={() => onBuyVehicle(model.id)}>{fleetFull ? 'Garage full' : company.cash < model.price ? 'Insufficient cash' : 'Buy postal van'}</button></footer></article>)}</div>
    </>}
  </section>
}
