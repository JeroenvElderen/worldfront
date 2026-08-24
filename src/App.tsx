import { useEffect, useMemo, useState } from 'react'
import { DispatchMap } from './DispatchMap'

type Tab = 'dispatch' | 'fleet' | 'reports'
type Ride = {
  id: number
  rider: string
  initials: string
  pickup: string
  destination: string
  distance: string
  eta: string
  fare: number
  tone: string
  pickupCoords: [number, number]
  destinationCoords: [number, number]
}

const rides: Ride[] = [
  { id: 1, rider: 'Maya Chen', initials: 'MC', pickup: 'Temple Bar', destination: 'Dublin Airport', distance: '12.4 km', eta: '4 min away', fare: 32.40, tone: 'violet', pickupCoords: [-6.2675, 53.3455], destinationCoords: [-6.2499, 53.4264] },
  { id: 2, rider: 'Liam Byrne', initials: 'LB', pickup: 'Grand Canal Dock', destination: 'Heuston Station', distance: '5.8 km', eta: '7 min away', fare: 18.20, tone: 'blue', pickupCoords: [-6.2382, 53.3397], destinationCoords: [-6.2927, 53.3464] },
  { id: 3, rider: 'Sofia Rossi', initials: 'SR', pickup: 'St Stephen’s Green', destination: 'Clontarf', distance: '7.1 km', eta: '9 min away', fare: 21.60, tone: 'orange', pickupCoords: [-6.2591, 53.3382], destinationCoords: [-6.1952, 53.3648] },
]

const fleet = [
  { id: 'TX-104', driver: 'Nora Kelly', car: 'Toyota Corolla', status: 'Available', shift: '6h 24m', color: '#22c55e' },
  { id: 'TX-208', driver: 'Aidan Murphy', car: 'Hyundai Ioniq', status: 'On trip', shift: '4h 51m', color: '#7c5cff' },
  { id: 'TX-316', driver: 'Ella Walsh', car: 'Skoda Octavia', status: 'Break', shift: '3h 08m', color: '#f59e0b' },
]

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    dispatch: 'M4 6h16M4 12h10M4 18h7M18 15l3 3-3 3',
    fleet: 'M5 17h14l-1.5-5h-11L5 17Zm2-5 2-5h6l2 5M7 17v2m10-2v2',
    reports: 'M5 20V10m7 10V4m7 16v-7',
    pin: 'M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4',
    search: 'm20 20-4.3-4.3m2.3-5.2a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
    plus: 'M12 5v14M5 12h14',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>
}

export default function App() {
  const [tab, setTab] = useState<Tab>('dispatch')
  const [pending, setPending] = useState(rides)
  const [selected, setSelected] = useState<Ride | null>(rides[0])
  const [active, setActive] = useState<Ride | null>(null)
  const [progress, setProgress] = useState(0)
  const [revenue, setRevenue] = useState(284.60)

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setProgress((value) => {
      if (value >= 100) {
        window.clearInterval(timer)
        setRevenue((cash) => cash + active.fare)
        setActive(null)
        return 0
      }
      return value + 1
    }), 900)
    return () => window.clearInterval(timer)
  }, [active])

  const available = active ? 0 : 1
  const title = tab === 'dispatch' ? 'Live dispatch' : tab === 'fleet' ? 'Your fleet' : 'Today’s performance'
  const subtitle = tab === 'dispatch' ? 'Dublin Central · Monday, 14:32' : tab === 'fleet' ? '3 vehicles · 2 drivers on shift' : 'Live business overview'
  const mapRides = useMemo(() => active ? [active] : pending, [active, pending])

  const acceptRide = (ride: Ride) => {
    if (active) return
    setActive(ride)
    setProgress(4)
    setPending((list) => list.filter((item) => item.id !== ride.id))
    setSelected(ride)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span>TF</span><div><strong>TaxiFlow</strong><small>DISPATCH</small></div></div>
        <nav>
          {(['dispatch', 'fleet', 'reports'] as Tab[]).map((item) => (
            <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>
              <Icon name={item} /><span>{item}</span>{item === 'dispatch' && pending.length > 0 && <b>{pending.length}</b>}
            </button>
          ))}
        </nav>
        <div className="shift-card"><span className="status-dot" /><div><small>DISPATCH STATUS</small><strong>Shift is live</strong></div><button aria-label="Shift settings">•••</button></div>
        <div className="operator"><span>JD</span><div><strong>Jamie Doyle</strong><small>Dispatcher</small></div><button>⌄</button></div>
      </aside>

      <main>
        <header className="topbar">
          <div><h1>{title}</h1><p>{subtitle}</p></div>
          <div className="header-actions"><button aria-label="Search"><Icon name="search" /></button><button aria-label="Notifications" className="notification"><Icon name="bell" /><i /></button><button className="new-ride" onClick={() => setTab('dispatch')}><Icon name="plus" /> New booking</button></div>
        </header>

        <section className="metric-row">
          <article><small>AVAILABLE DRIVERS</small><strong>{available}<span> / 3</span></strong><em className={available ? 'good' : 'busy'}>{available ? 'Ready now' : 'All assigned'}</em></article>
          <article><small>ACTIVE TRIPS</small><strong>{active ? 1 : 0}</strong><em>{active ? 'En route' : 'No active rides'}</em></article>
          <article><small>PENDING REQUESTS</small><strong>{pending.length}</strong><em className={pending.length ? 'warm' : 'good'}>{pending.length ? 'Needs attention' : 'All clear'}</em></article>
          <article><small>TODAY’S REVENUE</small><strong>€{revenue.toFixed(2)}</strong><em className="good">↗ 12.5%</em></article>
        </section>

        {tab === 'dispatch' && <div className="workspace map-workspace">
          <section className="map-panel">
            <DispatchMap rides={mapRides} selected={selected} active={active} progress={progress} onSelect={(ride) => setSelected(mapRides.find((item) => item.id === ride.id) ?? null)} />
            <div className="map-legend"><span><i className="driver-dot" />Vehicles</span><span><i className="pickup-dot" />Pickup</span><span><i className="dropoff-dot" />Drop off</span></div>
            {active && <div className="trip-progress"><div><small>TRIP IN PROGRESS</small><strong>{active.pickup} → {active.destination}</strong></div><b>{progress}%</b><span><i style={{ width: `${progress}%` }} /></span></div>}
          </section>
          <aside className="request-panel">
            <div className="panel-heading"><div><h2>Ride requests</h2><p>{pending.length} waiting for dispatch</p></div><button>⋯</button></div>
            <div className="request-list">
              {pending.length === 0 && <div className="empty"><span>✓</span><h3>You’re all caught up</h3><p>New requests will appear here.</p></div>}
              {pending.map((ride, index) => <article className={`ride-card ${selected?.id === ride.id ? 'selected' : ''}`} onClick={() => setSelected(ride)} key={ride.id}>
                <header><span className={`avatar ${ride.tone}`}>{ride.initials}</span><div><strong>{ride.rider}</strong><small>Passenger · {index ? 'Just now' : '2 min ago'}</small></div><b>€{ride.fare.toFixed(2)}</b></header>
                <div className="route"><i><span /><span /></i><div><small>PICKUP</small><strong>{ride.pickup}</strong><small>DESTINATION</small><strong>{ride.destination}</strong></div></div>
                <footer><span><Icon name="clock" /> {ride.eta}</span><span>{ride.distance}</span><button disabled={Boolean(active)} onClick={(event) => { event.stopPropagation(); acceptRide(ride) }}>Assign <Icon name="arrow" /></button></footer>
              </article>)}
            </div>
          </aside>
        </div>}

        {tab === 'fleet' && <section className="content-panel"><div className="section-title"><div><h2>Drivers & vehicles</h2><p>See who is ready, working, or taking a break.</p></div><button><Icon name="plus" /> Add vehicle</button></div><div className="fleet-grid">{fleet.map((vehicle) => <article key={vehicle.id}><div className="car-visual">TAXI<span>{vehicle.id}</span></div><header><div><strong>{vehicle.id}</strong><small>{vehicle.car}</small></div><em><i style={{ background: vehicle.color }} />{vehicle.status}</em></header><div className="driver-line"><span>{vehicle.driver.split(' ').map(x => x[0]).join('')}</span><div><small>DRIVER</small><strong>{vehicle.driver}</strong></div><div><small>SHIFT TIME</small><strong>{vehicle.shift}</strong></div></div><button>View vehicle <Icon name="arrow" /></button></article>)}</div></section>}

        {tab === 'reports' && <section className="content-panel"><div className="section-title"><div><h2>Performance snapshot</h2><p>Your taxi business at a glance.</p></div><button>Export report</button></div><div className="report-grid"><article><small>COMPLETED TRIPS</small><strong>18</strong><div className="bars">{[45,62,38,76,58,88,70,94,78,100,82,92].map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div></article><article><small>AVERAGE FARE</small><strong>€15.81</strong><p>Up €1.42 from yesterday</p></article><article><small>DRIVER UTILISATION</small><strong>78%</strong><div className="donut"><span>78%</span></div></article></div></section>}
      </main>
    </div>
  )
}
