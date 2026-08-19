import type { Section } from '../../stores/gameStore'
import { useState } from 'react'
import { taxiModels } from '../../data/taxis'
import type { TaxiPowertrain, Vehicle } from '../../models/game'

interface SectionSheetProps { section: Exclude<Section, 'map'>; vehicles: Vehicle[]; cash: number; onClose: () => void; onReset: () => void; onBuyTaxi: (powertrain: TaxiPowertrain) => void }
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function SectionSheet({ section, vehicles, cash, onClose, onReset, onBuyTaxi }: SectionSheetProps) {
  const [selectedTaxi, setSelectedTaxi] = useState<TaxiPowertrain>('diesel')
  const content = {
    fleet: [`${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} in your fleet`, vehicles[0] ? `${vehicles[0].name} · ${vehicles[0].condition}% condition · ${vehicles[0].status}` : 'Purchase your first vehicle.'],
    travel: ['Travel agency locked', 'Reach company level 3 to begin creating tours.'],
    company: ['Your company', 'Manage finances, staff and expansion from here.'],
  }[section]
  if (section === 'fleet') return <section className="section-sheet fleet-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>FLEET</small><h2>{vehicles.length} taxi{vehicles.length === 1 ? '' : 's'} on the road</h2>
    <div className="fleet-list">{vehicles.map((vehicle) => <article className="fleet-card" key={vehicle.id}><span>{taxiModels.find((model) => model.id === (vehicle.powertrain ?? 'diesel'))?.icon ?? '🚕'}</span><div><strong>{vehicle.name}</strong><small>{vehicle.condition}% condition · {vehicle.status === 'on-job' ? 'Driving' : 'Available'} · {vehicle.powertrain ?? 'diesel'}</small></div></article>)}</div>
    <small className="purchase-label">CHOOSE YOUR NEXT TAXI</small>
    <div className="taxi-shop">{taxiModels.map((model) => <button className={selectedTaxi === model.id ? 'selected' : ''} key={model.id} onClick={() => setSelectedTaxi(model.id)}>
      <span>{model.icon}</span><strong>{model.name}</strong><small>{model.description}<br />{model.capacity} seats · up to {model.topSpeedKmh} km/h</small><b>{money.format(model.price)}</b>
    </button>)}</div>
    {(() => { const model = taxiModels.find((taxi) => taxi.id === selectedTaxi) ?? taxiModels[0]; return <button className="primary-action" disabled={cash < model.price} onClick={() => onBuyTaxi(model.id)}>{cash < model.price ? 'Not enough cash' : `Buy ${model.name}`}</button> })()}
  </section>
  return <section className="section-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>{section.toUpperCase()}</small><h2>{content[0]}</h2><p>{content[1]}</p>
    {section === 'company' && <button className="danger-link" onClick={onReset}>Start a new company</button>}
  </section>
}
