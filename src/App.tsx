import { BottomNav } from './components/game/BottomNav'
import { SectionSheet } from './components/game/SectionSheet'
import { TopHud } from './components/game/TopHud'
import { GameMap } from './map/GameMap'
import { CitySetup } from './screens/CitySetup'
import { useGameStore } from './stores/gameStore'

export default function App() {
  const game = useGameStore()
  const activeJob = game.jobs.find((job) => job.status === 'accepted')
  if (!game.hasHydrated) return <div className="loading">TRAVEL EMPIRE</div>
  return <div className="game-shell">
    <GameMap cityId={game.startingCityId} activeJob={activeJob} />
    {game.company ? <>
      <TopHud company={game.company} />
      {game.activeSection !== 'map' && <SectionSheet section={game.activeSection} vehicles={game.vehicles} jobs={game.jobs} passengers={game.passengers} onClose={() => game.setSection('map')} onReset={game.resetGame} onRefreshJobs={game.refreshJobs} onAcceptJob={game.acceptJob} onCompleteJob={game.completeJob} />}
      <BottomNav active={game.activeSection} onChange={game.setSection} />
    </> : <CitySetup onStart={game.initializeCompany} />}
  </div>
}
