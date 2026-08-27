import type { MaintenanceAlert, MaintenanceKind, Vehicle } from '../../models/game'
import { useCurrency } from './CurrencyContext'

interface Props {
  alert: MaintenanceAlert
  vehicle?: Vehicle
  onSend: (vehicleId: string, kind: MaintenanceKind) => void
  onClean: (vehicleId: string, service: 'standard' | 'detail') => void
  onDismiss: (alertId: string) => void
  onOpenFleet: () => void
}

export function MaintenancePopup({ alert, vehicle, onSend, onClean, onDismiss, onOpenFleet }: Props) {
  const { money } = useCurrency()
  if (!vehicle) return null
  const blocked = vehicle.status !== 'available'
  return <div className="maintenance-backdrop" role="presentation">
    <aside className={`maintenance-popup ${alert.severity}`} role="alertdialog" aria-labelledby="maintenance-title">
      <header><span>{alert.kind === 'tires' ? '🛞' : alert.kind === 'cleaning' ? '✨' : '🔧'}</span><div><small>{alert.severity.toUpperCase()} · WORKSHOP ADVISORY</small><h2 id="maintenance-title">{alert.title}</h2></div></header>
      <p>{alert.message}</p>
      <div className="maintenance-readings"><span><small>CONDITION</small><b>{Math.round(vehicle.condition)}%</b></span><span><small>TIRES</small><b>{Math.round(vehicle.tireCondition ?? 100)}%</b></span><span><small>CLEAN</small><b>{Math.round(vehicle.cleanliness ?? 100)}%</b></span></div>
      {blocked && <em>Finish the vehicle’s current work before sending it for service.</em>}
      <div className="maintenance-actions">
        {alert.kind === 'cleaning' ? <><button disabled={blocked} onClick={() => onClean(vehicle.id, 'standard')}>Standard clean · {money.format(80)}</button><button disabled={blocked} onClick={() => onClean(vehicle.id, 'detail')}>Full detail · {money.format(260)}</button></> : <button disabled={blocked} onClick={() => onSend(vehicle.id, alert.kind as MaintenanceKind)}>Send to workshop</button>}
        <button onClick={() => { onOpenFleet(); onDismiss(alert.id) }}>Open fleet</button>
        <button className="quiet" onClick={() => onDismiss(alert.id)}>Dismiss for now</button>
      </div>
    </aside>
  </div>
}
