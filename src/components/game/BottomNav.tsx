import type { Section } from '../../stores/gameStore'
import { useCurrency } from './CurrencyContext'

const items: { id: Section; label: string; hint: string; icon: string }[] = [
  { id: 'map', label: 'Map', hint: 'Live operations', icon: '◇' },
  { id: 'jobs', label: 'Dispatch', hint: 'Travel operations', icon: '▣' },
  { id: 'operations', label: 'Control', hint: 'Live incidents', icon: '⚠' },
  { id: 'fleet', label: 'Fleet', hint: 'Vehicles', icon: '▱' },
  { id: 'hotels', label: 'Hotels', hint: 'Properties & markets', icon: '▦' },
  { id: 'travel', label: 'Travel', hint: 'Grow network', icon: '✈' },
  { id: 'finance', label: 'Finance', hint: 'Performance', icon: 'currency' },
  { id: 'company', label: 'Company', hint: 'Team & goals', icon: '▥' },
]
export function BottomNav({ active, onChange, availableJobCount = 0 }: { active: Section; onChange: (section: Section) => void; availableJobCount?: number }) {
  const { currencySymbol } = useCurrency()
  return <nav className="bottom-nav game-panel" aria-label="Game sections">{items.map((item) =>
    <button key={item.id} className={active === item.id ? 'active' : ''} aria-current={active === item.id ? 'page' : undefined} aria-label={`${item.label} — ${item.hint}`} onClick={() => onChange(item.id)}>
      <span className="nav-icon">{item.icon === 'currency' ? currencySymbol : item.icon}{item.id === 'jobs' && availableJobCount > 0 && <b className="job-badge" aria-label={`${availableJobCount} available jobs`}>{availableJobCount > 9 ? '9+' : availableJobCount}</b>}</span>
      <span className="nav-copy"><strong>{item.label}</strong><small>{item.hint}</small></span>
    </button>
  )}</nav>
}
