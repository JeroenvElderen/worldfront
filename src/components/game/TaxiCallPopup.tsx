import { useEffect, useState } from 'react'
import type { Passenger, TaxiJob, Vehicle } from '../../models/game'
import { distanceKmBetween, jobOfferExpiresAt } from '../../services/jobEngine'
import { categoryDetails, vehicleCanTakeJob } from '../../services/earlyGameEngine'
import { travelOperationFor } from '../../services/travelOperations'

interface TaxiCallPopupProps {
  focusedJobId: string | null
  vehicles: Vehicle[]
  jobs: TaxiJob[]
  passengers: Passenger[]
  onAccept: (jobId: string) => void
  onDecline: (jobId: string) => void
  onViewMap: (jobId: string) => void
  onClose: () => void
}

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const remainingTime = (job: TaxiJob, now: number) => {
  const seconds = Math.max(0, Math.ceil((jobOfferExpiresAt(job) - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function TaxiCallPopup({ focusedJobId, vehicles, jobs, passengers, onAccept, onDecline, onViewMap, onClose }: TaxiCallPopupProps) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [])
  const availableTaxis = vehicles.filter((vehicle) => vehicle.type === 'taxi' && vehicle.status === 'available')
  const offers = jobs.filter((job) => job.status === 'offered')
  const activeJobs = jobs.filter((job) => job.status === 'accepted')
  const staffedTaxis = vehicles.filter((vehicle) => vehicle.type === 'taxi' && vehicle.driverId)

  return <section className="section-sheet jobs-sheet game-panel" aria-labelledby="jobs-title" aria-live="polite">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <header className="dispatch-header">
      <div><small>DISPATCH</small><h2 id="jobs-title">Requests</h2></div>
      <div className="dispatch-status" aria-label="Dispatch overview">
        <span><b>{offers.length}</b> open</span>
        <span><b>{activeJobs.length}</b> active</span>
        <span><b>{availableTaxis.filter((vehicle) => vehicle.driverId).length}/{staffedTaxis.length}</b> ready</span>
      </div>
    </header>
    <div className="job-list">{offers.length ? offers.map((job) => {
      const passenger = passengers.find((candidate) => job.passengerIds.includes(candidate.id))
      const taxi = availableTaxis.filter((vehicle) => vehicle.driverId && vehicleCanTakeJob(vehicle, job, passenger?.partySize ?? 1))
        .map((vehicle) => ({ vehicle, distance: vehicle.position ? distanceKmBetween(vehicle.position, job.pickup) : Infinity }))
        .sort((left, right) => left.distance - right.distance)[0]
      const category = categoryDetails[job.category ?? 'standard']
      const operation = travelOperationFor(job)
      return <article className={`job-card ${job.id === focusedJobId ? 'focused' : ''}`} key={job.id}>
        <header className="operation-heading"><span className="operation-icon">{operation.icon}</span><div><small>{operation.service} · {operation.reference}</small><strong>{category.label} · {passenger?.name ?? 'Passenger'}</strong></div><b className="job-timer">{remainingTime(job, now)}</b></header>
        {job.demandLevel && <div className={`demand-signal demand-${job.demandLevel}`}><span>◉ {job.demandLevel} demand</span><small>{job.demandReason}{job.demandMultiplier && job.demandMultiplier > 1 ? ` · ${Math.round((job.demandMultiplier - 1) * 100)}% peak fare` : ''}</small></div>}
        <div className="job-route"><span>●</span><div><strong>{job.pickupLabel}</strong><i /><strong>{job.destinationLabel}</strong></div></div>
        <div className="job-meta"><span>{taxi && Number.isFinite(taxi.distance) ? `${taxi.distance.toFixed(1)} km to pickup` : 'No suitable staffed taxi'}</span><span>{job.distanceKm} km trip</span><b>{money.format(job.fare)}</b></div>
        <div className="dispatch-actions"><button className="view-job-map" onClick={() => onViewMap(job.id)} aria-label="View route on map">Map</button><button className="decline-call" onClick={() => onDecline(job.id)}>Pass</button><button className="accept-call" disabled={!taxi} onClick={() => onAccept(job.id)}>{taxi ? 'Dispatch' : 'Unavailable'}</button></div>
      </article>
    }) : <div className="job-empty"><strong>Operations under control</strong><p>New travel requests will appear when a staffed taxi becomes available.</p></div>}</div>
  </section>
}
