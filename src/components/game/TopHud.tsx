import type { Company } from '../../models/game'
import { progressionForReputation } from '../../services/companyProgression'

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
export function TopHud({ company }: { company: Company }) {
  const progression = progressionForReputation(company.reputation)
  return <header className="top-hud game-panel">
    <div className="brand"><span className="brand-mark">TE</span><div><p>{company.name}</p><small>Transport company</small></div></div>
    <div className="stats">
      <div><small>CASH</small><strong className="cash">{money.format(company.cash)}</strong></div>
      <div><small>REP</small><strong>★ {company.reputation}</strong></div>
      <div className="level-stat" title={`${progression.current}/${progression.required} reputation · jobs up to ${progression.maxJobDistanceKm} km`}><small>LEVEL</small><strong>{progression.level}</strong><span>{progression.current}/{progression.required} · {progression.maxJobDistanceKm} KM</span></div>
    </div>
  </header>
}
