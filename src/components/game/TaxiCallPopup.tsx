import { useEffect, useState } from 'react'
import type { Driver, Passenger, TaxiJob, Vehicle } from '../../models/game'
import { distanceKmBetween, jobDestination, jobOfferExpiresAt, jobPickup, liveMeterFare } from '../../services/jobEngine'
import { vehicleCanTakeJob } from '../../services/earlyGameEngine'
import { licensePlateForVehicle, vehicleMakeAndModel } from '../../services/vehicleIdentity'
import { JobRoutePreview } from './JobRoutePreview'
import { useCurrency } from './CurrencyContext'

interface TaxiCallPopupProps {
  focusedJobId: string | null
  vehicles: Vehicle[]
  jobs: TaxiJob[]
  passengers: Passenger[]
  drivers: Driver[]
  onAccept: (jobId: string) => void
  onDecline: (jobId: string) => void
  onViewMap: (jobId: string) => void
  onClose: () => void
}

type JobView = TaxiJob['status']

const remainingTime = (job: TaxiJob, now: number) => {
  const seconds = Math.max(0, Math.ceil((jobOfferExpiresAt(job) - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const viewDetails: Array<{ id: JobView; label: string }> = [
  { id: 'offered', label: 'Available' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'complete', label: 'Completed' },
]

export function TaxiCallPopup({ focusedJobId, vehicles, jobs, passengers, drivers, onAccept, onDecline, onViewMap, onClose }: TaxiCallPopupProps) {
  const { currency, locale } = useCurrency()
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 })
  const [now, setNow] = useState(Date.now())
  const [view, setView] = useState<JobView>('offered')

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [])

  const visibleJobs = jobs.filter((job) => job.status === view)

  return <section className="section-sheet jobs-sheet game-panel" aria-labelledby="jobs-title" aria-live="polite">
    <div className="sheet-handle" />
    <button className="sheet-close" onClick={onClose} aria-label="Close jobs">×</button>
    <header className="jobs-heading">
      <div><h2 id="jobs-title">Jobs</h2><p>Choose a job to assign to a taxi</p></div>
    </header>
    <nav className="job-tabs" aria-label="Job status">
      {viewDetails.map((item) => <button type="button" key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
        {item.label}<b>{jobs.filter((job) => job.status === item.id).length}</b>
      </button>)}
    </nav>
    <div className="job-list">{visibleJobs.length ? visibleJobs.map((job) => {
      const passenger = passengers.find((candidate) => job.passengerIds.includes(candidate.id))
      const isRepeatJob = (passenger?.trips ?? 0) > (job.status === 'complete' ? 1 : 0)
      const assignedTaxi = vehicles.find((vehicle) => vehicle.id === job.assignedVehicleId)
      const taxi = assignedTaxi ? { vehicle: assignedTaxi, distance: 0 } : vehicles
        .filter((vehicle) => {
          const driver = drivers.find((candidate) => candidate.id === vehicle.driverId)
          const activeJob = jobs.find((candidate) => candidate.status === 'accepted' && candidate.assignedVehicleId === vehicle.id)
          const canQueue = vehicle.status === 'on-job' && activeJob && distanceKmBetween(jobDestination(activeJob), jobPickup(job)) <= 3
          return vehicle.type === 'taxi' && vehicle.cityId === job.cityId && (vehicle.status === 'available' || canQueue) && (driver?.status === 'available' || canQueue) &&
            vehicleCanTakeJob(vehicle, job, passenger?.partySize ?? 1) &&
            (job.category !== 'accessible' || (driver?.certifications ?? []).includes('accessible')) &&
            (job.category !== 'executive' || (driver?.certifications ?? []).includes('executive'))
        })
        .map((vehicle) => ({ vehicle, distance: vehicle.position ? distanceKmBetween(vehicle.position, jobPickup(job)) : Infinity }))
        .sort((left, right) => left.distance - right.distance)[0]
      return <article className={`job-card job-board-card ${job.id === focusedJobId ? 'focused' : ''}`} key={job.id}>
        <div className="job-route-column">
          <JobRoutePreview job={job} isRepeatJob={isRepeatJob} onOpen={() => onViewMap(job.id)} />
          <div className="job-trip-meta"><span><i aria-hidden="true">⌁</i>{job.distanceKm.toFixed(1)} km</span><span><i aria-hidden="true">◷</i>{Math.round(job.durationMinutes)} min</span></div>
        </div>
        <div className="job-offer-column">
          <span className="job-category">♟ {passenger?.partySize ?? 1} passenger{passenger?.partySize === 1 ? '' : 's'}</span>
          <strong className="job-fare">{money.format(view === 'accepted' && assignedTaxi ? liveMeterFare(job, assignedTaxi, now) : job.fare)}</strong>
          <small>{view === 'complete' ? 'Final metered fare' : view === 'accepted' ? 'Live meter · traffic included' : 'Estimated fare'}</small>
          {job.queuedAfterJobId && <span className="queue-pill">NEXT FARE · PICKUP AFTER CURRENT RIDE</span>}
          {taxi && <div className="job-vehicle"><span aria-hidden="true">🚕</span><div><small>{view === 'offered' ? 'NEXT VEHICLE' : 'ASSIGNED VEHICLE'}</small><strong>{vehicleMakeAndModel(taxi.vehicle)}</strong></div><b>{licensePlateForVehicle(taxi.vehicle)}</b></div>}
          {view === 'offered' ? <>
            <button className="accept-call" disabled={!taxi} onClick={() => onAccept(job.id)}>{taxi ? 'Accept' : 'Unavailable'}</button>
            <div className="job-card-links"><button onClick={() => onViewMap(job.id)}>Map</button><button onClick={() => onDecline(job.id)}>Pass</button><span><i aria-hidden="true">◷</i>{remainingTime(job, now)}</span></div>
          </> : <button className="view-job-map job-status-action" onClick={() => onViewMap(job.id)}>{view === 'accepted' ? 'Track job' : 'View route'}</button>}
        </div>
      </article>
    }) : <div className="job-empty"><strong>No {viewDetails.find((item) => item.id === view)?.label.toLowerCase()} jobs</strong><p>{view === 'offered' ? 'New requests will appear when a staffed taxi becomes available.' : `Your ${view === 'accepted' ? 'active' : 'finished'} jobs will appear here.`}</p></div>}</div>
  </section>
}
