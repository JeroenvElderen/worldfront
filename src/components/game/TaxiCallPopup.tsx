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
    <small>TRAVEL OPERATIONS</small><h2 id="jobs-title">Dispatch centre</h2>
    <p>Review live passenger and logistics requests, check the required capability, then dispatch the nearest suitable vehicle.</p>
    <div className="operations-overview" aria-label="Operations overview">
      <span><small>OPEN REQUESTS</small><b>{offers.length}</b></span>
      <span><small>ACTIVE TRIPS</small><b>{activeJobs.length}</b></span>
      <span><small>READY TAXIS</small><b>{availableTaxis.filter((vehicle) => vehicle.driverId).length}/{staffedTaxis.length}</b></span>
    </div>
    <div className="job-list">{offers.length ? offers.map((job) => {
      const passenger = passengers.find((candidate) => job.passengerIds.includes(candidate.id))
      const taxi = availableTaxis.filter((vehicle) => vehicle.driverId && vehicleCanTakeJob(vehicle, job, passenger?.partySize ?? 1))
        .map((vehicle) => ({ vehicle, distance: vehicle.position ? distanceKmBetween(vehicle.position, job.pickup) : Infinity }))
        .sort((left, right) => left.distance - right.distance)[0]
      const category = categoryDetails[job.category ?? 'standard']
      const operation = travelOperationFor(job)
      return <article className={`job-card ${job.id === focusedJobId ? 'focused' : ''}`} key={job.id}>
        <header className="operation-heading"><span className="operation-icon">{operation.icon}</span><div><small>{operation.service} · {operation.reference}</small><strong>{operation.title}</strong></div><b className={`priority-pill priority-${operation.priority.toLowerCase().replace(' ', '-')}`}>{operation.priority}</b></header>
        <div className="operation-customer"><strong>{category.label} · {passenger?.name ?? 'A passenger'}</strong><small>{passenger?.partySize ?? 1} passenger(s) · Dispatch window <b className="job-timer">{remainingTime(job, now)}</b></small></div>
        <div className="job-route"><span>●</span><div><strong>{job.pickupLabel}</strong><i /><strong>{job.destinationLabel}</strong></div></div>
        <div className="job-meta"><span>{taxi && Number.isFinite(taxi.distance) ? `${taxi.distance.toFixed(1)} km to pickup` : 'No suitable staffed taxi'}</span><span>{job.distanceKm} km trip</span><b>{money.format(job.fare)}</b></div>
        <div className="operation-requirements"><small>RESOURCE CHECK</small>{operation.requirements.map((requirement) => <span className={taxi ? 'ready' : 'missing'} key={requirement}>{taxi ? '✓' : '!'} {requirement}</span>)}</div>
        <button className="view-job-map" onClick={() => onViewMap(job.id)}>View route on map</button>
        <div className="call-actions"><button className="decline-call" onClick={() => onDecline(job.id)}>Pass request</button><button className="accept-call" disabled={!taxi} onClick={() => onAccept(job.id)}>{taxi ? 'Dispatch nearest taxi' : 'Resource unavailable'}</button></div>
      </article>
    }) : <div className="job-empty"><strong>Operations under control</strong><p>New travel requests will appear when a staffed taxi becomes available.</p></div>}</div>
  </section>
}
