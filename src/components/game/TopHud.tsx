import { useEffect, useState } from 'react'
import type { Company } from '../../models/game'
import { progressionForReputation } from '../../services/companyProgression'
import { gameDateAt } from '../../services/gameTime'

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
export function TopHud({ company }: { company: Company }) {
  const progression = progressionForReputation(company.reputation)
  const [gameDate, setGameDate] = useState(() => gameDateAt(company.foundedAt))
  useEffect(() => {
    const updateClock = () => setGameDate(gameDateAt(company.foundedAt))
    updateClock()
    const timer = window.setInterval(updateClock, 1_000)
    return () => window.clearInterval(timer)
  }, [company.foundedAt])
  const date = new Intl.DateTimeFormat('en-IE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(gameDate)
  const time = new Intl.DateTimeFormat('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(gameDate)
  return <header className="top-hud game-panel">
    <div className="brand"><span className="brand-mark">TE</span><div><p>{company.name}</p><small>{date} · {time}</small></div></div>
    <div className="stats">
      <div><small>CASH</small><strong className="cash">{money.format(company.cash)}</strong></div>
      <div><small>REP</small><strong>★ {company.reputation}</strong></div>
      <div className="level-stat" title={`${progression.current}/${progression.required} reputation · jobs up to ${progression.maxJobDistanceKm} km`}><small>LEVEL</small><strong>{progression.level}</strong><span>{progression.current}/{progression.required} · {progression.maxJobDistanceKm} KM</span></div>
    </div>
  </header>
}
