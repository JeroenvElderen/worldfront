import { useEffect, useState } from 'react'
import type { Company } from '../../models/game'
import { progressionForReputation } from '../../services/companyProgression'
import { gameDateAt } from '../../services/gameTime'
import { useCurrency } from './CurrencyContext'

export function TopHud({ company }: { company: Company }) {
  const { money, locale } = useCurrency()
  const progression = progressionForReputation(company.reputation)
  const [gameDate, setGameDate] = useState(() => gameDateAt(company.foundedAt))
  useEffect(() => {
    const updateClock = () => setGameDate(gameDateAt(company.foundedAt))
    updateClock()
    const timer = window.setInterval(updateClock, 1_000)
    return () => window.clearInterval(timer)
  }, [company.foundedAt])
  const date = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(gameDate)
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(gameDate)
  return <header className="top-hud game-panel">
    <div className="hud-card balance-card">
      <span className="hud-icon" aria-hidden="true">▰</span>
      <span className="hud-copy"><strong>{money.format(company.cash)}</strong><small>Balance</small></span>
    </div>
    <div className="hud-card level-card" title={`${progression.current.toFixed(1)}/${progression.required} reputation · jobs up to ${progression.maxJobDistanceKm} km`}>
      <span className="level-gem" aria-hidden="true">{progression.level}</span>
      <span className="hud-copy"><strong>Level {progression.level}</strong><i><b style={{ width: `${Math.min(100, progression.current / progression.required * 100)}%` }} /></i><small>{progression.current.toFixed(1)} / {progression.required} XP</small></span>
    </div>
    <div className="hud-card rating-card">
      <span className="rating-star" aria-hidden="true">★</span>
      <span className="hud-copy"><strong>{company.reputation.toFixed(1)}</strong><small>Rating</small></span>
      <span className="hud-menu" aria-hidden="true">☰</span>
    </div>
    <span className="hud-context">{company.name} · {date} · {time}</span>
  </header>
}
