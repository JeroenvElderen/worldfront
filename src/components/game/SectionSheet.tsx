import type { Section } from '../../stores/gameStore'
import { useEffect, useState } from 'react'
import { taxiModels } from '../../data/taxis'
import type { Passenger, TaxiJob, TaxiPowertrain, Vehicle } from '../../models/game'
import { getJobJourney, JOB_REQUEST_INTERVAL_MS } from '../../services/jobEngine'

interface SectionSheetProps { section: Exclude<Section, 'map'>; focusedJobId: string | null; vehicles: Vehicle[]; jobs: TaxiJob[]; passengers: Passenger[]; cash: number; jobsLoading: boolean; jobsError: string | null; onClose: () => void; onReset: () => void; onRefreshJobs: () => void; onAcceptJob: (jobId: string) => void; onBuyTaxi: (powertrain: TaxiPowertrain) => void }
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const distanceKm = (from: [number, number], to: [number, number]) => {
  const latitude = (to[1] - from[1]) * 111.32
  const longitude = (to[0] - from[0]) * 111.32 * Math.cos(((from[1] + to[1]) / 2) * Math.PI / 180)
  return Math.hypot(latitude, longitude)
}

export function SectionSheet({ section, focusedJobId, vehicles, jobs, passengers, cash, jobsLoading, jobsError, onClose, onReset, onRefreshJobs, onAcceptJob, onBuyTaxi }: SectionSheetProps) {
  const [selectedTaxi, setSelectedTaxi] = useState<TaxiPowertrain>('diesel')
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (section !== 'jobs') return
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [section])
  if (section === 'jobs') {
    const activeJobs = jobs.filter((job) => job.status === 'accepted')
    const offers = jobs.filter((job) => job.status === 'offered').sort((left, right) => Number(right.id === focusedJobId) - Number(left.id === focusedJobId))
    return <section className="section-sheet jobs-sheet game-panel">
      <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
      <small>JOBS</small><h2>{activeJobs.length ? `${activeJobs.length} trip${activeJobs.length === 1 ? '' : 's'} in progress` : 'Taxi requests'}</h2>
      {activeJobs.map((activeJob) => { const vehicle = vehicles.find((candidate) => candidate.id === activeJob.assignedVehicleId); const journey = vehicle ? getJobJourney(activeJob, vehicle) : null; const pickingUp = Boolean(journey && now < journey.pickupAt); const secondsRemaining = journey ? Math.max(0, Math.ceil((journey.arrivesAt - now) / 1_000)) : 0; return <article className="active-job" key={activeJob.id}>
        <div className="job-route"><span>●</span><div><strong>{activeJob.pickupLabel}</strong><i /><strong>{activeJob.destinationLabel}</strong></div></div>
        <div className="job-meta"><span>{vehicles.find((vehicle) => vehicle.id === activeJob.assignedVehicleId)?.name ?? 'Taxi'}</span><span>{activeJob.distanceKm} km</span><span>~{activeJob.durationMinutes} min</span><b>{money.format(activeJob.fare)}</b></div>
        <button className="primary-action" disabled>{pickingUp ? 'Driving to pickup' : 'Passenger on board'} · {Math.ceil(secondsRemaining / 60)} min</button>
      </article> })}
      <>
        <p>Every request is invented by AI for your city. A new one arrives every {JOB_REQUEST_INTERVAL_MS / 1000} seconds.</p>
        {jobsError && <p className="job-error" role="alert">{jobsError}</p>}
        <div className="job-list">{offers.length === 0 && <p className="job-empty" role="status">{jobsLoading ? 'AI is finding a nearby passenger…' : 'No open requests yet.'}</p>}{offers.map((job) => {
          const passenger = passengers.find((candidate) => job.passengerIds.includes(candidate.id))
          const nearbyTaxis = vehicles.filter((vehicle) => vehicle.status === 'available' && vehicle.position).map((vehicle) => ({ vehicle, distance: distanceKm(vehicle.position!, job.pickup) })).sort((left, right) => left.distance - right.distance).slice(0, 3)
          return <article className={`job-card${job.id === focusedJobId ? ' focused' : ''}`} key={job.id}>
            <div><strong>{job.pickupLabel} → {job.destinationLabel}</strong><small>{passenger?.name ?? 'Passenger'} · party of {passenger?.partySize ?? 1}</small></div>
            <div className="job-meta"><span>{job.distanceKm} km</span><span>~{job.durationMinutes} min</span><b>{money.format(job.fare)}</b></div>
            <div className="nearby-taxis"><small>NEARBY TAXIS</small>{nearbyTaxis.length ? nearbyTaxis.map(({ vehicle, distance }) => <span key={vehicle.id}>{vehicle.name} <b>{distance.toFixed(1)} km away</b></span>) : <span>No available taxis nearby</span>}</div>
            <button disabled={!vehicles.some((vehicle) => vehicle.status === 'available')} onClick={() => onAcceptJob(job.id)}>{vehicles.some((vehicle) => vehicle.status === 'available') ? 'Accept fare' : 'All taxis busy'}</button>
          </article>
        })}</div>
        <button className="refresh-link" disabled={jobsLoading} onClick={onRefreshJobs}>{jobsLoading ? 'Finding requests in the background…' : '✦ Find more requests'}</button>
      </>
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
    <div className="fleet-list">{vehicles.map((vehicle) => <article className="fleet-card" key={vehicle.id}><span>{taxiModels.find((model) => model.id === (vehicle.powertrain ?? 'diesel'))?.icon ?? '🚕'}</span><div><strong>{vehicle.name}</strong><small>{vehicle.condition}% condition · {vehicle.status === 'on-job' ? 'Driving' : 'Available'} · {vehicle.powertrain ?? 'diesel'}</small></div></article>)}</div>
    <small className="purchase-label">CHOOSE YOUR NEXT TAXI</small>
    <div className="taxi-shop">{taxiModels.map((model) => <button className={selectedTaxi === model.id ? 'selected' : ''} key={model.id} onClick={() => setSelectedTaxi(model.id)}>
      <span>{model.icon}</span><strong>{model.name}</strong><small>{model.description}<br />{model.capacity} seats · up to {model.topSpeedKmh} km/h</small><b>{money.format(model.price)}</b>
    </button>)}</div>
    {(() => { const model = taxiModels.find((taxi) => taxi.id === selectedTaxi) ?? taxiModels[0]; return <button className="primary-action" disabled={cash < model.price} onClick={() => onBuyTaxi(model.id)}>{cash < model.price ? 'Not enough cash' : `Buy ${model.name}`}</button> })()}
  </section>
  return <section className="section-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>{section.toUpperCase()}</small><h2>{content[0]}</h2><p>{content[1]}</p>
    {section === 'company' && <button className="danger-link" onClick={onReset}>Start a new company</button>}
  </section>
}
