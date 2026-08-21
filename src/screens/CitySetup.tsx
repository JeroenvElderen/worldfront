import { useState } from 'react'
import { cities } from '../data/cities'

export function CitySetup({ onStart }: { onStart: (cityId: string) => void }) {
  const startingCities = cities.filter((city) => city.countryCode === 'IE')
  const [selected, setSelected] = useState(startingCities[0].id)
  return <div className="setup-backdrop"><main className="setup-sheet game-panel">
    <div className="setup-emblem">TE</div><small className="eyebrow">YOUR JOURNEY STARTS HERE</small>
    <h1>Build your<br/><em>Travel Empire</em></h1>
    <p>Choose a home city. We’ll set up your first vehicle and take you straight to the command map.</p>
    <div className="city-grid" role="radiogroup" aria-label="Starting city">{startingCities.map((city) =>
      <button role="radio" aria-checked={selected === city.id} className={selected === city.id ? 'selected' : ''} key={city.id} onClick={() => setSelected(city.id)}>
        <span>{city.name}</span><small>Ireland</small><b>✓</b>
      </button>)}</div>
    <div className="starter"><span>🚕</span><div><small>YOUR STARTER VEHICLE</small><strong>Compact Taxi</strong></div><b>Included</b></div>
    <button className="start-button" onClick={() => onStart(selected)}>Start your company <span>→</span></button>
  </main></div>
}
