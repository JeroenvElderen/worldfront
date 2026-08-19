import { BottomNav } from './components/game/BottomNav'
import { SectionSheet } from './components/game/SectionSheet'
import { TopHud } from './components/game/TopHud'
import { GameMap } from './map/GameMap'
import { CitySetup } from './screens/CitySetup'
import { useGameStore } from './stores/gameStore'

export default function App() {
  const game = useGameStore()
  if (!game.hasHydrated) return <div className="loading">TRAVEL EMPIRE</div>
  return <div className="game-shell">
    <GameMap cityId={game.startingCityId} />
    {game.company ? <>
      <TopHud company={game.company} />
      {game.activeSection !== 'map' && <SectionSheet section={game.activeSection} vehicles={game.vehicles} onClose={() => game.setSection('map')} onReset={game.resetGame} />}
      <BottomNav active={game.activeSection} onChange={game.setSection} />
    </> : <CitySetup onStart={game.initializeCompany} />}
  </div>
}
