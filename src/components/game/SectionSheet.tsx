import type { Section } from '../../stores/gameStore'
import { useEffect, useState } from 'react'
import { taxiModels } from '../../data/taxis'
import type { ExteriorAccessory, Passenger, TaxiJob, Vehicle } from '../../models/game'
import { distanceKmBetween, getJobJourney, MAX_PICKUP_DISTANCE_KM } from '../../services/jobEngine'

interface SectionSheetProps { section: Exclude<Section, 'map'>; focusedJobId: string | null; vehicles: Vehicle[]; jobs: TaxiJob[]; passengers: Passenger[]; cash: number; jobsLoading: boolean; jobsError: string | null; onClose: () => void; onReset: () => void; onRefreshJobs: () => void; onAcceptJob: (jobId: string) => void; onDeclineJob: (jobId: string) => void; onBuyTaxi: (modelId: string) => void; onToggleAccessory: (vehicleId: string, accessory: ExteriorAccessory) => void }
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const exteriorAccessories: Array<{ id: ExteriorAccessory; label: string; icon: string }> = [
  { id: 'panoramic-roof', label: 'Panoramic roof', icon: '🌅' }, { id: 'towbar', label: 'Towbar', icon: '🪝' },
  { id: 'roof-rack', label: 'Roof rack', icon: '🧳' }, { id: 'mud-flaps', label: 'Mud flaps', icon: '💦' },
  { id: 'wind-deflectors', label: 'Wind deflectors', icon: '🌬️' },
]
const getModel = (vehicle: Vehicle) => taxiModels.find((model) => model.id === vehicle.modelId || (!vehicle.modelId && model.powertrain === vehicle.powertrain))

export function SectionSheet({ section, focusedJobId, vehicles, jobs, passengers, cash, jobsLoading, jobsError, onClose, onReset, onRefreshJobs, onAcceptJob, onDeclineJob, onBuyTaxi, onToggleAccessory }: SectionSheetProps) {
  const [selectedTaxi, setSelectedTaxi] = useState(taxiModels[0].id)
  const [customizingVehicleId, setCustomizingVehicleId] = useState(vehicles[0]?.id ?? '')
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (section !== 'jobs' || !jobs.some((job) => job.status === 'accepted')) return
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [section, jobs])
  if (section === 'jobs') {
    const activeJobs = jobs.filter((job) => job.status === 'accepted')
    const offers = jobs.filter((job) => job.status === 'offered').sort((left, right) => Number(right.id === focusedJobId) - Number(left.id === focusedJobId))
    return <section className="section-sheet jobs-sheet game-panel">
      <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
      <small>JOBS</small><h2>{offers.length ? `Choose from ${offers.length} client${offers.length === 1 ? '' : 's'}` : 'Taxi requests'}</h2>
      {activeJobs.map((job) => { const vehicle = vehicles.find((candidate) => candidate.id === job.assignedVehicleId); const journey = vehicle ? getJobJourney(job, vehicle) : null; const pickingUp = Boolean(journey && now < journey.pickupAt); const minutesRemaining = journey ? Math.max(0, Math.ceil((journey.arrivesAt - now) / 60_000)) : 0; return <article className="active-job" key={job.id}>
        <div className="job-route"><span>●</span><div><strong>{job.pickupLabel}</strong><i /><strong>{job.destinationLabel}</strong></div></div>
        <div className="job-meta"><span>{vehicle?.name ?? 'Taxi'}</span><span>{job.distanceKm} km</span><b>{money.format(job.fare)}</b></div>
        <button className="primary-action" disabled>{pickingUp ? 'Driving to pickup' : 'Passenger on board'} · {minutesRemaining} min</button>
      </article> })}
      {jobsError && <p className="job-error" role="alert">{jobsError}</p>}
      <div className="job-list">{offers.length === 0 && <p className="job-empty" role="status">{jobsLoading ? 'Searching for nearby clients…' : 'No clients are close enough to an available taxi.'}</p>}{offers.map((job) => {
        const passenger = passengers.find((candidate) => job.passengerIds.includes(candidate.id))
        const nearbyTaxis = vehicles.filter((vehicle) => vehicle.status === 'available' && vehicle.position).map((vehicle) => ({ vehicle, distance: distanceKmBetween(vehicle.position!, job.pickup) })).filter(({ distance }) => distance <= MAX_PICKUP_DISTANCE_KM).sort((left, right) => left.distance - right.distance)
        return <article className={`job-card${job.id === focusedJobId ? ' focused' : ''}`} key={job.id}>
          <div><strong>{job.pickupLabel} → {job.destinationLabel}</strong><small>{passenger?.name ?? 'Passenger'} · party of {passenger?.partySize ?? 1}</small></div>
          <div className="job-meta"><span>{job.distanceKm} km</span><span>~{job.durationMinutes} min</span><b>{money.format(job.fare)}</b></div>
          <div className="nearby-taxis"><small>AVAILABLE TAXIS</small>{nearbyTaxis.map(({ vehicle, distance }) => <span key={vehicle.id}>{vehicle.name}<b>{distance.toFixed(1)} km away</b></span>)}</div>
          <div className="job-card-actions"><button className="decline-call" onClick={() => onDeclineJob(job.id)}>Remove</button><button onClick={() => onAcceptJob(job.id)}>Accept client</button></div>
        </article>
      })}</div>
      <button className="refresh-link" disabled={jobsLoading} onClick={onRefreshJobs}>{jobsLoading ? 'Finding clients…' : '✦ Find another client'}</button>
    </section>
  }
  const content = {
    fleet: [`${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} in your fleet`, vehicles[0] ? `${vehicles[0].name} · ${vehicles[0].condition}% condition · ${vehicles[0].status}` : 'Purchase your first vehicle.'],
    travel: ['Travel agency locked', 'Reach company level 3 to begin creating tours.'],
    company: ['Your company', 'Manage finances, staff and expansion from here.'],
  }[section]
  if (section === 'fleet') return <section className="section-sheet fleet-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>FLEET</small><h2>{vehicles.length} taxi{vehicles.length === 1 ? '' : 's'} on the road</h2>
    <div className="fleet-list">{vehicles.map((vehicle) => { const model = getModel(vehicle); return <button className={`fleet-card ${customizingVehicleId === vehicle.id ? 'selected' : ''}`} onClick={() => setCustomizingVehicleId(vehicle.id)} key={vehicle.id}>{model ? <img className="brand-logo" src={model.logoUrl} alt={`${model.brand} logo`} /> : <span className="brand-fallback">TAXI</span>}<div><strong>{vehicle.name}</strong><small>{vehicle.condition}% condition · {vehicle.status === 'on-job' ? 'Driving' : 'Available'} · {vehicle.powertrain ?? 'diesel'}</small></div></button> })}</div>
    {vehicles.find((vehicle) => vehicle.id === customizingVehicleId) && <><small className="purchase-label">CUSTOMISE EXTERIOR</small><div className="accessory-grid">{exteriorAccessories.map((accessory) => { const vehicle = vehicles.find((candidate) => candidate.id === customizingVehicleId)!; const fitted = (vehicle.exteriorAccessories ?? []).includes(accessory.id); return <button className={fitted ? 'fitted' : ''} key={accessory.id} onClick={() => onToggleAccessory(vehicle.id, accessory.id)}><span>{accessory.icon}</span><strong>{accessory.label}</strong><small>{fitted ? 'Fitted · tap to remove' : 'Tap to fit'}</small></button> })}</div></>}
    <small className="purchase-label">CHOOSE YOUR NEXT TAXI</small>
    <div className="taxi-shop">{taxiModels.map((model) => <button className={selectedTaxi === model.id ? 'selected' : ''} key={model.id} onClick={() => setSelectedTaxi(model.id)}>
      <img className="brand-logo" src={model.logoUrl} alt={`${model.brand} logo`} loading="lazy" /><strong>{model.brand} {model.name}</strong><small>{model.description}<br />{model.powertrain} · {model.capacity} seats · {model.topSpeedKmh} km/h</small><b>{money.format(model.price)}</b>
    </button>)}</div>
    {(() => { const model = taxiModels.find((taxi) => taxi.id === selectedTaxi) ?? taxiModels[0]; return <button className="primary-action" disabled={cash < model.price} onClick={() => onBuyTaxi(model.id)}>{cash < model.price ? 'Not enough cash' : `Buy ${model.name}`}</button> })()}
  </section>
  return <section className="section-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>{section.toUpperCase()}</small><h2>{content[0]}</h2><p>{content[1]}</p>
    {section === 'company' && <button className="danger-link" onClick={onReset}>Start a new company</button>}
  </section>
}
