import { useEffect } from 'react'
import { BottomNav } from './components/game/BottomNav'
import { SectionSheet } from './components/game/SectionSheet'
import { TopHud } from './components/game/TopHud'
import { GameMap } from './map/GameMap'
import { CitySetup } from './screens/CitySetup'
import { useGameStore } from './stores/gameStore'
import { JOB_REQUEST_INTERVAL_MS } from './services/jobEngine'

export default function App() {
  const game = useGameStore()
  useEffect(() => {
    if (!game.company) return
    // Hydrated saves with no offers should not wait for the first interval.
    if (!game.jobs.some((job) => job.status === 'offered' || job.status === 'accepted')) game.refreshJobs()
    const interval = window.setInterval(game.addRandomJob, JOB_REQUEST_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [game.company, game.jobs, game.refreshJobs, game.addRandomJob])
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
