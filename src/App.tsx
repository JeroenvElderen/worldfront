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
  const { company, jobs, refreshJobs, addRandomJob } = game
  useEffect(() => {
    if (!company) return
    // Hydrated saves with no offers should not wait for the first interval.
    if (!jobs.some((job) => job.status === 'offered' || job.status === 'accepted')) refreshJobs()
    const interval = window.setInterval(addRandomJob, JOB_REQUEST_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [company, jobs, refreshJobs, addRandomJob])
  if (!game.hasHydrated) return <div className="loading">TRAVEL EMPIRE</div>
  return <div className="game-shell">
    <GameMap cityId={game.startingCityId} vehicles={game.vehicles} jobs={game.jobs} />
    {game.company ? <>
      <TopHud company={game.company} />
      {game.activeSection !== 'map' && <SectionSheet section={game.activeSection} vehicles={game.vehicles} jobs={game.jobs} passengers={game.passengers} cash={game.company.cash} onClose={() => game.setSection('map')} onReset={game.resetGame} onRefreshJobs={game.refreshJobs} onAcceptJob={game.acceptJob} onCompleteJob={game.completeJob} onBuyTaxi={game.buyTaxi} />}
      <BottomNav active={game.activeSection} onChange={game.setSection} />
    </> : <CitySetup onStart={game.initializeCompany} />}
  </div>
}
