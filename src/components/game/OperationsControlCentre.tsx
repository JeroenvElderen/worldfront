import type { IncidentResponse, TaxiJob, TrafficIncident, Vehicle, VehicleIncident } from '../../models/game'
import { useCurrency } from './CurrencyContext'

interface Props {
  cash: number
  jobs: TaxiJob[]
  vehicles: Vehicle[]
  trafficIncidents: TrafficIncident[]
  vehicleIncidents: VehicleIncident[]
  onResolve: (id: string, response?: IncidentResponse) => void
  onTrackJob: (id: string) => void
  onClose: () => void
}

const responses: Array<{ id: IncidentResponse; label: string; factor?: number; fixed?: number }> = [
  { id: 'roadside-repair', label: 'Repair roadside', factor: 1 },
  { id: 'tow', label: 'Tow to workshop', factor: .7 },
  { id: 'replacement', label: 'Send replacement', fixed: 450 },
  { id: 'refund', label: 'Refund customer', fixed: 250 },
]

export function OperationsControlCentre({ cash, jobs, vehicles, trafficIncidents, vehicleIncidents, onResolve, onTrackJob, onClose }: Props) {
  const { money } = useCurrency()
  const traffic = trafficIncidents.filter((incident) => !incident.resolved)
  const roadside = vehicleIncidents.filter((incident) => !incident.resolved)
  const priorityJobs = jobs.filter((job) => job.status !== 'complete' && (job.story || job.trafficDelay))
  return <section className="section-sheet operations-sheet game-panel" aria-labelledby="operations-title">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close operations">×</button>
    <header className="operations-heading"><div><small>LIVE COMMAND</small><h2 id="operations-title">Dispatch control centre</h2><p>Manage disruptions, passenger priorities and fleet recovery.</p></div><span className={roadside.length ? 'alert' : ''}>{roadside.length + traffic.length}</span></header>
    <div className="operations-kpis"><span><b>{jobs.filter((job) => job.status === 'accepted').length}</b><small>ACTIVE JOBS</small></span><span><b>{priorityJobs.length}</b><small>PRIORITY CALLS</small></span><span><b>{traffic.length}</b><small>ROAD ALERTS</small></span><span><b>{roadside.length}</b><small>FLEET ALERTS</small></span></div>

    <h3>Road network</h3><div className="control-feed">{traffic.length ? traffic.map((incident) => <article className={`severity-${incident.severity}`} key={incident.id}><i>!</i><div><strong>{incident.title}</strong><small>{incident.description} · +{Math.round((incident.delayMultiplier - 1) * 100)}% journey time nearby</small></div><time>{Math.max(1, Math.ceil((new Date(incident.expiresAt).getTime() - Date.now()) / 60_000))}m</time></article>) : <p className="all-clear">✓ No active road disruption</p>}</div>

    <h3>Roadside response</h3><div className="breakdown-feed">{roadside.length ? roadside.map((incident) => { const vehicle = vehicles.find((item) => item.id === incident.vehicleId); return <article key={incident.id}><header><span>⚠</span><div><strong>{vehicle?.name ?? 'Fleet vehicle'} · {incident.kind}</strong><small>{incident.description}</small></div></header><div className="response-grid">{responses.map((response) => { const price = response.fixed ?? Math.round(incident.repairCost * (response.factor ?? 1)); return <button disabled={cash < price} key={response.id} onClick={() => onResolve(incident.id, response.id)}>{response.label}<small>{money.format(price)}</small></button> })}</div></article> }) : <p className="all-clear">✓ Every fleet vehicle is operational</p>}</div>

    <h3>Passenger priorities</h3><div className="priority-feed">{priorityJobs.length ? priorityJobs.map((job) => <button key={job.id} onClick={() => onTrackJob(job.id)}><span className={job.story?.priority ?? 'routine'}>{job.story?.priority ?? 'traffic'}</span><div><strong>{job.story?.headline ?? job.trafficDelay}</strong><small>{job.pickupLabel} → {job.destinationLabel}{job.trafficDelay ? ` · ${job.trafficDelay}` : ''}</small></div><b>{job.status}</b></button>) : <p className="all-clear">No priority passenger calls</p>}</div>
  </section>
}
