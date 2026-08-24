import { useMemo, useState } from 'react'
import { DispatchMap, type Coordinate, type Job, type TripPhase } from './DispatchMap'

type Tab = 'dispatch' | 'fleet' | 'company'

const POIS = [
  { name: 'Temple Bar', coordinate: [-6.2675, 53.3455] as Coordinate },
  { name: 'Heuston Station', coordinate: [-6.2927, 53.3464] as Coordinate },
  { name: 'Trinity College', coordinate: [-6.2546, 53.3438] as Coordinate },
  { name: 'Croke Park', coordinate: [-6.2501, 53.3607] as Coordinate },
  { name: 'Dublin Airport', coordinate: [-6.2499, 53.4264] as Coordinate },
  { name: 'Phoenix Park', coordinate: [-6.3298, 53.3568] as Coordinate },
  { name: 'Grand Canal Dock', coordinate: [-6.2382, 53.3398] as Coordinate },
]

const drivers = [
  { id: 'd1', name: 'Maya Chen', car: 'Toyota Prius · 14-D-2041' },
  { id: 'd2', name: 'Jon Bell', car: 'Škoda Octavia · 231-D-88' },
  { id: 'd3', name: 'Aisha Khan', car: 'Kia Niro · 221-D-390' },
]

function makeJob(index: number): Job {
  const pickupIndex = Math.floor(Math.random() * POIS.length)
  let dropoffIndex = Math.floor(Math.random() * POIS.length)
  if (dropoffIndex === pickupIndex) dropoffIndex = (dropoffIndex + 1) % POIS.length
  const from = POIS[pickupIndex]
  const to = POIS[dropoffIndex]
  return {
    id: `job-${Date.now()}-${index}`,
    passenger: ['Sofia M.', 'Noah W.', 'Emily R.', 'Daniel K.', 'Leah T.'][index % 5],
    pickupName: from.name,
    dropoffName: to.name,
    pickup: from.coordinate,
    dropoff: to.coordinate,
    fare: 14 + Math.floor(Math.random() * 25),
    eta: 3 + Math.floor(Math.random() * 9),
  }
}

const tabLabels: Record<Tab, string> = { dispatch: 'Jobs', fleet: 'Drivers', company: 'Company' }

function Icon({ name }: { name: Tab }) {
  const paths = {
    dispatch: 'M4 6h16M4 12h11M4 18h7M17 15l3 3-3 3',
    fleet: 'M5 16h14l-2-6H7l-2 6Zm2 0v2m10-2v2M9 10l1.5-4h3L15 10',
    company: 'M4 20V8l8-4 8 4v12M9 20v-5h6v5M8 10h1m6 0h1',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>
}

export default function App() {
  const [jobs, setJobs] = useState<Job[]>(() => Array.from({ length: 4 }, (_, i) => makeJob(i)))
  const [selected, setSelected] = useState<Job | null>(null)
  const [assignedDriver, setAssignedDriver] = useState<string>('')
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [phase, setPhase] = useState<TripPhase>('idle')
  const [station, setStation] = useState<Coordinate>([-6.2763, 53.3498])
  const [placingStation, setPlacingStation] = useState(false)
  const [openTab, setOpenTab] = useState<Tab>('dispatch')
  const activeDriver = useMemo(() => drivers.find((driver) => driver.id === assignedDriver), [assignedDriver])

  const assign = () => {
    if (!selected || !assignedDriver) return
    setActiveJob(selected)
    setJobs((current) => current.filter((job) => job.id !== selected.id))
    setSelected(null)
    setPhase('to-pickup')
  }

  const completeTrip = () => setPhase('dropped-off')

  const finishDriver = (next: 'staying' | 'roaming') => {
    setPhase(next)
    window.setTimeout(() => {
      setActiveJob(null)
      setAssignedDriver('')
      setPhase('idle')
    }, 1600)
  }

  return (
    <main className="app">
      <DispatchMap
        jobs={jobs}
        selectedJob={selected}
        activeJob={activeJob}
        phase={phase}
        station={station}
        placingStation={placingStation}
        onSelectJob={(job) => { setSelected(job); setOpenTab('dispatch') }}
        onStationPlaced={(coordinate) => { setStation(coordinate); setPlacingStation(false) }}
        onPhaseChange={setPhase}
        onTripComplete={completeTrip}
      />

      <header className="topbar">
        <div className="brand"><span>TF</span><strong>TaxiFlow</strong></div>
        <button className={placingStation ? 'station active' : 'station'} onClick={() => setPlacingStation((value) => !value)}>
          <span className="station-dot" /> {placingStation ? 'Tap map to place station' : 'Move station'}
        </button>
        <div className="live"><i /> Live dispatch</div>
      </header>

      <aside className="dispatch-panel">
        <div className="panel-heading">
          <div><p>DISPATCH CENTER</p><h1>{activeJob ? 'Active ride' : 'Available jobs'}</h1></div>
          {!activeJob && <button className="add-job" aria-label="Create random job" onClick={() => setJobs((current) => [...current, makeJob(current.length)])}>＋</button>}
        </div>

        {activeJob ? (
          <div className="active-card">
            <div className="status-line"><span className={`status-icon ${phase}`} /> <b>{phase === 'to-pickup' ? 'Heading to pickup' : phase === 'with-passenger' ? 'Passenger on board' : phase === 'dropped-off' ? 'Ride complete' : phase === 'roaming' ? 'Finding nearby jobs' : 'Driver available'}</b></div>
            <div className="driver-chip"><span>{activeDriver?.name.slice(0, 1)}</span><div><b>{activeDriver?.name}</b><small>{activeDriver?.car}</small></div></div>
            <RouteDetails job={activeJob} />
            {phase === 'dropped-off' && <div className="next-actions"><p>What should the driver do?</p><button onClick={() => finishDriver('staying')}>Stay here</button><button className="primary" onClick={() => finishDriver('roaming')}>Roam for jobs</button></div>}
          </div>
        ) : (
          <>
            <div className="jobs-summary"><span><b>{jobs.length}</b> waiting</span><small>Generated at city points of interest</small></div>
            <div className="job-list">
              {jobs.map((job) => <button key={job.id} className={selected?.id === job.id ? 'job selected' : 'job'} onClick={() => setSelected(job)}>
                <span className="passenger-avatar">{job.passenger[0]}</span>
                <span className="job-copy"><b>{job.passenger}</b><small>{job.pickupName} → {job.dropoffName}</small></span>
                <span className="job-price">€{job.fare}<small>{job.eta} min</small></span>
              </button>)}
            </div>
            {selected && <div className="assignment">
              <RouteDetails job={selected} />
              <label htmlFor="driver">Assign a driver</label>
              <select id="driver" value={assignedDriver} onChange={(event) => setAssignedDriver(event.target.value)}>
                <option value="">Choose an available driver…</option>
                {drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name} · {driver.car.split(' · ')[0]}</option>)}
              </select>
              <button className="assign-button" disabled={!assignedDriver} onClick={assign}>Dispatch from station <span>→</span></button>
            </div>}
          </>
        )}
      </aside>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {(Object.keys(tabLabels) as Tab[]).map((tab) => <button key={tab} className={openTab === tab ? 'active' : ''} onClick={() => setOpenTab(tab)}><Icon name={tab} /><span>{tabLabels[tab]}</span></button>)}
      </nav>
    </main>
  )
}

function RouteDetails({ job }: { job: Job }) {
  return <div className="route-details"><div><i className="pickup-dot" /><span><small>PICKUP · POI</small><b>{job.pickupName}</b></span></div><div><i className="dropoff-dot" /><span><small>DROPOFF</small><b>{job.dropoffName}</b></span></div></div>
}
