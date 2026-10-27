import { useState } from 'react'
import type { Section } from '../../stores/gameStore'
import { useCurrency } from './CurrencyContext'

const items: { id: Section; label: string; hint: string; icon: string }[] = [
  { id: 'map', label: 'Map', hint: 'Live operations', icon: '◇' },
  { id: 'jobs', label: 'Dispatch', hint: 'Taxi operations', icon: '▣' },
  { id: 'postal', label: 'Postal', hint: 'Rounds & tenders', icon: '📮' },
  { id: 'operations', label: 'Control', hint: 'Live incidents', icon: '⚠' },
  { id: 'fleet', label: 'Fleet', hint: 'Vehicles', icon: '▱' },
  { id: 'hotels', label: 'Hotels', hint: 'Properties & markets', icon: '▦' },
  { id: 'finance', label: 'Finance', hint: 'Performance', icon: 'currency' },
  { id: 'company', label: 'Company', hint: 'Team & goals', icon: '▥' },
]
export function BottomNav({ active, onChange, availableJobCount = 0, onCloudClick }: { active: Section; onChange: (section: Section) => void; availableJobCount?: number; onCloudClick: () => void }) {
  const { currencySymbol } = useCurrency()
  const [moreOpen, setMoreOpen] = useState(false)
  return <nav className="bottom-nav game-panel" aria-label="Game sections">{items.map((item) =>
    <button key={item.id} className={active === item.id ? 'active' : ''} aria-current={active === item.id ? 'page' : undefined} aria-label={`${item.label} — ${item.hint}`} onClick={() => onChange(item.id)}>
      <span className="nav-icon">{item.icon === 'currency' ? currencySymbol : item.icon}{item.id === 'jobs' && availableJobCount > 0 && <b className="job-badge" aria-label={`${availableJobCount} available jobs`}>{availableJobCount > 9 ? '9+' : availableJobCount}</b>}</span>
      <span className="nav-copy"><strong>{item.label}</strong><small>{item.hint}</small></span>
    </button>
  )}<div style={{ position: 'relative', flex: '0 0 auto' }}><button type="button" aria-label="More options" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}><span className="nav-icon">⋯</span><span className="nav-copy"><strong>More</strong><small>Options</small></span></button>{moreOpen && <div role="menu" aria-label="More options" style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 12, padding: 8, borderRadius: 12, background: '#12232d', boxShadow: '0 8px 28px #0009', minWidth: 170, zIndex: 2000 }}><button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onCloudClick() }} style={{ width: '100%', color: '#fff', textAlign: 'left', padding: 10 }}>☁ Cloud saves</button></div>}</div></nav>
}
