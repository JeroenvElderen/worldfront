import type { Section } from '../../stores/gameStore'
import type { Passenger, TaxiJob, Vehicle } from '../../models/game'
import { JOB_REQUEST_INTERVAL_MS } from '../../services/jobEngine'

interface SectionSheetProps { section: Exclude<Section, 'map'>; vehicles: Vehicle[]; jobs: TaxiJob[]; passengers: Passenger[]; onClose: () => void; onReset: () => void; onRefreshJobs: () => void; onAcceptJob: (jobId: string) => void; onCompleteJob: (jobId: string) => void }
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function SectionSheet({ section, vehicles, jobs, passengers, onClose, onReset, onRefreshJobs, onAcceptJob, onCompleteJob }: SectionSheetProps) {
  if (section === 'jobs') {
    const activeJob = jobs.find((job) => job.status === 'accepted')
    const offers = jobs.filter((job) => job.status === 'offered')
    return <section className="section-sheet jobs-sheet game-panel">
      <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
      <small>JOBS</small><h2>{activeJob ? 'Trip in progress' : 'Taxi requests'}</h2>
      {activeJob ? <article className="active-job">
        <div className="job-route"><span>●</span><div><strong>{activeJob.pickupLabel}</strong><i /><strong>{activeJob.destinationLabel}</strong></div></div>
        <div className="job-meta"><span>{activeJob.distanceKm} km</span><span>~{activeJob.durationMinutes} min</span><b>{money.format(activeJob.fare)}</b></div>
        <button className="primary-action" onClick={() => onCompleteJob(activeJob.id)}>Complete trip</button>
      </article> : <>
        <p>Choose a fare for your available taxi. A new request arrives every {JOB_REQUEST_INTERVAL_MS / 1000} seconds.</p>
        <div className="job-list">{offers.length === 0 && <p className="job-empty" role="status">Looking for a nearby passenger…</p>}{offers.map((job) => {
          const passenger = passengers.find((candidate) => job.passengerIds.includes(candidate.id))
          return <article className="job-card" key={job.id}>
            <div><strong>{job.pickupLabel} → {job.destinationLabel}</strong><small>{passenger?.name ?? 'Passenger'} · party of {passenger?.partySize ?? 1}</small></div>
            <div className="job-meta"><span>{job.distanceKm} km</span><span>~{job.durationMinutes} min</span><b>{money.format(job.fare)}</b></div>
            <button onClick={() => onAcceptJob(job.id)}>Accept fare</button>
          </article>
        })}</div>
        <button className="refresh-link" onClick={onRefreshJobs}>↻ Refresh requests</button>
      </>}
    </section>
  }
  const content = {
    fleet: [`${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} in your fleet`, vehicles[0] ? `${vehicles[0].name} · ${vehicles[0].condition}% condition · ${vehicles[0].status}` : 'Purchase your first vehicle.'],
    travel: ['Travel agency locked', 'Reach company level 3 to begin creating tours.'],
    company: ['Your company', 'Manage finances, staff and expansion from here.'],
  }[section]
  return <section className="section-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>{section.toUpperCase()}</small><h2>{content[0]}</h2><p>{content[1]}</p>
    {section === 'company' && <button className="danger-link" onClick={onReset}>Start a new company</button>}
  </section>
}
