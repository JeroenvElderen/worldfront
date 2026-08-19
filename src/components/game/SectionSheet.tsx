import type { Section } from '../../stores/gameStore'
import type { Vehicle } from '../../models/game'

export function SectionSheet({ section, vehicles, onClose, onReset }: { section: Exclude<Section, 'map'>; vehicles: Vehicle[]; onClose: () => void; onReset: () => void }) {
  const content = {
    jobs: ['No jobs available yet', 'New taxi requests will appear here as your company grows.'],
    fleet: [`${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} in your fleet`, vehicles[0] ? `${vehicles[0].name} · ${vehicles[0].condition}% condition · ${vehicles[0].status}` : 'Purchase your first vehicle.'],
    travel: ['Travel agency locked', 'Reach company level 3 to begin creating tours.'],
    company: ['Your company', 'Manage finances, staff and expansion from here.'],
  }[section]
  return <section className="section-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>{section.toUpperCase()}</small><h2>{content[0]}</h2><p>{content[1]}</p>
    {section === 'company' && <button className="danger-link" onClick={onReset}>Start a new company</button>}
  </section>
}
