import type { Section } from '../../stores/gameStore'

const items: { id: Section; label: string; icon: string }[] = [
  { id: 'map', label: 'Map', icon: '⌖' }, { id: 'fleet', label: 'Fleet', icon: '◆' },
  { id: 'travel', label: 'Travel', icon: '✈' },
  { id: 'company', label: 'Company', icon: '▥' },
]
export function BottomNav({ active, onChange }: { active: Section; onChange: (section: Section) => void }) {
  return <nav className="bottom-nav game-panel" aria-label="Game sections">{items.map((item) =>
    <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => onChange(item.id)}><span>{item.icon}</span>{item.label}</button>
  )}</nav>
}
