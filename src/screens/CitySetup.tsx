import { useState } from 'react'
import { cities } from '../data/cities'

export function CitySetup({ onStart }: { onStart: (cityId: string) => void }) {
  const [selected, setSelected] = useState(cities[0].id)
  return <div className="setup-backdrop"><main className="setup-sheet game-panel">
    <div className="setup-emblem">TE</div><small className="eyebrow">WELCOME, FOUNDER</small>
    <h1>Build your<br/><em>Travel Empire</em></h1>
    <p>Choose where your first taxi company will open its doors.</p>
    <div className="city-grid" role="radiogroup" aria-label="Starting city">{cities.map((city) =>
      <button role="radio" aria-checked={selected === city.id} className={selected === city.id ? 'selected' : ''} key={city.id} onClick={() => setSelected(city.id)}>
        <span>{city.name}</span><small>Ireland</small><b>✓</b>
      </button>)}</div>
    <div className="starter"><span>🚕</span><div><small>YOUR STARTER VEHICLE</small><strong>Compact Taxi</strong></div><b>Included</b></div>
    <button className="start-button" onClick={() => onStart(selected)}>Start your company <span>→</span></button>
  </main></div>
}
