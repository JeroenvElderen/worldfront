import { useEffect, useState } from 'react'
import { DispatchMap } from './DispatchMap'

type Tab = 'dispatch' | 'fleet' | 'company'

const panels: Record<Tab, { title: string; items: string[] }> = {
  dispatch: { title: 'Dispatch', items: ['Jobs', 'Active routes'] },
  fleet: { title: 'Fleet', items: ['Drivers', 'Vehicles'] },
  company: { title: 'Company', items: ['Overview', 'Settings'] },
}

function NavIcon({ name }: { name: Tab }) {
  const paths = {
    dispatch: 'M4 6h16M4 12h11M4 18h7M17 15l3 3-3 3',
    fleet: 'M5 16h14l-2-6H7l-2 6Zm2 0v2m10-2v2M9 10l1.5-4h3L15 10',
    company: 'M4 20V8l8-4 8 4v12M9 20v-5h6v5M8 10h1m6 0h1',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>
}

export default function App() {
  const [openTab, setOpenTab] = useState<Tab | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setProgress((value) => value >= 99.8 ? 0 : value + 0.12), 50)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <main className="app">
      <DispatchMap progress={progress} />

      {openTab && <button className="sheet-backdrop" aria-label="Close menu" onClick={() => setOpenTab(null)} />}
      <section className={`nav-sheet ${openTab ? 'visible' : ''}`} aria-hidden={!openTab}>
        {openTab && <>
          <div className="sheet-handle" />
          <h2>{panels[openTab].title}</h2>
          <div className="sheet-links">
            {panels[openTab].items.map((item) => <button key={item}>{item}<span>›</span></button>)}
          </div>
        </>}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {(Object.keys(panels) as Tab[]).map((tab) => (
          <button key={tab} className={openTab === tab ? 'active' : ''} aria-expanded={openTab === tab} onClick={() => setOpenTab((open) => open === tab ? null : tab)}>
            <NavIcon name={tab} />
            <span>{panels[tab].title}</span>
          </button>
        ))}
      </nav>
    </main>
  )
}
