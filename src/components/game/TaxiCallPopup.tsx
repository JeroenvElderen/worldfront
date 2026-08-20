import { useEffect, useState } from 'react'
import type { Passenger, TaxiJob, Vehicle } from '../../models/game'
import { distanceKmBetween, jobOfferExpiresAt } from '../../services/jobEngine'
import { categoryDetails, vehicleCanTakeJob } from '../../services/earlyGameEngine'

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

  return <section className="section-sheet jobs-sheet game-panel" aria-labelledby="jobs-title" aria-live="polite">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>JOBS</small><h2 id="jobs-title">Available taxi calls</h2>
    <p>Calls stay available for five minutes. Your taxis can wait until you choose a job.</p>
    <div className="job-list">{offers.length ? offers.map((job) => {
      const passenger = passengers.find((candidate) => job.passengerIds.includes(candidate.id))
      const taxi = availableTaxis.filter((vehicle) => vehicle.driverId && vehicleCanTakeJob(vehicle, job, passenger?.partySize ?? 1))
        .map((vehicle) => ({ vehicle, distance: vehicle.position ? distanceKmBetween(vehicle.position, job.pickup) : Infinity }))
        .sort((left, right) => left.distance - right.distance)[0]
      const category = categoryDetails[job.category ?? 'standard']
      return <article className={`job-card ${job.id === focusedJobId ? 'focused' : ''}`} key={job.id}>
        <div><strong>{category.icon} {category.label} · {passenger?.name ?? 'A passenger'}</strong><small>{passenger?.partySize ?? 1} passenger(s) · Expires in <b className="job-timer">{remainingTime(job, now)}</b></small></div>
        <div className="job-route"><span>●</span><div><strong>{job.pickupLabel}</strong><i /><strong>{job.destinationLabel}</strong></div></div>
        <div className="job-meta"><span>{taxi && Number.isFinite(taxi.distance) ? `${taxi.distance.toFixed(1)} km to pickup` : 'No suitable staffed taxi'}</span><span>{job.distanceKm} km trip</span><b>{money.format(job.fare)}</b></div>
        {job.requiredUpgrade && !taxi && <small className="job-requirement">Requires premium seats and enough passenger capacity.</small>}
        <button className="view-job-map" onClick={() => onViewMap(job.id)}>View route on map</button>
        <div className="call-actions"><button className="decline-call" onClick={() => onDecline(job.id)}>Decline</button><button className="accept-call" disabled={!taxi} onClick={() => onAccept(job.id)}>{taxi ? 'Accept job' : 'No taxi available'}</button></div>
      </article>
    }) : <div className="job-empty"><strong>No calls waiting</strong><p>New jobs will appear here when a taxi is available.</p></div>}</div>
  </section>
}
