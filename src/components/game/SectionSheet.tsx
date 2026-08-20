import type { Section } from '../../stores/gameStore'
import { useState } from 'react'
import { taxiModels } from '../../data/taxis'
import type { ExteriorAccessory, Vehicle } from '../../models/game'

interface SectionSheetProps { section: Exclude<Section, 'map' | 'jobs'>; vehicles: Vehicle[]; cash: number; onClose: () => void; onReset: () => void; onBuyTaxi: (modelId: string) => void; onToggleAccessory: (vehicleId: string, accessory: ExteriorAccessory) => void }
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const exteriorAccessories: Array<{ id: ExteriorAccessory; label: string; icon: string }> = [
  { id: 'panoramic-roof', label: 'Panoramic roof', icon: '🌅' }, { id: 'towbar', label: 'Towbar', icon: '🪝' },
  { id: 'roof-rack', label: 'Roof rack', icon: '🧳' }, { id: 'mud-flaps', label: 'Mud flaps', icon: '💦' },
  { id: 'wind-deflectors', label: 'Wind deflectors', icon: '🌬️' },
]
const getModel = (vehicle: Vehicle) => taxiModels.find((model) => model.id === vehicle.modelId || (!vehicle.modelId && model.powertrain === vehicle.powertrain))

export function SectionSheet({ section, vehicles, cash, onClose, onReset, onBuyTaxi, onToggleAccessory }: SectionSheetProps) {
  const [selectedTaxi, setSelectedTaxi] = useState(taxiModels[0].id)
  const [customizingVehicleId, setCustomizingVehicleId] = useState(vehicles[0]?.id ?? '')
  const content = {
    fleet: [`${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} in your fleet`, vehicles[0] ? `${vehicles[0].name} · ${vehicles[0].condition}% condition · ${vehicles[0].status}` : 'Purchase your first vehicle.'],
    travel: ['Travel agency locked', 'Reach company level 3 to begin creating tours.'],
    company: ['Your company', 'Manage finances, staff and expansion from here.'],
  }[section]
  if (section === 'fleet') return <section className="section-sheet fleet-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>FLEET</small><h2>{vehicles.length} taxi{vehicles.length === 1 ? '' : 's'} on the road</h2>
    <div className="fleet-list">{vehicles.map((vehicle) => { const model = getModel(vehicle); return <button className={`fleet-card ${customizingVehicleId === vehicle.id ? 'selected' : ''}`} onClick={() => setCustomizingVehicleId(vehicle.id)} key={vehicle.id}>{model ? <img className="brand-logo" src={model.logoUrl} alt={`${model.brand} logo`} /> : <span className="brand-fallback">TAXI</span>}<div><strong>{vehicle.name}</strong><small>{vehicle.condition}% condition · {vehicle.status === 'on-job' ? 'Driving' : 'Available'} · {vehicle.powertrain ?? 'diesel'}</small></div></button> })}</div>
    {vehicles.find((vehicle) => vehicle.id === customizingVehicleId) && <><small className="purchase-label">CUSTOMISE EXTERIOR</small><div className="accessory-grid">{exteriorAccessories.map((accessory) => { const vehicle = vehicles.find((candidate) => candidate.id === customizingVehicleId)!; const fitted = (vehicle.exteriorAccessories ?? []).includes(accessory.id); return <button className={fitted ? 'fitted' : ''} key={accessory.id} onClick={() => onToggleAccessory(vehicle.id, accessory.id)}><span>{accessory.icon}</span><strong>{accessory.label}</strong><small>{fitted ? 'Fitted · tap to remove' : 'Tap to fit'}</small></button> })}</div></>}
    <small className="purchase-label">CHOOSE YOUR NEXT TAXI</small>
    <div className="taxi-shop">{taxiModels.map((model) => <button className={selectedTaxi === model.id ? 'selected' : ''} key={model.id} onClick={() => setSelectedTaxi(model.id)}>
      <img className="brand-logo" src={model.logoUrl} alt={`${model.brand} logo`} loading="lazy" /><strong>{model.brand} {model.name}</strong><small>{model.description}<br />{model.powertrain} · {model.capacity} seats · {model.topSpeedKmh} km/h</small><b>{money.format(model.price)}</b>
    </button>)}</div>
    {(() => { const model = taxiModels.find((taxi) => taxi.id === selectedTaxi) ?? taxiModels[0]; return <button className="primary-action" disabled={cash < model.price} onClick={() => onBuyTaxi(model.id)}>{cash < model.price ? 'Not enough cash' : `Buy ${model.name}`}</button> })()}
  </section>
  return <section className="section-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>{section.toUpperCase()}</small><h2>{content[0]}</h2><p>{content[1]}</p>
    {section === 'company' && <button className="danger-link" onClick={onReset}>Start a new company</button>}
  </section>
}
