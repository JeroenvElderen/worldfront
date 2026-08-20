import type { Section } from '../../stores/gameStore'
import { useState } from 'react'
import { taxiModels } from '../../data/taxis'
import { postVehicleModels } from '../../data/postVehicles'
import type { Driver, ExteriorAccessory, Loan, Vehicle } from '../../models/game'

interface SectionSheetProps { section: Exclude<Section, 'map' | 'jobs'>; vehicles: Vehicle[]; drivers: Driver[]; loans: Loan[]; cash: number; onClose: () => void; onReset: () => void; onBuyTaxi: (modelId: string) => void; onLeaseTaxi: (modelId: string) => void; onBuyPostVehicle: (modelId: string) => void; onStartPostalRoute: (vehicleId: string) => void; onTakeLoan: (amount: number) => void; onSellVehicle: (vehicleId: string) => void; onSetDriverShift: (driverId: string, shift: Driver['shift']) => void; onToggleAccessory: (vehicleId: string, accessory: ExteriorAccessory) => void }
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const exteriorAccessories: Array<{ id: ExteriorAccessory; label: string; icon: string }> = [
  { id: 'panoramic-roof', label: 'Panoramic roof', icon: '🌅' }, { id: 'towbar', label: 'Towbar', icon: '🪝' },
  { id: 'roof-rack', label: 'Roof rack', icon: '🧳' }, { id: 'mud-flaps', label: 'Mud flaps', icon: '💦' },
  { id: 'wind-deflectors', label: 'Wind deflectors', icon: '🌬️' },
]
const getModel = (vehicle: Vehicle) => taxiModels.find((model) => model.id === vehicle.modelId || (!vehicle.modelId && model.powertrain === vehicle.powertrain))

export function SectionSheet({ section, vehicles, drivers, loans, cash, onClose, onReset, onBuyTaxi, onLeaseTaxi, onBuyPostVehicle, onStartPostalRoute, onTakeLoan, onSellVehicle, onSetDriverShift, onToggleAccessory }: SectionSheetProps) {
  const [selectedTaxi, setSelectedTaxi] = useState(taxiModels[0].id)
  const [customizingVehicleId, setCustomizingVehicleId] = useState(vehicles[0]?.id ?? '')
  const content = {
    fleet: [`${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} in your fleet`, vehicles[0] ? `${vehicles[0].name} · ${vehicles[0].condition}% condition · ${vehicles[0].status}` : 'Purchase your first vehicle.'],
    travel: ['Travel agency locked', 'Reach company level 3 to begin creating tours.'],
    company: ['Your company', 'Manage finances, staff and expansion from here.'],
  }[section]
  if (section === 'fleet') return <section className="section-sheet fleet-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>FLEET</small><h2>{vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'} on the road</h2>
    <div className="fleet-list">{vehicles.map((vehicle) => { const model = vehicle.type === 'taxi' ? getModel(vehicle) : undefined; const driver = drivers.find((candidate) => candidate.id === vehicle.driverId); return <button className={`fleet-card ${customizingVehicleId === vehicle.id ? 'selected' : ''}`} onClick={() => setCustomizingVehicleId(vehicle.id)} key={vehicle.id}>{model ? <img className="brand-logo" src={model.logoUrl} alt={`${model.brand} logo`} /> : <span className="postal-badge">📮</span>}<div><strong>{vehicle.name}</strong><small>{vehicle.condition}% condition · {vehicle.postalRoute ? `Delivering · ${vehicle.postalRoute.stops.length - 2} stops` : vehicle.status === 'on-job' ? 'Driving' : vehicle.serviceTrip ? `Going to ${vehicle.serviceTrip.label}` : 'Available'} · {vehicle.ownership ?? 'owned'}</small><div className="meter-row"><span>⛽ {Math.round(vehicle.fuel)}%</span><span>😴 {Math.round(driver?.fatigue ?? 0)}%</span></div></div></button> })}</div>
    {(() => { const vehicle = vehicles.find((candidate) => candidate.id === customizingVehicleId); const driver = drivers.find((candidate) => candidate.id === vehicle?.driverId); return vehicle && <div className="vehicle-actions"><div><b>{driver?.name ?? 'No driver assigned'}</b>{driver && <button onClick={() => onSetDriverShift(driver.id, driver.shift === 'day' ? 'night' : 'day')}>{driver.shift} shift · change</button>}</div><button disabled={vehicle.status !== 'available' || vehicles.length <= 1} onClick={() => onSellVehicle(vehicle.id)}>{vehicle.ownership === 'leased' ? 'Return lease' : `Sell for ${money.format(vehicle.value * .65 * vehicle.condition / 100)}`}</button></div> })()}
    {vehicles.find((vehicle) => vehicle.id === customizingVehicleId)?.type === 'taxi' && <><small className="purchase-label">CUSTOMISE EXTERIOR</small><div className="accessory-grid">{exteriorAccessories.map((accessory) => { const vehicle = vehicles.find((candidate) => candidate.id === customizingVehicleId)!; const fitted = (vehicle.exteriorAccessories ?? []).includes(accessory.id); return <button className={fitted ? 'fitted' : ''} key={accessory.id} onClick={() => onToggleAccessory(vehicle.id, accessory.id)}><span>{accessory.icon}</span><strong>{accessory.label}</strong><small>{fitted ? 'Fitted · tap to remove' : 'Tap to fit'}</small></button> })}</div></>}
    {(() => { const vehicle = vehicles.find((candidate) => candidate.id === customizingVehicleId); return vehicle?.type === 'post' && <div className="postal-route-control"><small>AUTOMATIC POSTAL ROUND</small><p>Dispatch the van on a newly generated local round lasting between one hour and a full eight-hour working day. It visits a varied set of stops and returns to its depot automatically.</p><button className="primary-action" disabled={vehicle.status !== 'available'} onClick={() => onStartPostalRoute(vehicle.id)}>{vehicle.postalRoute ? `${vehicle.postalRoute.plannedHours ?? '?'}h route in progress · ${vehicle.postalRoute.stops.length - 2} stops` : 'Generate and start a route'}</button></div> })()}
    <small className="purchase-label">CHOOSE YOUR NEXT TAXI</small>
    <div className="taxi-shop">{taxiModels.map((model) => <button className={selectedTaxi === model.id ? 'selected' : ''} key={model.id} onClick={() => setSelectedTaxi(model.id)}>
      <img className="brand-logo" src={model.logoUrl} alt={`${model.brand} logo`} loading="lazy" /><strong>{model.brand} {model.name}</strong><small>{model.description}<br />{model.powertrain} · {model.capacity} seats · {model.topSpeedKmh} km/h</small><b>{money.format(model.price)}</b>
    </button>)}</div>
    {(() => { const model = taxiModels.find((taxi) => taxi.id === selectedTaxi) ?? taxiModels[0]; return <div className="purchase-actions"><button className="primary-action" disabled={cash < model.price} onClick={() => onBuyTaxi(model.id)}>{cash < model.price ? 'Not enough cash' : `Buy ${model.name}`}</button><button onClick={() => onLeaseTaxi(model.id)} disabled={cash < model.price * .1}>Lease · {money.format(model.price * .1)} deposit</button></div> })()}
    <small className="purchase-label">ADD A POSTAL SERVICE</small>
    <div className="post-shop">{postVehicleModels.map((model) => <div key={model.id}><span>📮</span><div><strong>{model.brand} {model.name}</strong><small>{model.description}<br />{model.powertrain} · {model.capacity} parcels</small></div><b>{money.format(model.price)}</b><button disabled={cash < model.price} onClick={() => onBuyPostVehicle(model.id)}>Buy post van</button></div>)}</div>
  </section>
  if (section === 'company') return <section className="section-sheet company-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button><small>COMPANY</small><h2>Finance</h2>
    <div className="finance-summary"><div><small>CASH</small><b>{money.format(cash)}</b></div><div><small>DEBT</small><b>{money.format(loans.reduce((sum, loan) => sum + loan.balance, 0))}</b></div></div>
    <h3>Business loans</h3><p>Loans include 12% interest and are repaid in ten automatic instalments.</p><div className="loan-actions"><button onClick={() => onTakeLoan(10_000)}>Borrow €10,000</button><button onClick={() => onTakeLoan(25_000)}>Borrow €25,000</button></div>
    <div className="loan-list">{loans.map((loan) => <div key={loan.id}><b>{money.format(loan.balance)} remaining</b><small>{money.format(loan.paymentAmount)} next payment</small></div>)}</div>
    <button className="danger-link" onClick={onReset}>Start a new company</button>
  </section>
  return <section className="section-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>{section.toUpperCase()}</small><h2>{content[0]}</h2><p>{content[1]}</p>
  </section>
}
