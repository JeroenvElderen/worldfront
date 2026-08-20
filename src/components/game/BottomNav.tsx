import type { Section } from '../../stores/gameStore'

const items: { id: Section; label: string; icon: string }[] = [
  { id: 'map', label: 'Map', icon: '⌖' }, { id: 'jobs', label: 'Jobs', icon: '📋' }, { id: 'fleet', label: 'Fleet', icon: '◆' },
  { id: 'travel', label: 'Travel', icon: '✈' },
  { id: 'finance', label: 'Finance', icon: '€' },
  { id: 'company', label: 'Company', icon: '▥' },
]
export function BottomNav({ active, onChange, availableJobCount = 0 }: { active: Section; onChange: (section: Section) => void; availableJobCount?: number }) {
  return <nav className="bottom-nav game-panel" aria-label="Game sections">{items.map((item) =>
    <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => onChange(item.id)}>
      <span className="nav-icon">{item.icon}{item.id === 'jobs' && availableJobCount > 0 && <b className="job-badge" aria-label={`${availableJobCount} available jobs`}>{availableJobCount > 9 ? '9+' : availableJobCount}</b>}</span>
      {item.label}
    </button>
  )}</nav>
}
