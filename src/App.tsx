import { useMemo, useState } from 'react'
import { DispatchMap, type Coordinate, type Job, type TripPhase } from './DispatchMap'

type Tab = 'map' | 'jobs' | 'fleet' | 'company'

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
  return { id: `job-${Date.now()}-${index}`, passenger: ['Sofia M.', 'Noah W.', 'Emily R.', 'Daniel K.', 'Leah T.'][index % 5], pickupName: from.name, dropoffName: to.name, pickup: from.coordinate, dropoff: to.coordinate, fare: 14 + Math.floor(Math.random() * 25), eta: 3 + Math.floor(Math.random() * 9) }
}

const icons: Record<string, string> = {
  wallet: 'M3 7h15a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V7Zm0 2V5a2 2 0 0 1 2-2h12v4m-2 5h5',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2-4.5-4.4 6.2-.9L12 3Z',
  menu: 'M4 7h16M4 12h16M4 17h16', map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
  jobs: 'M8 5V3h8v2m-11 0h14v16H5V5Zm4 5h6m-6 5h6', fleet: 'M5 16h14l-2-6H7l-2 6Zm2 0v3m10-3v3M9 10l1.5-4h3L15 10',
  company: 'M4 21V8l8-4 8 4v13M8 11h2m4 0h2m-8 4h2m4 0h2m-6 6v-3h4v3', target: 'M12 3v3m0 12v3M3 12h3m12 0h3m-5 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  layers: 'm4 9 8-5 8 5-8 5-8-5Zm0 5 8 5 8-5', locate: 'm4 5 16-2-7 18-2-8-7-8Z', close: 'M6 6l12 12M18 6 6 18'
}

function Icon({ name }: { name: keyof typeof icons }) { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[name]} /></svg> }

export default function App() {
  const [jobs, setJobs] = useState<Job[]>(() => Array.from({ length: 3 }, (_, i) => makeJob(i)))
  const [selected, setSelected] = useState<Job | null>(null)
  const [assignedDriver, setAssignedDriver] = useState('')
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [phase, setPhase] = useState<TripPhase>('idle')
  const [station, setStation] = useState<Coordinate>([-6.2763, 53.3498])
  const [placingStation, setPlacingStation] = useState(false)
  const [openTab, setOpenTab] = useState<Tab>('map')
  const activeDriver = useMemo(() => drivers.find((driver) => driver.id === assignedDriver), [assignedDriver])

  const assign = () => {
    if (!selected || !assignedDriver) return
    setActiveJob(selected); setJobs((current) => current.filter((job) => job.id !== selected.id)); setSelected(null); setPhase('to-pickup')
  }
  const finishDriver = (next: 'staying' | 'roaming') => { setPhase(next); window.setTimeout(() => { setActiveJob(null); setAssignedDriver(''); setPhase('idle'); setOpenTab('map') }, 1600) }
  const showPanel = openTab !== 'map' || Boolean(activeJob)

  return <main className="app">
    <DispatchMap jobs={jobs} selectedJob={selected} activeJob={activeJob} phase={phase} station={station} placingStation={placingStation}
      onSelectJob={(job) => { setSelected(job); setOpenTab('jobs') }} onStationPlaced={(coordinate) => { setStation(coordinate); setPlacingStation(false) }}
      onPhaseChange={setPhase} onTripComplete={() => setPhase('dropped-off')} />

    <header className="dashboard" aria-label="Company status">
      <div className="stat balance"><span className="stat-icon"><Icon name="wallet" /></span><span><strong>€12,450</strong><small>Balance</small></span></div>
      <div className="stat level"><span className="level-badge">4</span><span className="level-copy"><strong>Level 4</strong><i><b /></i><small>780 / 1200 XP</small></span></div>
      <div className="stat rating"><Icon name="star" /><span><strong>4.6</strong><small>Rating</small></span><button aria-label="Open menu"><Icon name="menu" /></button></div>
    </header>

    <div className="map-tools" aria-label="Map controls">
      <button className={placingStation ? 'active' : ''} onClick={() => setPlacingStation((value) => !value)} aria-label="Move station"><Icon name="target" /></button>
      <button aria-label="Map layers"><Icon name="layers" /></button>
      <button onClick={() => setPlacingStation(false)} aria-label="Find my location"><Icon name="locate" /></button>
    </div>

    {!showPanel && <button className="jobs-fab" onClick={() => setOpenTab('jobs')}><Icon name="jobs" /><b>Jobs</b><span>{jobs.length}</span></button>}

    {showPanel && <aside className="dispatch-panel">
      <div className="panel-heading"><div><p>{openTab === 'fleet' ? 'YOUR TEAM' : openTab === 'company' ? 'BUSINESS' : 'DISPATCH CENTER'}</p><h1>{activeJob ? 'Active ride' : openTab === 'fleet' ? 'Fleet' : openTab === 'company' ? 'Company' : 'Available jobs'}</h1></div><button className="panel-close" onClick={() => setOpenTab('map')} aria-label="Close panel"><Icon name="close" /></button></div>
      {openTab === 'fleet' && !activeJob ? <div className="simple-list">{drivers.map((driver) => <div className="driver-chip" key={driver.id}><span>{driver.name[0]}</span><div><b>{driver.name}</b><small>{driver.car}</small></div><em>Online</em></div>)}</div>
      : openTab === 'company' && !activeJob ? <div className="company-card"><span className="stat-icon"><Icon name="company" /></span><h2>TaxiFlow Dublin</h2><p>12 completed rides today</p><strong>€286.40 <small>today's revenue</small></strong></div>
      : activeJob ? <div className="active-card"><div className="status-line"><span className={`status-icon ${phase}`} /><b>{phase === 'to-pickup' ? 'Heading to pickup' : phase === 'with-passenger' ? 'Passenger on board' : phase === 'dropped-off' ? 'Ride complete' : phase === 'roaming' ? 'Finding nearby jobs' : 'Driver available'}</b></div><div className="driver-chip"><span>{activeDriver?.name.slice(0, 1)}</span><div><b>{activeDriver?.name}</b><small>{activeDriver?.car}</small></div></div><RouteDetails job={activeJob} />{phase === 'dropped-off' && <div className="next-actions"><p>What should the driver do?</p><button onClick={() => finishDriver('staying')}>Stay here</button><button className="primary" onClick={() => finishDriver('roaming')}>Roam for jobs</button></div>}</div>
      : <><div className="jobs-summary"><span><b>{jobs.length}</b> waiting nearby</span><button onClick={() => setJobs((current) => [...current, makeJob(current.length)])}>＋ Add job</button></div><div className="job-list">{jobs.map((job) => <button key={job.id} className={selected?.id === job.id ? 'job selected' : 'job'} onClick={() => setSelected(job)}><span className="passenger-avatar">{job.passenger[0]}</span><span className="job-copy"><b>{job.passenger}</b><small>{job.pickupName} → {job.dropoffName}</small></span><span className="job-price">€{job.fare}<small>{job.eta} min</small></span></button>)}</div>{selected && <div className="assignment"><RouteDetails job={selected} /><label htmlFor="driver">Assign a driver</label><select id="driver" value={assignedDriver} onChange={(event) => setAssignedDriver(event.target.value)}><option value="">Choose an available driver…</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name} · {driver.car.split(' · ')[0]}</option>)}</select><button className="assign-button" disabled={!assignedDriver} onClick={assign}>Dispatch driver <span>→</span></button></div>}</>}
    </aside>}

    <nav className="bottom-nav" aria-label="Primary navigation">{(['map', 'jobs', 'fleet', 'company'] as Tab[]).map((tab) => <button key={tab} className={openTab === tab && !activeJob ? 'active' : ''} onClick={() => setOpenTab(tab)}><Icon name={tab} /><span>{tab[0].toUpperCase() + tab.slice(1)}</span></button>)}</nav>
  </main>
}

function RouteDetails({ job }: { job: Job }) { return <div className="route-details"><div><i className="pickup-dot" /><span><small>PICKUP</small><b>{job.pickupName}</b></span></div><div><i className="dropoff-dot" /><span><small>DROPOFF</small><b>{job.dropoffName}</b></span></div></div> }
