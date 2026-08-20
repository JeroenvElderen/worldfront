import { useEffect } from 'react'
import { BottomNav } from './components/game/BottomNav'
import { SectionSheet } from './components/game/SectionSheet'
import { TopHud } from './components/game/TopHud'
import { TaxiCallPopup } from './components/game/TaxiCallPopup'
import { GameMap } from './map/GameMap'
import { CitySetup } from './screens/CitySetup'
import { useGameStore } from './stores/gameStore'
import { JOB_REQUEST_INTERVAL_MS } from './services/jobEngine'

export default function App() {
  const game = useGameStore()
  const { company, refreshJobs, addRandomJob, tickJobs } = game
  useEffect(() => {
    if (!company) return
    // Hydrated saves with no offers should not wait for the first interval.
    const savedJobs = useGameStore.getState().jobs
    if (!savedJobs.some((job) => job.status === 'offered' || job.status === 'accepted')) refreshJobs()
    const interval = window.setInterval(addRandomJob, JOB_REQUEST_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [company, refreshJobs, addRandomJob])
  useEffect(() => {
    if (!company) return
    tickJobs()
    const interval = window.setInterval(tickJobs, 1_000)
    return () => window.clearInterval(interval)
  }, [company, tickJobs])
  useEffect(() => {
    if (!company) return
    const resumeGame = () => {
      if (document.visibilityState === 'hidden') return
      // Mobile WebViews suspend timers in the background. Settle overdue trips first
      // so their taxis are available before immediately requesting a new offer.
      tickJobs()
      void addRandomJob()
    }
    document.addEventListener('visibilitychange', resumeGame)
    window.addEventListener('pageshow', resumeGame)
    window.addEventListener('focus', resumeGame)
    return () => {
      document.removeEventListener('visibilitychange', resumeGame)
      window.removeEventListener('pageshow', resumeGame)
      window.removeEventListener('focus', resumeGame)
    }
  }, [company, tickJobs, addRandomJob])
  if (!game.hasHydrated) return <div className="loading">TRAVEL EMPIRE</div>
  return <div className="game-shell">
    <GameMap cityId={game.startingCityId} vehicles={game.vehicles} jobs={game.jobs} onOpenJob={game.openJob} />
    {game.company ? <>
      <TopHud company={game.company} />
      {game.activeSection === 'map' && <TaxiCallPopup focusedJobId={game.focusedJobId} vehicles={game.vehicles} jobs={game.jobs} passengers={game.passengers} onAccept={game.acceptJob} onDecline={game.declineJob} />}
      {game.activeSection !== 'map' && <SectionSheet section={game.activeSection} vehicles={game.vehicles} cash={game.company.cash} onClose={() => game.setSection('map')} onReset={game.resetGame} onBuyTaxi={game.buyTaxi} onToggleAccessory={game.toggleExteriorAccessory} />}
      <BottomNav active={game.activeSection} onChange={game.setSection} />
    </> : <CitySetup onStart={game.initializeCompany} />}
  </div>
}
