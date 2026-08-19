import type { Section } from '../../stores/gameStore'
import type { Passenger, TaxiJob, Vehicle } from '../../models/game'
import { JOB_REQUEST_INTERVAL_MS } from '../../services/jobEngine'

interface SectionSheetProps { section: Exclude<Section, 'map'>; vehicles: Vehicle[]; jobs: TaxiJob[]; passengers: Passenger[]; cash: number; jobsLoading: boolean; jobsError: string | null; onClose: () => void; onReset: () => void; onRefreshJobs: () => void; onAcceptJob: (jobId: string) => void; onCompleteJob: (jobId: string) => void; onBuyTaxi: () => void }
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function SectionSheet({ section, vehicles, jobs, passengers, cash, jobsLoading, jobsError, onClose, onReset, onRefreshJobs, onAcceptJob, onCompleteJob, onBuyTaxi }: SectionSheetProps) {
  if (section === 'jobs') {
    const activeJobs = jobs.filter((job) => job.status === 'accepted')
    const offers = jobs.filter((job) => job.status === 'offered')
    return <section className="section-sheet jobs-sheet game-panel">
      <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
      <small>JOBS</small><h2>{activeJobs.length ? `${activeJobs.length} trip${activeJobs.length === 1 ? '' : 's'} in progress` : 'Taxi requests'}</h2>
      {activeJobs.map((activeJob) => <article className="active-job" key={activeJob.id}>
        <div className="job-route"><span>●</span><div><strong>{activeJob.pickupLabel}</strong><i /><strong>{activeJob.destinationLabel}</strong></div></div>
        <div className="job-meta"><span>{vehicles.find((vehicle) => vehicle.id === activeJob.assignedVehicleId)?.name ?? 'Taxi'}</span><span>{activeJob.distanceKm} km</span><span>~{activeJob.durationMinutes} min</span><b>{money.format(activeJob.fare)}</b></div>
        <button className="primary-action" onClick={() => onCompleteJob(activeJob.id)}>Complete trip</button>
      </article>)}
      <>
        <p>Every request is invented by AI for your city. A new one arrives every {JOB_REQUEST_INTERVAL_MS / 1000} seconds.</p>
        {jobsError && <p className="job-error" role="alert">{jobsError}</p>}
        <div className="job-list">{offers.length === 0 && <p className="job-empty" role="status">{jobsLoading ? 'AI is finding a nearby passenger…' : 'No open requests yet.'}</p>}{offers.map((job) => {
          const passenger = passengers.find((candidate) => job.passengerIds.includes(candidate.id))
          return <article className="job-card" key={job.id}>
            <div><strong>{job.pickupLabel} → {job.destinationLabel}</strong><small>{passenger?.name ?? 'Passenger'} · party of {passenger?.partySize ?? 1}</small></div>
            <div className="job-meta"><span>{job.distanceKm} km</span><span>~{job.durationMinutes} min</span><b>{money.format(job.fare)}</b></div>
            <button disabled={!vehicles.some((vehicle) => vehicle.status === 'available')} onClick={() => onAcceptJob(job.id)}>{vehicles.some((vehicle) => vehicle.status === 'available') ? 'Accept fare' : 'All taxis busy'}</button>
          </article>
        })}</div>
        <button className="refresh-link" disabled={jobsLoading} onClick={onRefreshJobs}>{jobsLoading ? 'Generating requests…' : '✦ Generate new AI requests'}</button>
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
    <div className="fleet-list">{vehicles.map((vehicle) => <article className="fleet-card" key={vehicle.id}><span>🚕</span><div><strong>{vehicle.name}</strong><small>{vehicle.condition}% condition · {vehicle.status === 'on-job' ? 'Driving' : 'Available'}</small></div></article>)}</div>
    <div className="fleet-purchase"><div><strong>Compact Taxi</strong><small>4 seats · ready immediately</small></div><b>{money.format(12_000)}</b></div>
    <button className="primary-action" disabled={cash < 12_000} onClick={onBuyTaxi}>{cash < 12_000 ? 'Not enough cash' : 'Buy taxi'}</button>
  </section>
  return <section className="section-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>{section.toUpperCase()}</small><h2>{content[0]}</h2><p>{content[1]}</p>
    {section === 'company' && <button className="danger-link" onClick={onReset}>Start a new company</button>}
  </section>
}
