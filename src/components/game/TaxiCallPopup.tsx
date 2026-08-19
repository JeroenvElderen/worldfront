import type { Passenger, TaxiJob, Vehicle } from '../../models/game'
import { distanceKmBetween } from '../../services/jobEngine'

interface TaxiCallPopupProps {
  focusedJobId: string | null
  vehicles: Vehicle[]
  jobs: TaxiJob[]
  passengers: Passenger[]
  onAccept: (jobId: string) => void
  onDecline: (jobId: string) => void
}

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function TaxiCallPopup({ focusedJobId, vehicles, jobs, passengers, onAccept, onDecline }: TaxiCallPopupProps) {
  const availableTaxis = vehicles.filter((vehicle) => vehicle.status === 'available')
  if (!availableTaxis.length) return null

  const offers = jobs.filter((job) => job.status === 'offered')
  const job = offers.find((offer) => offer.id === focusedJobId) ?? offers[offers.length - 1]
  if (!job) return null

  const taxi = availableTaxis
    .map((vehicle) => ({ vehicle, distance: vehicle.position ? distanceKmBetween(vehicle.position, job.pickup) : Infinity }))
    .sort((left, right) => left.distance - right.distance)[0]
  const passenger = passengers.find((candidate) => job.passengerIds.includes(candidate.id))

  return <aside className="taxi-call game-panel" role="dialog" aria-labelledby="taxi-call-title" aria-live="polite">
    <div className="call-heading"><span className="call-icon">📞</span><div><small>INCOMING TAXI CALL</small><h2 id="taxi-call-title">Passenger nearby</h2></div></div>
    <p><strong>{passenger?.name ?? 'A passenger'}</strong> needs a taxi from your current area.</p>
    <div className="job-route"><span>●</span><div><strong>{job.pickupLabel}</strong><i /><strong>{job.destinationLabel}</strong></div></div>
    <div className="job-meta"><span>{Number.isFinite(taxi.distance) ? `${taxi.distance.toFixed(1)} km to pickup` : taxi.vehicle.name}</span><span>{job.distanceKm} km trip</span><b>{money.format(job.fare)}</b></div>
    <div className="call-actions"><button className="decline-call" onClick={() => onDecline(job.id)}>Decline</button><button className="accept-call" onClick={() => onAccept(job.id)}>Accept call</button></div>
  </aside>
}
