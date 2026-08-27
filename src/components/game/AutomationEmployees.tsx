import type { AutomationEmployee, AutomationRole } from '../../models/game'
import { automationRoleDetails } from '../../services/fleetOperations'
import { useCurrency } from './CurrencyContext'

const roles = Object.keys(automationRoleDetails) as AutomationRole[]

interface Props {
  employees: AutomationEmployee[]
  activeCityId: string
  onHire: (role: AutomationRole) => void
  onFire: (id: string) => void
  onUpdate: (id: string, patch: { enabled?: boolean; spendingLimit?: number }) => void
}

export function AutomationEmployees({ employees, activeCityId, onHire, onFire, onUpdate }: Props) {
  const { money } = useCurrency()
  const localEmployees = employees.filter((employee) => employee.cityId === activeCityId)
  return <section className="automation-employees">
    <header><div><small>EMPLOYEE-DRIVEN AUTOMATION</small><h3>Management team</h3><p>Nothing is automated unless a qualified employee is hired and on duty.</p></div><b>{localEmployees.filter((employee) => employee.enabled).length} active</b></header>
    <div className="manager-roster">{localEmployees.map((employee) => { const details = automationRoleDetails[employee.role]; return <article key={employee.id}>
      <span>{details.icon}</span><div><strong>{employee.name}</strong><small>{details.label} · skill {employee.skill} · reliability {employee.reliability}%</small><em>Capacity {employee.capacity} · {money.format(employee.salary)}/month · {employee.experience} XP</em></div>
      <label><input type="checkbox" checked={employee.enabled} onChange={(event) => onUpdate(employee.id, { enabled: event.target.checked })} /> On duty</label>
      {details.spendingLimit > 0 && <label className="authority">Authority · {money.format(employee.spendingLimit)}<input type="range" min="0" max={Math.max(3000, details.spendingLimit * 3)} step="100" value={employee.spendingLimit} onChange={(event) => onUpdate(employee.id, { spendingLimit: Number(event.target.value) })} /></label>}
      <button onClick={() => onFire(employee.id)}>Dismiss</button>
    </article> })}</div>
    <h4>Hire a manager</h4><div className="manager-market">{roles.map((role) => { const details = automationRoleDetails[role]; const hired = localEmployees.some((employee) => employee.role === role); return <button key={role} disabled={hired} onClick={() => onHire(role)}><span>{details.icon}</span><strong>{hired ? '✓ ' : ''}{details.label}</strong><small>{details.description}</small><b>{money.format(details.salary)}/month</b></button> })}</div>
  </section>
}
