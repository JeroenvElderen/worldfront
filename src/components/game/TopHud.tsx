import type { Company } from '../../models/game'

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
export function TopHud({ company }: { company: Company }) {
  return <header className="top-hud game-panel">
    <div className="brand"><span className="brand-mark">TE</span><div><p>{company.name}</p><small>Transport company</small></div></div>
    <div className="stats">
      <div><small>CASH</small><strong className="cash">{money.format(company.cash)}</strong></div>
      <div><small>REP</small><strong>★ {company.reputation}</strong></div>
      <div><small>LEVEL</small><strong>{company.level}</strong></div>
    </div>
  </header>
}
